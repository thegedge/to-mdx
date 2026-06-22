import { writeFile } from "node:fs/promises";
import { orderedSlideArchives } from "./extract/document.ts";
import type { Presentation } from "./model.ts";
import type { Registry, RegistryEntry } from "./registry.ts";
import { typeIds, typeName } from "./type_ids.ts";

export interface DebugDump {
  objectCount: number;
  typeCounts: Record<string, number>;
  warnings: string[];
  presentation: Presentation;
}

/**
 * Serializes the decoded structure to JSON so a user with a real `.key` file can
 * share back what we extracted. bigint values are stringified.
 */
export async function writeDebugDump(
  dumpPath: string,
  registry: Registry,
  presentation: Presentation,
  warnings: string[],
): Promise<void> {
  const dump: DebugDump = {
    objectCount: registry.size,
    typeCounts: registry.typeCounts(),
    warnings,
    presentation,
  };

  await writeFile(dumpPath, JSON.stringify(dump, replaceBigInt));
  console.log(`🐛 Wrote Keynote debug dump to ${dumpPath}`);
}

function replaceBigInt(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

interface RawObject {
  id: string;
  type: number;
  typeName?: string;
  message: unknown;
}

const RAW_DUMP_CAP = 1000;

/**
 * Parses a `KEYNOTE_DEBUG_RAW_SLIDES`-style spec (comma-separated 1-based slide
 * numbers in presentation order) into sorted, de-duped 0-based indices. Returns
 * undefined when the spec is unset or has no valid numbers, so callers fall back
 * to the default first-three sampling.
 */
export function parseRawSlideSelection(spec: string | undefined): number[] | undefined {
  if (spec === undefined) return undefined;
  const indices = spec
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 1)
    .map((value) => value - 1);
  if (indices.length === 0) return undefined;
  return [...new Set(indices)].sort((a, b) => a - b);
}

/**
 * Writes the RAW decoded protobuf objects (bigints stringified) for a set of
 * slides plus everything they transitively reference, and for the package
 * metadata and every image. By default it samples the first three slides; pass a
 * `slideSpec` (see `parseRawSlideSelection`) to target specific 1-based slide
 * numbers instead — e.g. to capture a particular table slide's archive. This is
 * the ground-truth escape hatch: it lets us confirm field paths
 * (image→data→fileName, placeholder kinds, etc.) against a real file without
 * guessing.
 */
export async function writeRawDump(dumpPath: string, registry: Registry, slideSpec?: string): Promise<void> {
  const wanted = new Set<bigint>();

  // Slides in PRESENTATION order (real content), not registry order (which
  // surfaces master/layout templates holding placeholder default text). A spec
  // selects exact 1-based slide numbers; otherwise we take the first three.
  const ordered = orderedSlideArchives(registry);
  const selection = parseRawSlideSelection(slideSpec);
  const slides = selection
    ? selection.map((index) => ordered[index]).filter((entry): entry is RegistryEntry => entry !== undefined)
    : ordered.slice(0, 3);
  for (const slide of slides) collectTransitive(slide.id, registry, wanted);

  const metadataTypes = new Set<number>([...typeIds("PackageMetadata"), ...typeIds("PasteboardMetadata")]);
  for (const entry of registry.entriesOfTypes(metadataTypes)) wanted.add(entry.id);
  for (const entry of registry.entriesOfTypes(typeIds("ImageArchive"))) wanted.add(entry.id);

  const objects: RawObject[] = [];
  for (const id of wanted) {
    const entry = registry.get(id);
    if (entry) objects.push(toRawObject(entry));
  }

  await writeFile(dumpPath, JSON.stringify(objects, replaceBigInt));
  console.log(`🐛 Wrote ${objects.length} raw Keynote objects to ${dumpPath}`);
}

function toRawObject(entry: RegistryEntry): RawObject {
  return { id: entry.id.toString(), type: entry.type, typeName: typeName(entry.type), message: entry.message };
}

/** Breadth-first closure over every object reference reachable from a root. */
function collectTransitive(rootId: bigint, registry: Registry, into: Set<bigint>): void {
  const queue: bigint[] = [rootId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || into.has(id)) continue;
    const entry = registry.get(id);
    if (!entry) continue;
    into.add(id);
    if (into.size >= RAW_DUMP_CAP) return;
    for (const referenced of referencedIdentifiers(entry.message)) {
      if (!into.has(referenced)) queue.push(referenced);
    }
  }
}

/** Every `{ identifier: bigint }` (TSP.Reference / DataReference) nested in a message. */
function referencedIdentifiers(message: unknown): bigint[] {
  const ids: bigint[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === "object") {
      const identifier = (value as { identifier?: unknown }).identifier;
      if (typeof identifier === "bigint") ids.push(identifier);
      for (const nested of Object.values(value)) visit(nested);
    }
  };
  visit(message);
  return ids;
}
