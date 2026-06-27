// The real entry point, run by the `bin/to-mdx` launcher under Node's permission
// sandbox. Kept separate from the launcher (which must run un-sandboxed to set up
// the permissions) so that shim stays a tiny argv-only step that never touches
// input files.
import { main } from "./cli.ts";

(async () => {
  const timeout = setTimeout(() => {}, 30_000); // keep process alive, but eventually time out
  await main(process.argv.slice(2));
  clearTimeout(timeout);
})();
