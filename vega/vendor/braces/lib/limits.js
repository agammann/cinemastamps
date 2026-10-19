'use strict';

const MAX_DEPTH = 64;
const MAX_NODES = 2 * require('./constants').MAX_LENGTH + 1;
const invalid = () => new SyntaxError('Brace pattern exceeds safe traversal limits');

// Validate without recursion. Parent/prev links in parser-produced trees point
// back into the tree; only the nodes edges define recursive walker depth.
const assertAst = ast => {
  const active = new Set();
  const stack = [{ node: ast, depth: 0, exit: false }];
  let count = 0;
  let scheduled = 1;
  while (stack.length) {
    const { node, depth, exit } = stack.pop();
    if (exit) { active.delete(node); continue; }
    if (!node || typeof node !== 'object' || ++count > MAX_NODES || active.has(node)) throw invalid();
    if (node.nodes === undefined) continue;
    if (!Array.isArray(node.nodes) || depth > MAX_DEPTH) throw invalid();
    scheduled += node.nodes.length;
    if (scheduled > MAX_NODES) throw invalid();
    active.add(node);
    stack.push({ node, depth, exit: true });
    for (let i = node.nodes.length - 1; i >= 0; i--) {
      const child = node.nodes[i];
      stack.push({ node: child, depth: depth + 1, exit: false });
    }
  }
};

// Expansion also follows ancestry, including retained pointers on unbalanced
// patterns. Bound those walks without requiring perfectly reparented ASTs.
const queueParent = node => {
  let count = 0;
  while (node.type !== 'brace' && node.type !== 'root' && node.parent) {
    if (++count > MAX_DEPTH) throw invalid();
    node = node.parent;
  }
  return node;
};

module.exports = { MAX_DEPTH, assertAst, queueParent, invalid };
