import { execSync } from "child_process";
import * as fs from "fs";
import type { Options } from "./parsers.ts";
import { parse } from "./parsers.ts";

function gitToplevel(): string {
  return execSync("git rev-parse --show-toplevel", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
}

/**
 * Output root: the git repo top-level when available, else the current working
 * directory. Outside a repo we warn and degrade rather than exiting. The git
 * runner is injectable so tests can exercise the fallback without spawning git.
 */
export function resolveProjectRoot(runGit: () => string = gitToplevel): string {
  try {
    const root = runGit().trim();
    if (root) return root;
  } catch {
    // git missing or not a repo — fall through to cwd.
  }
  console.warn("⚠️  Not in a git repository; writing output relative to the current directory");
  return process.cwd();
}

function showHelp(programName: string): void {
  console.log(`Usage: ${programName} [options] <presentation_file>`);
  console.log("");
  console.log("Options:");
  console.log("  --use-heuristics    Use heuristics to determine classnames and eliminate positioning divs");
  console.log("  --dump-keynote <path>  Write the decoded Keynote (.key) structure as JSON for debugging");
  console.log("  --dump-keynote-raw <path>  Write RAW decoded Keynote protobuf objects as JSON for debugging");
  console.log("  --dump-keynote-raw-slides <list>  Comma-separated 1-based slide numbers to target for --dump-keynote-raw");
  console.log("  -h, --help         Show this help message");
}

export async function main(argv: string[]): Promise<void> {
  const options: Options = {};
  const args: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--use-heuristics") {
      options.useHeuristics = true;
    } else if (arg === "--dump-keynote") {
      const value = argv[++i];
      if (!value) {
        console.error("Error: --dump-keynote requires a path argument");
        process.exit(1);
      }
      options.dumpKeynote = value;
    } else if (arg === "--dump-keynote-raw") {
      const value = argv[++i];
      if (!value) {
        console.error("Error: --dump-keynote-raw requires a path argument");
        process.exit(1);
      }
      options.dumpKeynoteRaw = value;
    } else if (arg === "--dump-keynote-raw-slides") {
      const value = argv[++i];
      if (!value) {
        console.error("Error: --dump-keynote-raw-slides requires a comma-separated list argument");
        process.exit(1);
      }
      options.dumpKeynoteRawSlides = value;
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

  const projectRoot = resolveProjectRoot();

  await parse(projectRoot, presentationFile, options);
}
