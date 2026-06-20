import type { SlideImage } from "../model.ts";
import type { Registry } from "../registry.ts";
import { KeynoteType } from "../types.ts";
import type { DataInfo, ImageArchive, PackageMetadata } from "../types.ts";

/**
 * Builds a map from a data object's identifier to its on-disk file name. iWork
 * stores this in `PackageMetadata.datas`; the actual bytes live in the zip under
 * `Data/<file_name>`.
 */
export function buildDataInfoMap(registry: Registry): Map<bigint, string> {
  const map = new Map<bigint, string>();

  for (const entry of registry.entriesOfType(KeynoteType.packageMetadata)) {
    const metadata = entry.message as PackageMetadata;
    for (const data of metadata.datas ?? []) {
      const fileName = fileNameForData(data);
      if (fileName) map.set(data.identifier, fileName);
    }
  }

  return map;
}

export function imageFromArchive(image: ImageArchive, dataInfo: Map<bigint, string>, altText: string): SlideImage | null {
  const dataId = image.data?.identifier ?? image.originalData?.identifier;
  if (dataId === undefined) return null;

  const fileName = dataInfo.get(dataId);
  if (!fileName) return null;

  return { fileName, altText: altText || "image" };
}

function fileNameForData(data: DataInfo): string | undefined {
  const name = data.fileName ?? data.preferredFileName;
  return name && name.trim() ? name : undefined;
}
