/* eslint-disable @typescript-eslint/prefer-for-of */
import * as fs from "fs";
import * as path from "path";
import * as yauzl from "yauzl";
import { generateFrontmatter } from "../generators/mdx.ts";
import { infer } from "../page-dimensions.ts";
import type { Options } from "../parsers.ts";
import { Styles } from "../styles.ts";
import type { ParseContext } from "./base_element.ts";
import { BaseElement } from "./base_element.ts";

import dedent from "dedent-js";
import "./open-document/all_parsers.ts"; // Register all of the parsers

export async function parse(outputRoot: string, presentationFile: string, options: Options = {}): Promise<void> {
  let contentDoc: string | null = null;
  let metaDoc: string | null = null;
  let stylesDoc: string | null = null;

  const docs = await extractXmlDocuments(presentationFile);
  contentDoc = docs.content;
  metaDoc = docs.meta;
  stylesDoc = docs.styles;

  if (!contentDoc || !metaDoc || !stylesDoc) {
    throw new Error("Error: Could not find content.xml, meta.xml, or styles.xml in the presentation file.");
  }

  const contentDocument = BaseElement.parseXml(contentDoc);
  const metaDocument = BaseElement.parseXml(metaDoc);
  const stylesDocument = BaseElement.parseXml(stylesDoc);

  const pageDimensions = infer(contentDocument, stylesDocument);
  if (pageDimensions) {
    console.log(`🔍 Found page dimensions: ${pageDimensions.width}cm x ${pageDimensions.height}cm`);
  }

  // TODO avoid this cast, but find a way so that styles is always in the context
  const metadata: Record<string, unknown> = {};
  BaseElement.parse(metaDocument.documentElement, metadata as unknown as ParseContext);

  const title = await getPresentationTitle(metadata);
  const date = await getPresentationDate(metadata);
  const basename = `${formatDate(date)}_${sanitizeFilename(title)}`;

  const context: ParseContext = {
    metadata,
    basename,
    options,
    pageDimensions: pageDimensions || undefined,
    styles: new Styles(),
  };

  await extractImages(presentationFile, basename, outputRoot);

  const frontmatter = generateFrontmatter(metadata);

  BaseElement.parse(stylesDocument.documentElement, context);
  const content = BaseElement.parse(contentDocument.documentElement, context);

  const relativeOutputFile = path.join("src/pages/presentations", generateFilename(date, title));
  const outputFile = path.join(outputRoot, relativeOutputFile);

  // Ensure directory exists
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(
    outputFile,
    dedent`
      ${frontmatter}
      ${content?.toMdx() ?? ""}
    `,
  );

  console.log("");
  console.log(`✅ ${relativeOutputFile}`);
}

async function extractXmlDocuments(presentationFile: string): Promise<{
  content: string | null;
  meta: string | null;
  styles: string | null;
}> {
  const docs = { content: null as string | null, meta: null as string | null, styles: null as string | null };

  return await new Promise((resolve, reject) => {
    yauzl.open(presentationFile, { lazyEntries: true }, (err, zipFile) => {
      if (err) {
        reject(err);
        return;
      }

      zipFile.on("entry", (entry: yauzl.Entry) => {
        if (entry.fileName !== "content.xml" && entry.fileName !== "meta.xml" && entry.fileName !== "styles.xml") {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (err, readStream) => {
          if (err) {
            reject(err);
            return;
          }

          let content = "";
          readStream.on("data", (chunk: Buffer) => {
            content += chunk.toString();
          });

          readStream.once("end", () => {
            if (entry.fileName === "content.xml") docs.content = content;
            else if (entry.fileName === "meta.xml") docs.meta = content;
            else if (entry.fileName === "styles.xml") docs.styles = content;
            zipFile.readEntry();
          });

          readStream.on("error", reject);
        });
      });

      zipFile.once("error", reject);
      zipFile.once("end", () => {
        resolve(docs);
      });

      zipFile.readEntry();
    });
  });
}

async function extractImages(zipFileName: string, basename: string, projectRoot: string): Promise<void> {
  const imagesDir = path.join(projectRoot, "src/static/img/presentations", basename);
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    yauzl.open(zipFileName, { lazyEntries: true }, (err, zipFile) => {
      if (err) {
        reject(err);
        return;
      }

      zipFile.on("entry", (entry: yauzl.Entry) => {
        if (!entry.fileName.startsWith("Pictures/") || entry.fileName.endsWith(".svm")) {
          zipFile.readEntry();
          return;
        }

        const filename = entry.fileName.replace(/^Pictures\//, "");
        const targetPath = path.join(imagesDir, filename);
        if (fs.existsSync(targetPath)) {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) {
            reject(streamErr);
            return;
          }

          const writeStream = fs.createWriteStream(targetPath);
          readStream.pipe(writeStream);

          writeStream.once("error", reject);
          writeStream.once("close", () => {
            zipFile.readEntry();
            resolve();
          });
        });
      });

      zipFile.on("end", () => {
        resolve();
      });

      zipFile.on("error", reject);
      zipFile.readEntry();
    });
  });
}

async function getPresentationTitle(metadata: Record<string, unknown>): Promise<string> {
  const title = metadata.title;
  if (typeof title === "string" && title.trim()) {
    console.log(`🔍 Found presentation title: ${title}`);
    return title;
  }

  // In a real implementation, you might want to prompt for user input
  // For now, we'll use a default or throw an error
  throw new Error("No presentation title found in metadata");
}

async function getPresentationDate(metadata: Record<string, unknown>): Promise<Date> {
  const presentationDate = metadata.presentation_date;
  if (typeof presentationDate === "string") {
    const parsedDate = new Date(presentationDate);
    if (!isNaN(parsedDate.getTime())) {
      console.log(`🔍 Found presentation date: ${presentationDate}`);
      return parsedDate;
    }
  }

  const date = metadata.date;
  if (date instanceof Date) {
    console.log(`🔍 Found presentation date: ${date.toISOString().split("T")[0]}`);
    return date;
  }

  if (typeof date === "string") {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) {
      console.log(`🔍 Found presentation date: ${date}`);
      return parsedDate;
    }
  }

  throw new Error("⚠️  No presentation date found in metadata");
}

function sanitizeFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_");
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function generateFilename(date: Date, title: string): string {
  const basename = `${formatDate(date)}_${sanitizeFilename(title)}`;
  return `${basename}.mdx`;
}
