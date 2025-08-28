import { execSync } from "child_process";
import * as fs from "fs";
import type { Options } from "./parsers.ts";
import { parse } from "./parsers.ts";

function showHelp(programName: string): void {
  console.log(`Usage: ${programName} [options] <presentation_file>`);
  console.log("");
  console.log("Options:");
  console.log("  --use-heuristics    Use heuristics to determine classnames and eliminate positioning divs");
  console.log("  -h, --help         Show this help message");
}

export async function main(argv: string[]): Promise<void> {
  const options: Options = {};
  const args: string[] = [];

  for (const arg of argv) {
    if (arg === "--use-heuristics") {
      options.useHeuristics = true;
    } else if (arg === "-h" || arg === "--help") {
      showHelp(process.argv[1]);
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      args.push(arg);
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  if (args.length !== 1) {
    console.error(`Usage: ${process.argv[1]} [options] <presentation_file>`);
    console.error("Use --help for more information");
    process.exit(1);
  }

  const presentationFile = args[0];
  if (!fs.existsSync(presentationFile)) {
    console.error(`Error: File '${presentationFile}' does not exist.`);
    process.exit(1);
  }

  let projectRoot: string;
  try {
    projectRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch {
    console.error("Error: Not in a git repository.");
    process.exit(1);
  }

  await parse(projectRoot, presentationFile, options);
}
