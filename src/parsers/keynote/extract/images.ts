import type { SlideImage } from "../model.ts";
import type { Registry, RegistryEntry } from "../registry.ts";
import { typeIds } from "../type_ids.ts";
import type { DataInfo, DataReference, ImageArchive, MovieArchive, PackageMetadata } from "../types.ts";

/**
 * Builds a map from a data object's identifier to its on-disk file name. iWork
 * keeps this in the `datas[]` of the package's metadata object (`PackageMetadata`
 * for documents, `PasteboardMetadata` for clippings); the bytes themselves live
 * in the zip under `Data/<file_name>`.
 *
 * The metadata object's numeric type id is resolved by message name (not
 * hardcoded), and as a final safety net we duck-type *any* decoded object that
 * exposes a `datas[]` array — real files have been seen to carry it under
 * unexpected type ids.
 */
export function buildDataInfoMap(registry: Registry): Map<bigint, string> {
  const map = new Map<bigint, string>();

  const metadataTypes = new Set<number>([...typeIds("PackageMetadata"), ...typeIds("PasteboardMetadata")]);

  for (const entry of registry.allEntries()) {
    const fromKnownType = metadataTypes.has(entry.type);
    const datas = datasOf(entry);
    if (!fromKnownType && datas.length === 0) continue;

    for (const data of datas) {
      const fileName = fileNameForData(data);
      if (fileName) map.set(data.identifier, fileName);
    }
  }

  return map;
}

/** Reads `datas[]` off an entry whether it decoded as the expected type or not. */
function datasOf(entry: RegistryEntry): DataInfo[] {
  const datas = (entry.message as Partial<PackageMetadata> | undefined)?.datas;
  return Array.isArray(datas) ? datas : [];
}

/**
 * PRIMARY data→filename resolver, built straight from the zip's non-IWA entries.
 * Every `Data/` asset is named `<originalname>-<id>.<ext>`, where the trailing
 * number group before the extension is exactly the `DataReference.identifier`
 * referenced by image/movie drawables. We key by that id so resolution never
 * depends on the `PackageMetadata` object, which the decoder routinely drops.
 *
 * Keyed by `number` (the id fits comfortably): callers convert the bigint
 * `identifier` explicitly. Thumbnails (`-small-<id>`) and render previews
 * (`st-`/`mt-<uuid>-<id>`) follow the same rule, so the map simply contains
 * every asset; drawables only ever look up their full-asset `data.identifier`.
 */
export function buildDataFileNameMap(dataFiles: Map<string, Uint8Array>): Map<number, string> {
  const map = new Map<number, string>();
  for (const fullName of dataFiles.keys()) {
    if (!fullName.startsWith("Data/")) continue;
    const baseName = fullName.slice("Data/".length);
    const match = /-(\d+)\.[^.]+$/.exec(baseName);
    if (!match) continue;
    map.set(Number(match[1]), baseName);
  }
  return map;
}

export function imageFromArchive(
  image: ImageArchive,
  dataFileNames: Map<number, string>,
  dataInfo: Map<bigint, string>,
  altText: string,
): SlideImage | null {
  const fileName = resolveDataFileName(
    [image.data, image.originalData, image.adjustedImageData, image.enhancedImageData],
    dataFileNames,
    dataInfo,
  );
  if (!fileName) return null;

  return { fileName, altText: altText || "image" };
}

/** Resolves a movie/video drawable to its backing data file name, if any. */
export function videoFileFromArchive(
  movie: MovieArchive,
  dataFileNames: Map<number, string>,
  dataInfo: Map<bigint, string>,
): string | null {
  return resolveDataFileName([movie.movieData, movie.importedAuxiliaryMovieData], dataFileNames, dataInfo);
}

function resolveDataFileName(
  refs: Array<DataReference | undefined>,
  dataFileNames: Map<number, string>,
  dataInfo: Map<bigint, string>,
): string | null {
  for (const ref of refs) {
    if (ref?.identifier === undefined) continue;
    const primary = dataFileNames.get(Number(ref.identifier));
    if (primary) return primary;
    const fallback = dataInfo.get(ref.identifier);
    if (fallback) return fallback;
  }
  return null;
}

function fileNameForData(data: DataInfo): string | undefined {
  const name = data.fileName ?? data.preferredFileName;
  return name && name.trim() ? name : undefined;
}
