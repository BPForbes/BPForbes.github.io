import { useMemo, useState } from 'react';
import { CircuitCanvas } from './components/CircuitCanvas';
import { GateBlock } from './components/GateBlock';
import { OutputPanel } from './components/OutputPanel';
import { ParticleView } from './components/ParticleView';
import { examples } from './data/examples';
import { protocolExamples, protocolLibrary } from './data/protocolExamples';
import { applyGate, createInitialState, measureAll, measureQubit, runCircuit } from './simulator/engine';
import { compileQpuProtocol, supportedQpuOperations } from './simulator/qpuAst';
import { CircuitGate, GateType, MeasurementMap, gateTypes } from './simulator/types';
import { Complex } from './simulator/complex';
import './styles.css';

const QUBIT_COUNT = 3;
const palette: GateType[] = [...gateTypes];

const singleControlGates = new Set<GateType>(['CNOT', 'AND', 'NAND', 'OR', 'XOR']);

const controlsForGate = (type: GateType, target: number, qubitCount: number): number[] | null => {
  const candidates = Array.from({ length: qubitCount }, (_, qubit) => qubit).filter((qubit) => qubit !== target);

  if (singleControlGates.has(type)) return candidates.length >= 1 ? [candidates[0]] : null;
  if (type === 'CCNOT') return candidates.length >= 2 ? candidates.slice(0, 2) : null;
  return [];
};

const newGate = (
  type: GateType,
  step: number,
  target: number,
  qubitCount: number,
  overrideControls?: number[],
  phase = Math.PI / 2,
): CircuitGate | null => {
  const controls = overrideControls ?? controlsForGate(type, target, qubitCount);
  if (controls === null) return null;

  return {
    id: `${type}-${step}-${target}-${crypto.randomUUID()}`,
    type,
    step,
    targets: [target],
    controls,
    phase: type === 'PHASE' ? phase : undefined,
  };
};

