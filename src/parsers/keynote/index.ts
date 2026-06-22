import * as fs from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import dedent from "dedent-js";
import { generateFrontmatter } from "../../generators/mdx.ts";
import type { Options } from "../../parsers.ts";
import { decodeKeynote } from "./decode.ts";
import { writeDebugDump, writeRawDump } from "./debug.ts";
import { buildPresentation } from "./extract/document.ts";
import type { Presentation } from "./model.ts";
import { formatDate, generateFilename, sanitizeFilename, titleFromPath } from "./metadata.ts";
import { typeIds } from "./type_ids.ts";
import { presentationToMdx } from "./render.ts";

export async function parse(outputRoot: string, presentationFile: string, options: Options = {}): Promise<void> {
  const { registry, dataFiles, warnings } = await decodeKeynote(presentationFile);
  console.log(`🔍 Decoded ${registry.size} Keynote objects`);

  const fallbackTitle = titleFromPath(presentationFile);
  const presentation = buildPresentation(registry, fallbackTitle, dataFiles);
  const title = presentation.title;
  console.log(`🔍 Presentation title: ${title} (${presentation.slides.length} slides)`);

  const date = await resolveDate(presentationFile);
  const basename = `${formatDate(date)}_${sanitizeFilename(title)}`;

  const allWarnings = [...warnings, ...registry.warnings];

  const imageArchives = registry.entriesOfTypes(typeIds("ImageArchive")).length;
  const placedImages = presentation.slides.reduce((total, slide) => total + slide.images.length, 0);
  if (imageArchives > 0 && placedImages < imageArchives) {
    const unlinked = imageArchives - placedImages;
    allWarnings.push(
      `Placed ${placedImages} of ${imageArchives} images; ${unlinked} could not be linked to a slide (container lost to a partial chunk)`,
    );
  }

  const dumpPath = options.dumpKeynote ?? process.env.KEYNOTE_DEBUG_DUMP;
  if (dumpPath) {
    await writeDebugDump(dumpPath, registry, presentation, allWarnings);
  }

  const rawDumpPath = options.dumpKeynoteRaw ?? process.env.KEYNOTE_DEBUG_RAW;
  if (rawDumpPath) {
    await writeRawDump(rawDumpPath, registry);
  }

  await copyImages(presentation, dataFiles, basename, outputRoot);

  const metadata: Record<string, unknown> = { title };
  const frontmatter = generateFrontmatter(metadata);
  const content = presentationToMdx(presentation, basename);

  const relativeOutputFile = path.join("src/pages/presentations", generateFilename(date, title));
  const outputFile = path.join(outputRoot, relativeOutputFile);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(
    outputFile,
    dedent`
      ${frontmatter}
      ${content}
    ` + "\n",
  );

  if (allWarnings.length > 0) {
    console.warn(`⚠️  ${allWarnings.length} warning(s) while parsing Keynote file (first 10):`);
    for (const warning of allWarnings.slice(0, 10)) console.warn(`   - ${warning}`);
  }

  console.log("");
  console.log(`✅ ${relativeOutputFile}`);
}

async function resolveDate(presentationFile: string): Promise<Date> {
  // Modern Keynote files expose no reliable creation date in the decoded
  // archive, so fall back to the file's modification time (degrade, don't throw).
  const stats = await stat(presentationFile);
  console.warn(`⚠️  No presentation date in Keynote metadata; using file mtime ${formatDate(stats.mtime)}`);
  return stats.mtime;
}

async function copyImages(
  presentation: Presentation,
  dataFiles: Map<string, Uint8Array>,
  basename: string,
  outputRoot: string,
): Promise<void> {
  const imagesDir = path.join(outputRoot, "src/static/img/presentations", basename);

  const fileNames = new Set<string>();
  for (const slide of presentation.slides) {
    for (const image of slide.images) fileNames.add(image.fileName);
    for (const video of slide.videos) fileNames.add(video);
  }
  if (fileNames.size === 0) return;

  await mkdir(imagesDir, { recursive: true });

  for (const fileName of fileNames) {
    const bytes = dataFiles.get(`Data/${fileName}`) ?? dataFiles.get(fileName);
    if (!bytes) {
      console.warn(`⚠️  Image data not found in archive: ${fileName}`);
      continue;
    }
    const target = path.join(imagesDir, fileName);
    if (fs.existsSync(target)) continue;
    await writeFile(target, bytes);
  }
}
