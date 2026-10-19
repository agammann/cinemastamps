# Repository-local bounded braces

This private package retains the MIT-licensed implementation from the published
`braces@3.0.3` npm tarball. The original license is in `LICENSE`. It is maintained
inside CinemaStamps; it is not a new upstream release.

The changes address [deep AST recursion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm):

- Reject more than 64 nested brace/parenthesis blocks during parsing.
- Validate direct AST inputs iteratively before compile, expansion and stringify:
  reject child cycles, more than 64 container levels, and more than 20,001 node
  visits, without recursing or first queuing an oversized child array.
- Bound expansion's parent-chain and recursive array-append paths, and flatten
  arrays iteratively with cycle/depth checks.

Rejected input raises `SyntaxError` with `Brace pattern exceeds safe traversal
limits`. The upstream string/array APIs, ordinary escapes, malformed literals,
range options and AST inputs remain supported within these limits. Parent/prev
links are retained because the original parser uses back-references and keeps
ancestry after flattening unbalanced patterns.

The native install overrides `braces` to this directory. Both known Prettier
bundles are bridged to this same implementation using version/content checks.
Keep installation scripts enabled and run `npm run test:security` after changes.
Review the upstream advisory and compatibility controls before replacing this
copy with a future upstream release.
