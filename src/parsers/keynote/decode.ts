import { readFile } from "node:fs/promises";
import { KeynoteArchives, dechunk, isIwaFile, splitObjectsAs, uncompress, unzip } from "keynote-archives";
import { Registry } from "./registry.ts";

export interface DecodedArchive {
  registry: Registry;
  /** Non-IWA zip entries, keyed by their full name (e.g. `Data/image-1.png`). */
  dataFiles: Map<string, Uint8Array>;
  warnings: string[];
}

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

  for await (const entry of unzip(data)) {
    if (!isIwaFile(entry.name)) {
      dataFiles.set(entry.name, entry.data);
      continue;
    }

    try {
      for await (const snappyChunk of dechunk(entry.data)) {
        const chunk = await uncompress(snappyChunk.data);
        for await (const object of splitObjectsAs(chunk, KeynoteArchives)) {
          registry.add(object);
        }
      }
    } catch (error) {
      warnings.push(`Failed to decode ${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { registry, dataFiles, warnings };
}
