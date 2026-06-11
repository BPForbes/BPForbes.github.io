# Agent instructions

These rules apply to coding agents, review bots, and the Circuit Correction Lab LLM when working in this repository.

## Protected bundled assets

- Never edit bundled or site-provided `.qpuio` truth-table files in pull requests.
- Protected processes: `SingleBitFullAdder`, `TwoBitFullAdder`, `FourBitFullAdder`, and `PhaseDemo`.
- Protected files live under `src/data/processes/*.qpuio` for the bundled examples above.
- If a task requires different truth-table expectations, create a new user/uploaded process instead of mutating bundled metadata.

## QPU protocol conventions

- `.qpucir` files hold protocol source (`PARAMS`, `MAIN-PROCESS`, gates, `RUNCHILD`, `RETURNVALS`).
- `.qpuio` files hold truth-table metadata paired with a process name (`MAIN-PROCESS:` header).
- Child-process corrections must remain compatible with descendant truth tables in the catalog.

## Correction Lab LLM behavior

- Read these rules before proposing AST/protocol changes or truth-table edits.
- Do not emit intents that rewrite protected truth tables.
- Prefer `runTest`, `probeOutputs`, `inferTable`, and gate-level `guidance` for fixes.
- When a user targets a protected process table, refuse the table edit and explain the protection policy.

## Pull request hygiene

- Keep bundled `.qpuio` diffs out of feature PRs unless an maintainer is intentionally refreshing canonical site metadata.
- Add tests when changing parsers, catalog behavior, or child-process correction flows.
