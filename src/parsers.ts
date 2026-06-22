import { parse as parseKeynote } from "./parsers/keynote/index.ts";
import { parse as parseOpenDocument } from "./parsers/open_document.ts";

export interface Options {
  useHeuristics?: boolean;
  useLlmDetection?: boolean;
}

export async function parse(outputRoot: string, filePath: string, options: Options): Promise<void> {
  if (filePath.endsWith(".odp")) {
    await parseOpenDocument(outputRoot, filePath, options);
  } else if (filePath.endsWith(".key")) {
    await parseKeynote(outputRoot, filePath, options);
  } else {
    throw new Error(`Unknown file type: ${filePath}`);
  }
}
