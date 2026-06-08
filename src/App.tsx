import { useMemo, useState } from 'react';
import { CircuitCanvas } from './components/CircuitCanvas';
import { GateBlock } from './components/GateBlock';
import { OutputPanel } from './components/OutputPanel';
import { ParticleView } from './components/ParticleView';
import { examples } from './data/examples';
import { protocolExamples, protocolLibrary } from './data/protocolExamples';
import { applyGate, createInitialState, measureAll, runCircuit } from './simulator/engine';
import { compileQpuProtocol, supportedQpuOperations } from './simulator/qpuAst';
import { CircuitGate, GateType, MeasurementMap } from './simulator/types';
import { Complex } from './simulator/complex';
import './styles.css';

const QUBIT_COUNT = 3;
const palette: GateType[] = ['X', 'H', 'PHASE', 'CNOT', 'CCNOT', 'NOT', 'AND', 'NAND', 'OR', 'XOR', 'MEASURE'];

const controlsForGate = (type: GateType, target: number, qubitCount: number) => {
  if (type === 'CNOT' || type === 'AND' || type === 'NAND' || type === 'OR' || type === 'XOR') return [target === 0 ? 1 : target - 1];
  if (type === 'CCNOT') {
    const candidates = Array.from({ length: qubitCount }, (_, qubit) => qubit).filter((qubit) => qubit !== target);
    return candidates.slice(0, 2);
  }
  return [];
};

const newGate = (type: GateType, step: number, target: number, qubitCount: number): CircuitGate => ({
  id: `${type}-${step}-${target}-${crypto.randomUUID()}`,
  type,
  step,
  targets: [target],
  controls: controlsForGate(type, target, qubitCount),
  phase: type === 'PHASE' ? Math.PI / 2 : undefined,
});

