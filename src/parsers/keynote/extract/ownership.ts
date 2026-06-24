import type { Registry, RegistryEntry } from "../registry.ts";

/**
 * A drawable's container reference. Drawables keep their `parent` ref on the
 * `TSD.DrawableArchive` reached through the `super` chain — ImageArchive nests it
 * one level down (`super.parent`), ShapeInfoArchive two (`super.super.parent`),
 * and so on. Walking `.super` until a `parent` appears is robust to that depth
 * without needing to know each drawable subtype.
 */
export function parentReference(message: unknown): bigint | undefined {
  let node: unknown = message;
  // The drawable super chain is shallow; cap iterations so a self-referential
  // `super` (corrupt decode) can't spin forever.
  for (let depth = 0; node && typeof node === "object" && depth < 8; depth += 1) {
    const parent = (node as { parent?: { identifier?: bigint } }).parent;
    if (parent?.identifier !== undefined) return parent.identifier;
    node = (node as { super?: unknown }).super;
  }
  return undefined;
}

/**
 * Walks a drawable's parent chain upward (drawable → group/container → … →
 * slide) until it reaches a content-slide id, which it returns. Returns
 * `undefined` when the chain breaks — a dropped chunk severs a `parent` ref — or
 * when it never reaches a content slide (e.g. a drawable owned by a master).
 * Guards against reference cycles with a seen-set.
 */
export function owningSlideId(
  entry: RegistryEntry,
  registry: Registry,
  contentSlideIds: Set<bigint>,
): bigint | undefined {
  const seen = new Set<bigint>([entry.id]);
  let current: RegistryEntry | undefined = entry;

  while (current) {
    const parentId = parentReference(current.message);
    if (parentId === undefined) return undefined;
    if (contentSlideIds.has(parentId)) return parentId;
    if (seen.has(parentId)) return undefined;
    seen.add(parentId);
    current = registry.get(parentId);
  }

  return undefined;
}

/**
 * A drawable's back-to-front rank within its slide, from the slide's
 * `drawablesZOrder` (id → index map). Returns the index of the first drawable in
 * its parent chain (itself, else its top-most z-ordered ancestor — e.g. the group
 * a nested image belongs to) that appears in `order`; `undefined` when none does.
 * Guards against reference cycles with a seen-set.
 */
export function drawableZOrder(
  entry: RegistryEntry,
  registry: Registry,
  order: Map<bigint, number>,
): number | undefined {
  const seen = new Set<bigint>();
  let current: RegistryEntry | undefined = entry;

  while (current) {
    const rank = order.get(current.id);
    if (rank !== undefined) return rank;
    if (seen.has(current.id)) return undefined;
    seen.add(current.id);
    const parentId = parentReference(current.message);
    if (parentId === undefined) return undefined;
    current = registry.get(parentId);
  }

  return undefined;
}
