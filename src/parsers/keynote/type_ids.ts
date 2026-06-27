import { KeynoteArchives } from "keynote-archives";

/**
 * Resolves TSP object-type ids by their stable protobuf message *name* using the
 * library's own type→constructor registry (`KeynoteArchives`), rather than
 * hardcoding the version-dependent numeric ids. Several names map to more than
 * one id (e.g. `SlideArchive` is 5 and 6), so every lookup returns a set.
 *
 * If the runtime registry ever stops exposing a name, the hardcoded fallbacks
 * below keep us working — they are a last resort, not the source of truth.
 */
export type KeynoteTypeName =
  | "DocumentArchive"
  | "ShowArchive"
  | "SlideNodeArchive"
  | "SlideArchive"
  | "PlaceholderArchive"
  | "NoteArchive"
  | "ShapeInfoArchive"
  | "StorageArchive"
  | "ImageArchive"
  | "MovieArchive"
  | "MaskArchive"
  | "GroupArchive"
  | "TableInfoArchive"
  | "PackageMetadata"
  | "PasteboardMetadata";

/** Last-resort numeric ids, used only when the runtime registry omits a name. */
const FALLBACK_IDS: Record<KeynoteTypeName, number[]> = {
  DocumentArchive: [1],
  ShowArchive: [2],
  SlideNodeArchive: [4],
  SlideArchive: [5, 6],
  PlaceholderArchive: [7, 12],
  NoteArchive: [15],
  StorageArchive: [2001, 2005],
  ShapeInfoArchive: [2011],
  ImageArchive: [3005],
  MaskArchive: [3006],
  MovieArchive: [3007],
  GroupArchive: [3008],
  TableInfoArchive: [6000],
  PackageMetadata: [11006],
  PasteboardMetadata: [11007],
};

function buildNameIndex(): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();
  for (const [idText, constructor] of Object.entries(KeynoteArchives as Record<string, unknown>)) {
    const typeName = (constructor as { typeName?: string } | undefined)?.typeName;
    if (!typeName) {
      continue;
    }

    // typeName is the fully-qualified proto name, e.g. "TSP.PackageMetadata".
    const shortName = typeName.slice(typeName.lastIndexOf(".") + 1);
    const id = Number(idText);
    if (!Number.isFinite(id)) {
      continue;
    }

    let ids = index.get(shortName);
    if (!ids) {
      ids = new Set<number>();
      index.set(shortName, ids);
    }
    ids.add(id);
  }
  return index;
}

const NAME_INDEX = buildNameIndex();

/** Every type id whose message constructor carries the given proto message name. */
export function typeIds(name: KeynoteTypeName): Set<number> {
  const resolved = NAME_INDEX.get(name);
  if (resolved && resolved.size > 0) {
    return resolved;
  }
  return new Set(FALLBACK_IDS[name]);
}

/** The proto message name for a numeric type id, for debug output. */
export function typeName(id: number): string | undefined {
  return (KeynoteArchives as Record<string, { typeName?: string } | undefined>)[id]?.typeName;
}

export function isType(typeId: number, name: KeynoteTypeName): boolean {
  return typeIds(name).has(typeId);
}