function App() {
  const [qubitCount, setQubitCount] = useState(QUBIT_COUNT);
  const [gates, setGates] = useState<CircuitGate[]>([]);
  const [state, setState] = useState<Complex[]>(() => createInitialState(QUBIT_COUNT));
  const [measurements, setMeasurements] = useState<MeasurementMap>({});
  const [log, setLog] = useState<string[]>(['Initialized |000⟩.']);
  const [cursor, setCursor] = useState(0);
  const [selectedGate, setSelectedGate] = useState<GateType | null>('H');
  const [protocolSource, setProtocolSource] = useState(protocolExamples[0].source);
  const [compileSummary, setCompileSummary] = useState('Paste or load a QPU protocol, then compile it into visual gates.');
  const [tokenMap, setTokenMap] = useState<Record<string, number>>({});

  const orderedGates = useMemo(() => gates.slice().sort((a, b) => a.step - b.step), [gates]);

  const resetRuntime = (nextQubitCount = qubitCount, reason?: string) => {
    setState(createInitialState(nextQubitCount));
    setMeasurements({});
    setLog([reason ?? `Initialized |${'0'.repeat(nextQubitCount)}⟩.`]);
    setCursor(0);
  };

  const addGate = (type: GateType, target: number) => {
    const step = gates.length === 0 ? 0 : Math.max(...gates.map((gate) => gate.step)) + 1;
    setGates((current) => [...current, newGate(type, step, target, qubitCount)]);
    setSelectedGate(type);
    resetRuntime();
  };

  const removeGate = (gateId: string) => {
    setGates((current) => current.filter((gate) => gate.id !== gateId).map((gate, step) => ({ ...gate, step })));
    resetRuntime();
  };

  const run = () => {
    const result = runCircuit(qubitCount, orderedGates);
    setState(result.state);
    setMeasurements(result.measurements);
    setLog(result.log);
    setCursor(orderedGates.length);
  };

  const step = () => {
    const gate = orderedGates[cursor];
    if (!gate) return;
    const result = applyGate(state, qubitCount, gate, measurements);
    setState(result.state);
    setMeasurements(result.measurements);
    setLog((current) => [...current, ...result.log]);
    setCursor((current) => current + 1);
  };

  const resetCircuit = () => resetRuntime();

  const measure = () => {
    const result = measureAll(state, qubitCount, measurements);
    setState(result.state);
    setMeasurements(result.measurements);
    setLog((current) => [...current, ...result.log]);
  };

  const loadExample = (index: number) => {
    const example = examples[index];
    setQubitCount(example.qubitCount);
    setGates(example.gates);
    setTokenMap({});
    resetRuntime(example.qubitCount, `Loaded ${example.name}.`);
  };

  const compileProtocol = () => {
    try {
      const result = compileQpuProtocol(protocolSource, protocolLibrary);
      setQubitCount(result.qubitCount);
      setGates(result.gates);
      setTokenMap(result.tokenMap);
      setCompileSummary(`Compiled ${result.parsed.length} AST command(s) into ${result.gates.length} runnable gate(s) over ${result.qubitCount} register(s).`);
      resetRuntime(result.qubitCount, `Compiled QPU AST protocol. ${result.log[0] ?? ''}`);
      setLog((current) => [...current, ...result.log.slice(0, 24)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCompileSummary(`Compile error: ${message}`);
      setLog((current) => [...current, `Compile error: ${message}`]);
    }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Static React QPU MVP</p>
          <h1>Build, compile, run, and watch quantum circuits collapse.</h1>
          <p>A mobile-first browser playground with draggable gates, a TypeScript QPU AST compiler/parser, and an in-browser state-vector simulator.</p>
        </div>
        <div className="hero-card">
          <span>{orderedGates.length}</span>
          <small>gates queued</small>
        </div>
      </header>

      <section className="panel palette-panel" aria-labelledby="palette-title">
        <div className="section-heading">
          <p className="eyebrow">Gate palette</p>
          <h2 id="palette-title">Pick up a block</h2>
        </div>
        <div className="palette">
          {palette.map((gate) => (
            <GateBlock
              draggable
              key={gate}
              onClick={() => setSelectedGate(gate)}
              onDragStart={setSelectedGate}
              selected={selectedGate === gate}
              type={gate}
            />
          ))}
        </div>
      </section>

      <CircuitCanvas
        activeStep={cursor - 1}
        gates={orderedGates}
        onDropGate={addGate}
        onRemoveGate={removeGate}
        qubitCount={qubitCount}
        selectedGate={selectedGate}
      />

      <section className="controls panel" aria-label="Run controls">
        <button onClick={run} type="button">Run</button>
        <button disabled={cursor >= orderedGates.length} onClick={step} type="button">Step</button>
        <button onClick={resetCircuit} type="button">Reset</button>
        <button onClick={measure} type="button">Measure</button>
      </section>

      <section className="examples panel" aria-labelledby="examples-title">
        <div className="section-heading">
          <p className="eyebrow">Examples</p>
          <h2 id="examples-title">Load a starter circuit</h2>
        </div>
        <div className="example-grid">
          {examples.map((example, index) => (
            <button className="example-card" key={example.name} onClick={() => loadExample(index)} type="button">
              <strong>{example.name}</strong>
              <span>{example.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel compiler-panel" aria-labelledby="compiler-title">
        <div className="section-heading">
          <p className="eyebrow">QPU AST backend</p>
          <h2 id="compiler-title">Compile parser protocols</h2>
        </div>
        <div className="compiler-actions">
          {protocolExamples.map((example) => (
            <button key={example.name} onClick={() => setProtocolSource(example.source)} type="button">{example.name}</button>
          ))}
        </div>
        <textarea
          aria-label="QPU protocol source"
          value={protocolSource}
          onChange={(event) => setProtocolSource(event.target.value)}
          spellCheck={false}
        />
        <div className="compiler-footer">
          <button onClick={compileProtocol} type="button">Compile AST to circuit</button>
          <span>{compileSummary}</span>
        </div>
        <details>
          <summary>Supported operations and token map</summary>
          <p>{supportedQpuOperations.join(', ')}</p>
          <pre>{JSON.stringify(tokenMap, null, 2)}</pre>
        </details>
      </section>

      <div className="results-grid">
        <ParticleView measurements={measurements} qubitCount={qubitCount} />
        <OutputPanel log={log} measurements={measurements} qubitCount={qubitCount} state={state} />
      </div>
    </main>
  );
}

export default App;
