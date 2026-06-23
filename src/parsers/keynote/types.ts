import type {
  KNArchives,
  TSDArchives,
  TSPArchiveMessages,
  TSPMessages,
  TSTArchives,
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
  maskArchive: 3006,
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
export type ShapeArchive = TSDArchives.ShapeArchive;
export type ShapeStyleArchive = TSDArchives.ShapeStyleArchive;
export type ShapeStylePropertiesArchive = TSDArchives.ShapeStylePropertiesArchive;
export type StrokeArchive = TSDArchives.StrokeArchive;
export type StrokePatternArchive = TSDArchives.StrokePatternArchive;
export type LineEndArchive = TSDArchives.LineEndArchive;
export type FillArchive = TSDArchives.FillArchive;
export type SlideStyleArchive = KNArchives.SlideStyleArchive;
export type SlideStylePropertiesArchive = KNArchives.SlideStylePropertiesArchive;
export type GeometryArchive = TSDArchives.GeometryArchive;
export type BezierPathSourceArchive = TSDArchives.BezierPathSourceArchive;
export type Path = TSPMessages.Path;
export type PathElement = TSPMessages.Path_Element;
export type StorageArchive = TSWPArchives.StorageArchive;
export type ParagraphStyleArchive = TSWPArchives.ParagraphStyleArchive;
export type CharacterStyleArchive = TSWPArchives.CharacterStyleArchive;
export type Color = TSPMessages.Color;
export type ImageArchive = TSDArchives.ImageArchive;
export type MaskArchive = TSDArchives.MaskArchive;
export type MovieArchive = TSDArchives.MovieArchive;
export type GroupArchive = TSDArchives.GroupArchive;
export type TableInfoArchive = TSTArchives.TableInfoArchive;
export type TableModelArchive = TSTArchives.TableModelArchive;
export type TableDataList = TSTArchives.TableDataList;
export type Tile = TSTArchives.Tile;
export type TileRowInfo = TSTArchives.TileRowInfo;
export type RichTextPayloadArchive = TSTArchives.RichTextPayloadArchive;
export type CellStyleArchive = TSTArchives.CellStyleArchive;
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