function App() {
  const [qubitCount, setQubitCount] = useState(QUBIT_COUNT);
  const [gates, setGates] = useState<CircuitGate[]>([]);
  const [state, setState] = useState<Complex[]>(() => createInitialState(QUBIT_COUNT));
  const [measurements, setMeasurements] = useState<MeasurementMap>({});
  const [log, setLog] = useState<string[]>(['Initialized |000⟩.']);
  const [cursor, setCursor] = useState(0);
  const [selectedGate, setSelectedGate] = useState<GateType | null>('H');
  const [targetQubit, setTargetQubit] = useState(0);
  const [controlQubit, setControlQubit] = useState(1);
  const [secondControlQubit, setSecondControlQubit] = useState(2);
  const [phaseDegrees, setPhaseDegrees] = useState(90);
  const [protocolSource, setProtocolSource] = useState(protocolExamples[0].source);
  const [compileSummary, setCompileSummary] = useState('Paste or load a QPU protocol, then compile it into visual gates.');
  const [tokenMap, setTokenMap] = useState<Record<string, number>>({});

  const orderedGates = useMemo(() => gates.slice().sort((a, b) => a.step - b.step), [gates]);
  const selectedTarget = Math.min(targetQubit, qubitCount - 1);
  const phaseRadians = (phaseDegrees * Math.PI) / 180;

  const chooseDistinctQubit = (avoid: number[]) => {
    const option = Array.from({ length: qubitCount }, (_, qubit) => qubit).find((qubit) => !avoid.includes(qubit));
    return option ?? 0;
  };

  const workbenchControlsForGate = (type: GateType, target: number) => {
    if (singleControlGates.has(type)) {
      if (qubitCount < 2) return undefined;
      return [controlQubit === target ? chooseDistinctQubit([target]) : controlQubit];
    }
    if (type === 'CCNOT') {
      if (qubitCount < 3) return undefined;
      const first = controlQubit === target ? chooseDistinctQubit([target, secondControlQubit]) : controlQubit;
      const second = secondControlQubit === target || secondControlQubit === first ? chooseDistinctQubit([target, first]) : secondControlQubit;
      return [first, second];
    }
    return undefined;
  };

  const resetRuntime = (nextQubitCount = qubitCount, reason?: string) => {
    setState(createInitialState(nextQubitCount));
    setMeasurements({});
    setLog([reason ?? `Initialized |${'0'.repeat(nextQubitCount)}⟩.`]);
    setCursor(0);
  };

  const addGate = (type: GateType, target: number, controls?: number[]) => {
    const step = gates.length === 0 ? 0 : Math.max(...gates.map((gate) => gate.step)) + 1;
    const gate = newGate(type, step, target, qubitCount, controls, phaseRadians);
    if (!gate) {
      setLog((current) => [...current, `${type} requires more qubits than are available in this circuit.`]);
      return;
    }
    setGates((current) => [...current, gate]);
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

  const measureSelectedQubit = () => {
    if (measurements[selectedTarget] !== undefined) {
      setLog((current) => [...current, `q${selectedTarget} is already measured as ${measurements[selectedTarget]}.`]);
      return;
    }

    const result = measureQubit(state, qubitCount, selectedTarget);
    setState(result.state);
    setMeasurements((current) => ({ ...current, [selectedTarget]: result.value }));
    setLog((current) => [...current, `Measured q${selectedTarget} = ${result.value} (P(1)=${result.probabilityOne.toFixed(3)}).`]);
  };

  const addGateFromWorkbench = () => {
    if (!selectedGate) {
      setLog((current) => [...current, 'Select a gate before adding it to the circuit.']);
      return;
    }
    addGate(selectedGate, selectedTarget, workbenchControlsForGate(selectedGate, selectedTarget));
  };

  const addParticle = () => {
    const nextCount = Math.min(qubitCount + 1, 6);
    if (nextCount === qubitCount) {
      setLog((current) => [...current, 'This playground supports up to 6 qubit particles.']);
      return;
    }
    setQubitCount(nextCount);
    setTargetQubit(nextCount - 1);
    if (nextCount > 1) setControlQubit(0);
    if (nextCount > 2) setSecondControlQubit(1);
    resetRuntime(nextCount, `Added particle q${nextCount - 1}; reset to |${'0'.repeat(nextCount)}⟩.`);
  };

  const removeParticle = () => {
    const nextCount = Math.max(1, qubitCount - 1);
    if (nextCount === qubitCount) {
      setLog((current) => [...current, 'At least one qubit particle is required.']);
      return;
    }

    setQubitCount(nextCount);
    setGates((current) =>
      current
        .filter((gate) => gate.targets.every((target) => target < nextCount) && gate.controls.every((control) => control < nextCount))
        .map((gate, step) => ({ ...gate, step })),
    );
    setTargetQubit((current) => Math.min(current, nextCount - 1));
    setControlQubit((current) => (current >= nextCount ? 0 : current));
    setSecondControlQubit((current) => (current >= nextCount ? Math.max(0, nextCount - 1) : current));
    resetRuntime(nextCount, `Removed last particle; reset to |${'0'.repeat(nextCount)}⟩.`);
  };

  const clearCircuit = () => {
    setGates([]);
    resetRuntime();
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

      <section className="panel workbench-panel" aria-labelledby="workbench-title">
        <div className="section-heading">
          <p className="eyebrow">Interactive workbench</p>
          <h2 id="workbench-title">Add particles, gates, and measurements</h2>
        </div>
        <div className="workbench-grid">
          <label>
            Gate
            <select value={selectedGate ?? ''} onChange={(event) => setSelectedGate(event.target.value as GateType)}>
              {palette.map((gate) => <option key={gate} value={gate}>{gate}</option>)}
            </select>
          </label>
          <label>
            Target particle
            <select value={selectedTarget} onChange={(event) => setTargetQubit(Number(event.target.value))}>
              {Array.from({ length: qubitCount }, (_, qubit) => <option key={qubit} value={qubit}>q{qubit}</option>)}
            </select>
          </label>
          <label>
            Control A
            <select value={controlQubit} onChange={(event) => setControlQubit(Number(event.target.value))}>
              {Array.from({ length: qubitCount }, (_, qubit) => <option disabled={qubit === selectedTarget} key={qubit} value={qubit}>q{qubit}</option>)}
            </select>
          </label>
          <label>
            Control B
            <select value={secondControlQubit} onChange={(event) => setSecondControlQubit(Number(event.target.value))}>
              {Array.from({ length: qubitCount }, (_, qubit) => <option disabled={qubit === selectedTarget || qubit === controlQubit} key={qubit} value={qubit}>q{qubit}</option>)}
            </select>
          </label>
          <label className="phase-control">
            Phase angle: {phaseDegrees}°
            <input min="0" max="360" step="15" type="range" value={phaseDegrees} onChange={(event) => setPhaseDegrees(Number(event.target.value))} />
          </label>
        </div>
        <div className="workbench-actions">
          <button onClick={addGateFromWorkbench} type="button">Add gate to target</button>
          <button onClick={addParticle} type="button">Add particle</button>
          <button onClick={removeParticle} type="button">Remove particle</button>
          <button onClick={measureSelectedQubit} type="button">Measure target</button>
        </div>
        <p className="canvas-tip">Selected {selectedGate} gate will target q{selectedTarget}; controlled gates use the control selectors above.</p>
      </section>

      <section className="controls panel" aria-label="Run controls">
        <button onClick={run} type="button">Run all</button>
        <button disabled={cursor >= orderedGates.length} onClick={step} type="button">Step gate</button>
        <button onClick={resetCircuit} type="button">Reset state</button>
        <button onClick={measure} type="button">Measure all</button>
        <button onClick={clearCircuit} type="button">Clear circuit</button>
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
