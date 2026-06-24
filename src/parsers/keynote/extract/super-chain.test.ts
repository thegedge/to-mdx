import assert from "node:assert/strict";
import { test } from "node:test";
import { firstInSuperChain, type SuperChainNode } from "./super-chain.ts";

interface Props {
  value?: number;
}
type Node = SuperChainNode<Props>;

/** Builds a `super` chain from an array of per-link values (head first). */
function chain(values: (number | undefined)[]): Node | undefined {
  let node: Node | undefined;
  for (const value of [...values].reverse()) {
    node = { value, super: node };
  }
  return node;
}

test("firstInSuperChain returns the first non-undefined pick along the chain", () => {
  const node = chain([undefined, undefined, 7, 9]);
  assert.equal(
    firstInSuperChain(node, (link) => link.value),
    7,
  );
});

test("firstInSuperChain returns undefined when nothing matches", () => {
  assert.equal(
    firstInSuperChain(chain([undefined, undefined]), (link) => link.value),
    undefined,
  );
  assert.equal(
    firstInSuperChain(undefined, (link: Props) => link.value),
    undefined,
  );
});

test("firstInSuperChain returns (does not hang) on a self-referential super cycle", () => {
  const node: Node = { value: undefined };
  node.super = node; // a partial decode can leave `super` pointing at itself
  assert.equal(
    firstInSuperChain(node, (link) => link.value),
    undefined,
  );
});

test("firstInSuperChain returns (does not hang) on a mutual super cycle", () => {
  const a: Node = { value: undefined };
  const b: Node = { value: undefined, super: a };
  a.super = b;
  assert.equal(
    firstInSuperChain(a, (link) => link.value),
    undefined,
  );
});

test("firstInSuperChain stops at the default depth cap of 8 links", () => {
  // Value sits on the 9th link (index 8), one past the depth-8 cap.
  const values = [...Array(8).fill(undefined), 42];
  assert.equal(
    firstInSuperChain(chain(values), (link) => link.value),
    undefined,
  );
  // A higher explicit cap reaches it.
  assert.equal(
    firstInSuperChain(chain(values), (link) => link.value, 9),
    42,
  );
});
