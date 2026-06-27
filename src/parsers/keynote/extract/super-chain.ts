/**
 * A node in a style's `super` inheritance chain: some property-bearing shape `T`
 * plus an optional link to the next-more-general style. Keynote's library types a
 * style's `super` as a bare `TSS.StyleArchive`, but at runtime each link is the
 * same property-bearing shape as its child, so a caller reinterprets a resolved
 * style as `SuperChainNode<T>` to walk it structurally without casting at each hop.
 */
export type SuperChainNode<T> = T & { super?: SuperChainNode<T> };

/**
 * The first non-undefined `pick(node)` walking a style's `super` chain, or
 * undefined when none matches. Bounded two ways so a partially-decoded archive
 * cannot hang the walk: it visits at most `maxDepth` links and stops if it revisits
 * a node (a self- or mutually-referential `super` cycle). Mirrors the depth-8
 * guards already used in extract/ownership.ts and extract/layout.ts.
 */
export function firstInSuperChain<T, R>(
  node: SuperChainNode<T> | undefined,
  pick: (node: T) => R | undefined,
  maxDepth = 8,
): R | undefined {
  const seen = new Set<SuperChainNode<T>>();
  for (let depth = 0; node && depth < maxDepth && !seen.has(node); depth += 1) {
    seen.add(node);
    const value = pick(node);
    if (value !== undefined) {
      return value;
    }
    node = node.super;
  }
  return undefined;
}
