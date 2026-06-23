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

export interface ImageCoverage {
  /** Total `slide.images` placements across the presentation. */
  placedOccurrences: number;
  /** Total `ImageArchive` objects in the registry. */
  totalOccurrences: number;
  /** Distinct file names actually placed on slides. */
  placedDistinct: number;
  /** Distinct resolvable file names across all `ImageArchive` objects. */
  totalDistinct: number;
}

/**
 * Reports image coverage in both occurrence and distinct terms. Distinct counts
 * reassure that no unique image was lost even when reused occurrences (animation
 * builds) go unplaced. Returns null when every occurrence is placed.
 */
export function imageCoverageWarning(coverage: ImageCoverage): string | null {
  const { placedOccurrences, totalOccurrences, placedDistinct, totalDistinct } = coverage;
  if (totalOccurrences <= 0 || placedOccurrences >= totalOccurrences) return null;

  const base = `Placed ${placedOccurrences} of ${totalOccurrences} image occurrences (${placedDistinct} of ${totalDistinct} distinct images)`;
  const unlinked = totalOccurrences - placedOccurrences;
  if (unlinked <= 0) return base;
  return `${base}; ${unlinked} occurrence(s) could not be linked to a slide (container lost to a partial chunk)`;
}

/** Reads `datas[]` off an entry whether it decoded as the expected type or not. */
function datasOf(entry: RegistryEntry): DataInfo[] {
  const datas = (entry.message as Partial<PackageMetadata> | undefined)?.datas;
  return Array.isArray(datas) ? datas : [];
}

/**
 * A single `Data/` asset, split into its on-disk source name and the cleaner
 * display name we expose downstream.
 */
interface DataAsset {
  /** The `DataReference.identifier` parsed from the trailing `-<id>` group. */
  id: number;
  /** The `Data/`-relative name actually present in the zip (`img_percy-4113.jpg`). */
  source: string;
  /** Display name with the `-<id>` suffix stripped (`img_percy.jpg`), deduped on collision. */
  fileName: string;
}

/**
 * SINGLE pure parser of the zip's `Data/` assets, the shared source of truth for
 * both id→filename resolution and filename→bytes extraction. Every asset is named
 * `<base>-<id>.<ext>`, where the trailing number group before the extension is
 * exactly the `DataReference.identifier` referenced by image/movie drawables — so
 * the id is parsed from the *source* name (suffix intact) before we strip it.
 *
 * The exposed `fileName` drops that `-<id>` suffix (`img_percy-4113.jpg` →
 * `img_percy.jpg`) for cleaner MDX `src`s. When two distinct ids would strip to
 * the same display name, BOTH keep their unambiguous `source` name (which carries
 * the unique id) so no asset is silently overwritten or lost. Deterministic:
 * independent of iteration order.
 */
function buildDataAssets(dataFiles: Map<string, Uint8Array>): DataAsset[] {
  const parsed: Array<{ id: number; source: string; display: string }> = [];
  for (const fullName of dataFiles.keys()) {
    if (!fullName.startsWith("Data/")) continue;
    const source = fullName.slice("Data/".length);
    const match = /-(\d+)\.[^.]+$/.exec(source);
    if (!match) continue;
    const display = source.slice(0, match.index) + source.slice(match.index + match[1].length + 1);
    parsed.push({ id: Number(match[1]), source, display });
  }

  const displayCounts = new Map<string, number>();
  for (const asset of parsed) displayCounts.set(asset.display, (displayCounts.get(asset.display) ?? 0) + 1);

  return parsed.map((asset) => ({
    id: asset.id,
    source: asset.source,
    fileName: (displayCounts.get(asset.display) ?? 0) > 1 ? asset.source : asset.display,
  }));
}

/**
 * PRIMARY data→filename resolver, built straight from the zip's non-IWA entries.
 * Keys each asset's `DataReference.identifier` to its (deduped) display file name,
 * so resolution never depends on the `PackageMetadata` object the decoder
 * routinely drops. Thumbnails (`-small-<id>`) and render previews
 * (`st-`/`mt-<uuid>-<id>`) follow the same rule; drawables only ever look up their
 * full-asset `data.identifier`.
 *
 * Keyed by `number` (the id fits comfortably): callers convert the bigint
 * `identifier` explicitly.
 */
export function buildDataFileNameMap(dataFiles: Map<string, Uint8Array>): Map<number, string> {
  const map = new Map<number, string>();
  for (const asset of buildDataAssets(dataFiles)) map.set(asset.id, asset.fileName);
  return map;
}

/**
 * Maps each exposed display file name back to its `Data/`-relative source name, so
 * extraction copies the right bytes under the same name the MDX `src` references.
 * Built from the SAME deduped parse as `buildDataFileNameMap`, guaranteeing the
 * referenced name and the copied file always agree.
 */
export function buildDataSourceMap(dataFiles: Map<string, Uint8Array>): Map<string, string> {
  const map = new Map<string, string>();
  for (const asset of buildDataAssets(dataFiles)) map.set(asset.fileName, asset.source);
  return map;
}

/**
 * Distinct resolvable file names across EVERY `ImageArchive` in the registry,
 * resolved through the same `imageFromArchive` path `buildPresentation` uses.
 * Duplicate occurrences (the deck reuses images across animation-build slides)
 * collapse, so the count reflects unique images, not placements.
 */
export function distinctImageFileNames(registry: Registry, dataFiles: Map<string, Uint8Array>): Set<string> {
  const dataFileNames = buildDataFileNameMap(dataFiles);
  const dataInfo = buildDataInfoMap(registry);

  const names = new Set<string>();
  for (const entry of registry.entriesOfTypes(typeIds("ImageArchive"))) {
    const resolved = imageFromArchive(entry.message as ImageArchive, dataFileNames, dataInfo, "");
    if (resolved) names.add(resolved.fileName);
  }
  return names;
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
