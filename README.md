# React QPU Circuit Simulator MVP

A mobile-first static React/TypeScript quantum circuit playground for GitHub Pages. Users can drag or tap X, H, CNOT, CCNOT, and MEASURE gates onto qubit wires, run the circuit locally in the browser, and watch 3D-like qubit spheres collapse into 2D measured state cards.

## Features

- Touch-friendly gate palette with drag-and-drop and tap-to-place support.
- Horizontal qubit circuit wires with React-rendered gate blocks and control dots.
- Browser-side TypeScript state-vector simulator with complex-number math.
- X, H, PHASE/BPHASE, CNOT, CCNOT/Toffoli, derived Boolean gates, and probabilistic measurement collapse.
- Run, Step, Reset, and Measure controls.
- Output panel for measured qubit values, non-zero state-vector amplitudes, and an execution log.
- Browser-side QPU AST parser/compiler for `-I`, `-O`, `-$R`, cycle tokens, process/control operations, memory/register operations, and child process examples.
- Starter examples: Bell state, CNOT demo, CCNOT demo, PHASE demo, and nested full-adder AST protocols.


## Source organization

- `src/components/` contains React UI panels and visual building blocks.
- `src/data/` contains bundled protocol metadata, upload/download helpers, catalog policy, and `src/data/tests/` for data-layer regressions.
- `src/simulator/` contains protocol parsing, circuit execution, correction logic, truth-table validation, and `src/simulator/tests/` for simulator-level regressions.
- `src/simulator/gates/` contains gate definitions, state-vector operations, registry metadata, and `src/simulator/gates/tests/` for gate-specific regressions.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The app is static and can be deployed from the generated `dist/` directory on GitHub Pages.


## QPU protocol compiler

The static site includes a TypeScript port of the QPU parser/compiler concepts from `qpu/ast.py`. It recognizes primitive gates (`X`, `H`, `CNOT`, `CCNOT`, `PHASE`/`BPHASE`), derived gates (`NOT`, `AND`, `NAND`, `OR`, `XOR`), process/control commands (`MAIN-PROCESS`, `COMPILEPROCESS`, `CALL`, `DECLARECHILD`, `RUNCHILD`, `RETURNVALS`, `ACCEPTVALS`, `MASTERVAL`), and memory/register commands (`SET`, `FREE`, `JOIN`, `SPLIT`, `CREATETOKEN`, `DELETETOKEN`, `SAVE_STATE`, `LOAD_STATE`, `MEASURE`, `INCREASECYCLE`). Protocol source can be pasted into the in-app compiler panel and lowered into visual circuit gates for local simulation.
