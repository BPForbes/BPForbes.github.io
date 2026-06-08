# Project notes

## Test runner (`package.json`)

`package.json` cannot carry inline comments, so test-runner decisions are recorded here.

The simulator regression suite uses **Vitest** (`npm test` / `npm run test:watch`) instead of the previous hand-rolled `tsx` runner. Vitest provides per-test isolation, structured failure diffs, watch mode, and integrates with the existing Vite/TypeScript toolchain.
