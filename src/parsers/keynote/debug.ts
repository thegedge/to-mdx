import { writeFile } from "node:fs/promises";
import type { Presentation } from "./model.ts";
import type { Registry } from "./registry.ts";

export interface DebugDump {
  objectCount: number;
  typeCounts: Record<string, number>;
  warnings: string[];
  presentation: Presentation;
}

/**
 * Serializes the decoded structure to JSON so a user with a real `.key` file can
 * share back what we extracted. bigint values are stringified.
 */
export async function writeDebugDump(
  dumpPath: string,
  registry: Registry,
  presentation: Presentation,
  warnings: string[],
): Promise<void> {
  const dump: DebugDump = {
    objectCount: registry.size,
    typeCounts: registry.typeCounts(),
    warnings,
    presentation,
  };

  await writeFile(dumpPath, JSON.stringify(dump, replaceBigInt, 2));
  console.log(`🐛 Wrote Keynote debug dump to ${dumpPath}`);
}

function replaceBigInt(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
