import type { IwaObject } from "keynote-archives";
import { Registry } from "./registry.ts";

/** Builds a minimal `IwaObject` carrying a single decoded message of `type`. */
export function mockObject(id: bigint, type: number, data: unknown): IwaObject {
  return {
    identifier: id,
    offset: 0,
    length: 0,
    messages: [
      {
        info: {
          type,
          version: [],
          length: 0,
          fieldInfos: [],
          objectReferences: [],
          dataReferences: [],
          diffMergeVersion: [],
          fieldsToRemove: [],
          diffReadVersion: [],
        },
        offset: 0,
        length: 0,
        data,
      },
    ],
  };
}

export function buildRegistry(objects: IwaObject[]): Registry {
  const registry = new Registry();
  for (const object of objects) registry.add(object);
  return registry;
}

export function ref(identifier: bigint): { identifier: bigint } {
  return { identifier };
}
