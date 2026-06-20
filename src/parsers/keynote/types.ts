import type {
  KNArchives,
  TSDArchives,
  TSPArchiveMessages,
  TSPMessages,
  TSWPArchives,
} from "keynote-archives";

/**
 * TSP object-type identifiers, taken from the `KeynoteArchives` registry map in
 * `keynote-archives/lib/generated/index.d.ts`. These are version-dependent and
 * reverse-engineered; treat any lookup that misses as a soft failure.
 */
export const KeynoteType = {
  documentArchive: 1,
  showArchive: 2,
  slideNodeArchive: 4,
  slideArchive: 5,
  slideArchiveAlt: 6,
  placeholderArchive: 7,
  placeholderArchiveAlt: 12,
  noteArchive: 15,
  storageArchive: 2001,
  storageArchiveAlt: 2005,
  shapeInfoArchive: 2011,
  shapeArchive: 3004,
  imageArchive: 3005,
  movieArchive: 3007,
  groupArchive: 3008,
  tableInfoArchive: 6000,
  packageMetadata: 11006,
} as const;

export type Reference = TSPMessages.Reference;
export type DataReference = TSPMessages.DataReference;
export type DocumentArchive = KNArchives.DocumentArchive;
export type ShowArchive = KNArchives.ShowArchive;
export type SlideNodeArchive = KNArchives.SlideNodeArchive;
export type SlideArchive = KNArchives.SlideArchive;
export type PlaceholderArchive = KNArchives.PlaceholderArchive;
export type NoteArchive = KNArchives.NoteArchive;
export type ShapeInfoArchive = TSWPArchives.ShapeInfoArchive;
export type StorageArchive = TSWPArchives.StorageArchive;
export type ImageArchive = TSDArchives.ImageArchive;
export type MovieArchive = TSDArchives.MovieArchive;
export type GroupArchive = TSDArchives.GroupArchive;
export type PackageMetadata = TSPArchiveMessages.PackageMetadata;
export type DataInfo = TSPArchiveMessages.DataInfo;

/**
 * `KN.PlaceholderArchive.Kind` discriminator values (proto field 2). Mirrored as
 * plain constants so the extractor can classify a placeholder without importing
 * the library's runtime enum into type-only modules.
 */
export const PlaceholderKind = {
  title: 2,
  body: 3,
  slideNumber: 1,
  object: 4,
} as const;
