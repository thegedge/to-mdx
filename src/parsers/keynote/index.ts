import * as fs from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import JSZip from "jszip";
import { formatDate, generateFilename, generateMetadataExports, sanitizeFilename, titleFromPath } from "../../generators/mdx.ts";
import type { Options } from "../../parsers.ts";
import { decodeKeynote, partialEntriesWarning } from "./decode.ts";
import { buildPresentation } from "./extract/document.ts";
import { convertPdfDataFiles } from "./extract/pdf.ts";
import { buildDataSourceMap, distinctImageFileNames, imageCoverageWarning } from "./extract/images.ts";
import type { Presentation } from "./model.ts";
import { typeIds } from "./type_ids.ts";
import { assembleMdxDocument, presentationToMdx } from "./render.ts";

export async function parse(outputRoot: string, presentationFile: string, options: Options = {}): Promise<void> {
  const { registry, dataFiles: rawDataFiles, warnings, partialEntries } = await decodeKeynote(presentationFile);
  console.log(`🔍 Decoded ${registry.size} Keynote objects`);

  // PDF assets (pasted vector art) can't render in `<img>`, so convert them to
  // SVG up front; everything downstream then sees the `.svg` name.
  const dataFiles = convertPdfDataFiles(rawDataFiles);

  const fallbackTitle = titleFromPath(presentationFile);
  const presentation = buildPresentation(registry, fallbackTitle, dataFiles, options.useHeuristics ?? false);
  const title = presentation.title;
  console.log(`🔍 Presentation title: ${title} (${presentation.slides.length} slides)`);

  const date = await resolveDate(presentationFile);
  const basename = `${formatDate(date)}_${sanitizeFilename(title)}`;

  const allWarnings = [...warnings, ...registry.warnings];

  const partialWarning = partialEntriesWarning(partialEntries);
  if (partialWarning) {
    allWarnings.push(partialWarning);
  }

  const totalOccurrences = registry.entriesOfTypes(typeIds("ImageArchive")).length;
  const placedOccurrences = presentation.slides.reduce((total, slide) => total + slide.images.length, 0);
  const placedDistinct = new Set(presentation.slides.flatMap((slide) => slide.images.map((image) => image.fileName)))
    .size;
  const totalDistinct = distinctImageFileNames(registry, dataFiles).size;
  const coverageWarning = imageCoverageWarning({ placedOccurrences, totalOccurrences, placedDistinct, totalDistinct });
  if (coverageWarning) {
    allWarnings.push(coverageWarning);
  }

  await copyImages(presentation, dataFiles, basename, outputRoot);

  const metadata: Record<string, unknown> = { title, imageRoot: `/img/presentations/${basename}` };
  // Export the deck's native pixel size so the consuming site can size/scale slides
  // off it (aspect ratio = width / height); only when the deck declares a size.
  if (presentation.slideSize) {
    metadata.width = Math.round(presentation.slideSize.width);
    metadata.height = Math.round(presentation.slideSize.height);
  }
  const metadataExports = generateMetadataExports(metadata);
  const content = presentationToMdx(presentation);

  const relativeOutputFile = path.join("src/pages/presentations", generateFilename(date, title));
  const outputFile = path.join(outputRoot, relativeOutputFile);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, assembleMdxDocument(metadataExports, content));

  if (allWarnings.length > 0) {
    console.warn(`⚠️  ${allWarnings.length} warning(s) while parsing Keynote file (first 10):`);
    for (const warning of allWarnings.slice(0, 10)) console.warn(`   - ${warning}`);
  }

  console.log("");
  console.log(`✅ ${relativeOutputFile}`);
}

async function resolveDate(presentationFile: string): Promise<Date> {
  // The deck has no creation date in its decoded archive, but the `.key` zip
  // preserves each entry's Keynote save time — the newest entry is the last save
  // (the real presentation date), and it survives copying/downloading the file
  // (which only resets the file's own mtime). Fall back to the file mtime when the
  // archive can't be read.
  const fromArchive = await archiveDate(presentationFile);
  if (fromArchive) {
    return fromArchive;
  }

  const stats = await stat(presentationFile);
  console.warn(`⚠️  No date in Keynote archive; using file mtime ${formatDate(stats.mtime)}`);
  return stats.mtime;
}

/** The newest zip-entry timestamp in a `.key` (its last Keynote save), or undefined. */
async function archiveDate(presentationFile: string): Promise<Date | undefined> {
  try {
    const zip = await JSZip.loadAsync(await readFile(presentationFile));
    let latest: Date | undefined;
    for (const entry of Object.values(zip.files)) {
      if (entry.date && (latest === undefined || entry.date > latest)) {
        latest = entry.date;
      }
    }
    return latest;
  } catch {
    return undefined;
  }
}

async function copyImages(
  presentation: Presentation,
  dataFiles: Map<string, Uint8Array>,
  basename: string,
  outputRoot: string,
): Promise<void> {
  const imagesDir = path.join(outputRoot, "src/static/img/presentations", basename);

  // Only assets actually referenced by a slide are extracted; unreferenced images
  // (resolvable but linked to no slide) are dropped, not copied.
  const fileNames = new Set<string>();
  for (const slide of presentation.slides) {
    for (const image of slide.images) fileNames.add(image.fileName);
    for (const video of slide.videos) fileNames.add(video.fileName);
    if (slide.background) {
      fileNames.add(slide.background);
    }
  }
  if (fileNames.size === 0) {
    return;
  }

  await mkdir(imagesDir, { recursive: true });

  // The `src` names exposed in the MDX have the `-<id>` suffix stripped; map each
  // back to its `Data/` source so the copied file's name matches the reference.
  const sources = buildDataSourceMap(dataFiles);

  for (const fileName of fileNames) {
    const source = sources.get(fileName) ?? fileName;
    const bytes = dataFiles.get(`Data/${source}`) ?? dataFiles.get(source) ?? dataFiles.get(fileName);
    if (!bytes) {
      console.warn(`⚠️  Image data not found in archive: ${fileName}`);
      continue;
    }
    const target = path.join(imagesDir, fileName);
    if (fs.existsSync(target)) {
      continue;
    }
    await writeFile(target, bytes);
  }
}
