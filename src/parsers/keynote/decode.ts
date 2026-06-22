import { readFile } from "node:fs/promises";
import { KeynoteArchives, dechunk, isIwaFile, splitObjectsAs, uncompress, unzip } from "keynote-archives";
import { Registry } from "./registry.ts";

export interface DecodedArchive {
  registry: Registry;
  /** Non-IWA zip entries, keyed by their full name (e.g. `Data/image-1.png`). */
  dataFiles: Map<string, Uint8Array>;
  warnings: string[];
  /**
   * Sorted, de-duplicated names of `.iwa` entries that had at least one chunk
   * only partially decode (e.g. `Index/Slide-12.iwa`). Tells the user which
   * slides/metadata are affected by the loss.
   */
  partialEntries: string[];
}

const PARTIAL_DECODE = /Error while parsing/i;

/**
 * Reads a `.key` file, decompresses every `Index/*.iwa` Snappy/Protobuf stream,
 * and registers each decoded object. Per-IWA decode failures are collected as
 * warnings instead of aborting the whole document.
 */
export async function decodeKeynote(filePath: string): Promise<DecodedArchive> {
  const data = new Uint8Array(await readFile(filePath));
  const registry = new Registry();
  const dataFiles = new Map<string, Uint8Array>();
  const warnings: string[] = [];

  let totalChunks = 0;
  let partialChunks = 0;
  const partialEntryNames = new Set<string>();

  // `splitObjectsAs` reports unrecoverable per-chunk parse failures by writing to
  // console and abandoning the rest of that chunk (a known limitation against
  // newer Keynote). Capture and count those instead of letting them spam stderr,
  // then surface a single summary. Console is always restored in `finally`.
  const original = { error: console.error, log: console.log };
  let chunkFailed = false;
  const capture = (...args: unknown[]): void => {
    if (PARTIAL_DECODE.test(args.map(String).join(" "))) chunkFailed = true;
  };
  console.error = capture;
  console.log = capture;

  try {
    for await (const entry of unzip(data)) {
      if (!isIwaFile(entry.name)) {
        dataFiles.set(entry.name, entry.data);
        continue;
      }

      try {
        for await (const snappyChunk of dechunk(entry.data)) {
          const chunk = await uncompress(snappyChunk.data);
          totalChunks += 1;
          chunkFailed = false;
          for await (const object of splitObjectsAs(chunk, KeynoteArchives)) {
            registry.add(object);
          }
          if (chunkFailed) {
            partialChunks += 1;
            partialEntryNames.add(entry.name);
          }
        }
      } catch (error) {
        warnings.push(`Failed to decode ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    console.error = original.error;
    console.log = original.log;
  }

  const summary = partialDecodeWarning(partialChunks, totalChunks);
  if (summary) warnings.push(summary);

  const partialEntries = sortPartialEntries(partialEntryNames);

  return { registry, dataFiles, warnings, partialEntries };
}

/** Sorted, de-duplicated `.iwa` entry names that had at least one partial chunk. */
export function sortPartialEntries(names: Iterable<string>): string[] {
  return [...new Set(names)].sort();
}

/** Single human-readable summary of how many .iwa chunks failed to fully decode. */
export function partialDecodeWarning(partialChunks: number, totalChunks: number): string | null {
  if (partialChunks <= 0) return null;
  return `⚠️  ${partialChunks} of ${totalChunks} .iwa chunks only partially decoded (library limitation; some content may be missing)`;
}

/** Lists the `.iwa` components affected by partial decoding, so the user knows what is lost. */
export function partialEntriesWarning(partialEntries: string[]): string | null {
  if (partialEntries.length === 0) return null;
  return `Partial .iwa components: ${partialEntries.join(", ")}`;
}
