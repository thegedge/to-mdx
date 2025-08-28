import { parse as parseOpenDocument } from "./parsers/open_document.ts";

export interface Options {
  useHeuristics?: boolean;
}

export async function parse(outputRoot: string, filePath: string, options: Options): Promise<void> {
  if (filePath.endsWith(".odp")) {
    await parseOpenDocument(outputRoot, filePath, options);
  } else {
    throw new Error(`Unknown file type: ${filePath}`);
  }
}
