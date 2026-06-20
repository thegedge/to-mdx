import type { IwaObject } from "keynote-archives";
import type { DataReference, Reference } from "./types.ts";

export interface RegistryEntry {
  id: bigint;
  type: number;
  message: unknown;
}

/**
 * Indexes every decoded TSP object by its identifier so that `TSP.Reference`
 * pointers can be followed. All lookups are guarded: a miss records a warning
 * and returns `undefined` rather than throwing, because the schema is
 * reverse-engineered and real files routinely reference objects we never decode.
 */
export class Registry {
  readonly warnings: string[] = [];

  #byId = new Map<bigint, RegistryEntry>();
  #unresolved = new Set<string>();

  add(object: IwaObject): void {
    if (object.identifier === undefined) return;

    const primary = object.messages[0];
    if (!primary) return;

    this.#byId.set(object.identifier, {
      id: object.identifier,
      type: primary.info.type,
      message: primary.data,
    });
  }

  get(id: bigint): RegistryEntry | undefined {
    return this.#byId.get(id);
  }

  entriesOfType(type: number): RegistryEntry[] {
    return [...this.#byId.values()].filter((entry) => entry.type === type);
  }

  firstOfType(type: number): RegistryEntry | undefined {
    for (const entry of this.#byId.values()) {
      if (entry.type === type) return entry;
    }
    return undefined;
  }

  resolve<T>(ref: Reference | DataReference | undefined): T | undefined {
    if (!ref) return undefined;

    const entry = this.#byId.get(ref.identifier);
    if (!entry) {
      this.noteUnresolved(ref.identifier);
      return undefined;
    }

    return entry.message as T;
  }

  get size(): number {
    return this.#byId.size;
  }

  typeCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const entry of this.#byId.values()) {
      const key = String(entry.type);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  private noteUnresolved(id: bigint): void {
    const key = id.toString();
    if (this.#unresolved.has(key)) return;
    this.#unresolved.add(key);
    this.warnings.push(`Unresolved reference: ${key}`);
  }
}
