import { ChangeEvent, useMemo, useState } from 'react';
import { CircuitCanvas } from './components/CircuitCanvas';
import { GateBlock } from './components/GateBlock';
import { OutputPanel } from './components/OutputPanel';
import { ParticleView } from './components/ParticleView';
import { examples } from './data/examples';
import { protocolExamples, protocolLibrary } from './data/protocolExamples';
import type { ConfiguredQpucirProcess, QpucirPayload } from './data/protocolExamples';
import { applyGate, createInitialState, measureAll, measureQubit, runCircuit } from './simulator/engine';
import { compileQpuProtocol, ProcessParam, supportedQpuOperations, visibleCircuitGates } from './simulator/qpuAst';
import { extractMainProcessName, qpucirFileNameForSource, serializeCircuitToQpuProtocol } from './simulator/qpuFormat';
import { CircuitGate, GateType, MeasurementMap, ParticleStartState, gateTypes } from './simulator/types';
import { Complex } from './simulator/complex';
import './styles.css';

const QUBIT_COUNT = 3;
const palette: GateType[] = [...gateTypes];


type AppView = 'builder' | 'docs' | 'qpu-docs' | 'files' | 'particles' | 'more';

const initialProtocolSource = protocolExamples[0].source;

const createQpucirPayload = (name: string, source: string): QpucirPayload => {
  const compiled = compileQpuProtocol(source, protocolLibrary);
  return {
    format: 'qpucir',
    version: 1,
    name,
    source,
    compiled: {
      qubitCount: compiled.qubitCount,
      gates: compiled.gates,
      tokenMap: compiled.tokenMap,
    },
    exportedAt: new Date().toISOString(),
  };
};

const parseQpucirPayload = (contents: string): { name: string; source: string } => {
  try {
    const parsed = JSON.parse(contents) as Partial<QpucirPayload>;
    if (parsed.format === 'qpucir' && typeof parsed.source === 'string') {
      return { name: parsed.name ?? 'Uploaded QPU circuit', source: parsed.source };
    }
  } catch {
    // Plain-text protocol uploads are accepted as a convenience for hand-authored circuits.
  }
  return { name: extractMainProcessName(contents) ?? 'Uploaded QPU circuit', source: contents };
};

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
  const [startStates, setStartStates] = useState<ParticleStartState[]>(() => Array.from({ length: QUBIT_COUNT }, () => '0p'));
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
  const [processParams, setProcessParams] = useState<ProcessParam[]>([]);
  const [activeView, setActiveView] = useState<AppView>('builder');
  const [menuOpen, setMenuOpen] = useState(false);
  const [fileStatus, setFileStatus] = useState('Upload a .qpucir file or download one of the bundled AST circuits.');

  const orderedGates = useMemo(() => gates.slice().sort((a, b) => a.step - b.step), [gates]);
  const renderedGates = useMemo(() => visibleCircuitGates(orderedGates), [orderedGates]);
  const qubitLabels = useMemo(() => {
    const labels = Array.from({ length: qubitCount }, (_, qubit) => `q${qubit}`);
    Object.entries(tokenMap).forEach(([token, qubit]) => {
      if (qubit < qubitCount) {
        const shortName = token.includes('/') ? token.split('/').pop() ?? token : token;
        const isNumeric = /^\d+$/.test(shortName);
        const existing = labels[qubit];
        const existingIsDefault = existing === `q${qubit}` || /^\d+$/.test(existing.split(' · ')[1] ?? '');
        if (existingIsDefault || !isNumeric) {
          labels[qubit] = `q${qubit} · ${shortName}`;
        }
      }
    });
    return labels;
  }, [qubitCount, tokenMap]);
  const selectedTarget = Math.min(targetQubit, qubitCount - 1);
  const phaseRadians = (phaseDegrees * Math.PI) / 180;
  const controllableParams = useMemo(
    () => (processParams.length > 0
      ? processParams
      : Array.from({ length: qubitCount }, (_, qubit) => ({ name: `q${qubit}`, type: '1', qubitIndex: qubit }))),
    [processParams, qubitCount],
  );

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

  const resetRuntime = (nextQubitCount = qubitCount, reason?: string, nextStartStates = startStates) => {
    setState(createInitialState(nextQubitCount, nextStartStates));
    setMeasurements({});
    setLog([reason ?? `Initialized ${nextStartStates.slice(0, nextQubitCount).map((value) => value ?? '0p').join(' ')}.`]);
    setCursor(0);
  };

  const addGate = (type: GateType, target: number, controls?: number[]) => {
    const step = gates.length === 0 ? 0 : Math.max(...gates.map((gate) => gate.step)) + 1;
    const gate = newGate(type, step, target, qubitCount, controls, phaseRadians);
    if (!gate) {
      setLog((current) => [...current, `${type} requires more qubits than are available in this circuit.`]);
      return;
    }
    const nextGates = [...gates, gate];
    setGates(nextGates);
    setProtocolSource(serializeCircuitToQpuProtocol(nextGates, qubitCount, startStates));
    setSelectedGate(type);
    resetRuntime();
  };

  const removeGate = (gateId: string) => {
    const nextGates = gates.filter((gate) => gate.id !== gateId).map((gate, step) => ({ ...gate, step }));
    setGates(nextGates);
    setProtocolSource(serializeCircuitToQpuProtocol(nextGates, qubitCount, startStates));
    resetRuntime();
  };

  const run = () => {
    const result = runCircuit(qubitCount, orderedGates, startStates);
    setState(result.state);
    setMeasurements(result.measurements);
    setLog(result.log.filter((entry) => !entry.startsWith('RESET')));
    setCursor(orderedGates.length);
  };

  const step = () => {
    const gate = orderedGates[cursor];
    if (!gate) return;
    const result = applyGate(state, qubitCount, gate, measurements);
    setState(result.state);
    setMeasurements(result.measurements);
    setLog((current) => [...current, ...result.log.filter((entry) => !entry.startsWith('RESET'))]);
    setCursor((current) => current + 1);
  };

  const resetCircuit = () => resetRuntime();

  const updateStartState = (qubit: number, value: ParticleStartState) => {
    const nextStartStates = Array.from({ length: qubitCount }, (_, index) => (index === qubit ? value : startStates[index] ?? '0p'));
    setStartStates(nextStartStates);
    setProtocolSource(serializeCircuitToQpuProtocol(gates, qubitCount, nextStartStates));
    resetRuntime(qubitCount, `Set q${qubit} start state to ${value}.`, nextStartStates);
  };

  const resetSite = () => {
    setQubitCount(QUBIT_COUNT);
    const defaultStartStates = Array.from({ length: QUBIT_COUNT }, () => '0p' as ParticleStartState);
    setStartStates(defaultStartStates);
    setGates([]);
    setSelectedGate('H');
    setTargetQubit(0);
    setControlQubit(1);
    setSecondControlQubit(2);
    setPhaseDegrees(90);
    setProtocolSource(initialProtocolSource);
    setCompileSummary('Paste or load a QPU protocol, then compile it into visual gates.');
    setTokenMap({});
    setProcessParams([]);
    setFileStatus('Site reset to the default circuit builder state.');
    setActiveView('builder');
    setMenuOpen(false);
    resetRuntime(QUBIT_COUNT, undefined, defaultStartStates);
  };

  const measure = () => {
    const result = measureAll(state, qubitCount, measurements);
    setState(result.state);
    setMeasurements(result.measurements);
    setLog((current) => [...current, ...result.log.filter((entry) => !entry.startsWith('RESET'))]);
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
    const nextStartStates = [...startStates, '0p' as ParticleStartState];
    setStartStates(nextStartStates);
    setProtocolSource(serializeCircuitToQpuProtocol(gates, nextCount, nextStartStates));
    resetRuntime(nextCount, `Added particle q${nextCount - 1}; reset start states.`, nextStartStates);
  };

  const removeParticle = () => {
    const nextCount = Math.max(1, qubitCount - 1);
    if (nextCount === qubitCount) {
      setLog((current) => [...current, 'At least one qubit particle is required.']);
      return;
    }

    setQubitCount(nextCount);
    const nextStartStates = startStates.slice(0, nextCount);
    setStartStates(nextStartStates);
    setGates((current) =>
      current
        .filter((gate) => gate.targets.every((target) => target < nextCount) && gate.controls.every((control) => control < nextCount))
        .map((gate, step) => ({ ...gate, step })),
    );
    setTargetQubit((current) => Math.min(current, nextCount - 1));
    setControlQubit((current) => (current >= nextCount ? 0 : current));
    setSecondControlQubit((current) => (current >= nextCount ? Math.max(0, nextCount - 1) : current));
    setProtocolSource(serializeCircuitToQpuProtocol(gates.filter((gate) => gate.targets.every((target) => target < nextCount) && gate.controls.every((control) => control < nextCount)), nextCount, nextStartStates));
    resetRuntime(nextCount, `Removed last particle; reset start states.`, nextStartStates);
  };

  const clearCircuit = () => {
    setGates([]);
    setProtocolSource(serializeCircuitToQpuProtocol([], qubitCount, startStates));
    resetRuntime();
  };

  const loadExample = (index: number) => {
    const example = examples[index];
    const nextStartStates = Array.from({ length: example.qubitCount }, () => '0p' as ParticleStartState);
    setQubitCount(example.qubitCount);
    setGates(example.gates);
    setProtocolSource(serializeCircuitToQpuProtocol(example.gates, example.qubitCount, nextStartStates, example.name));
    setStartStates(nextStartStates);
    setTokenMap({});
    setProcessParams([]);
    resetRuntime(example.qubitCount, `Loaded ${example.name}.`, nextStartStates);
  };

  const compileProtocolSource = (source: string, label = 'QPU AST protocol') => {
    try {
      const result = compileQpuProtocol(source, protocolLibrary);
      setQubitCount(result.qubitCount);
      const nextStartStates = Array.from({ length: result.qubitCount }, () => '0p' as ParticleStartState);
      setStartStates(nextStartStates);
      setGates(result.gates);
      setTokenMap(result.tokenMap);
      setProcessParams(result.processParams);
      const paramSummary = result.processParams.length
        ? `${result.processParams.length} process parameter(s) (${result.processParams.map((param) => param.name).join(', ')})`
        : 'no explicit process parameters';
      setCompileSummary(`Compiled ${result.parsed.length} AST command(s) into ${result.gates.length} runnable gate(s) over ${result.qubitCount} register(s) with ${paramSummary}.`);
      resetRuntime(result.qubitCount, `Compiled ${label}. ${result.log[0] ?? ''}`, nextStartStates);
      setLog((current) => [...current, ...result.log.filter((entry) => !entry.startsWith('RESET')).slice(0, 24)]);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCompileSummary(`Compile error: ${message}`);
      setLog((current) => [...current, `Compile error: ${message}`]);
      throw error;
    }
  };

  const compileProtocol = () => {
    try {
      compileProtocolSource(protocolSource);
    } catch {
      // The compile summary and runtime log already contain the specific parse error.
    }
  };

  const downloadQpucirContents = (name: string, fileName: string, contents: string) => {
    const blob = new Blob([contents], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setFileStatus(`Downloaded ${name} as ${fileName}.`);
  };

  const downloadConfiguredProtocol = (process: ConfiguredQpucirProcess) => {
    downloadQpucirContents(process.name, process.fileName, process.contents);
  };

  const downloadCurrentProtocol = () => {
    let payload: string;
    const name = 'Current editor protocol';
    try {
      createQpucirPayload(name, protocolSource);
      payload = protocolSource;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFileStatus(`Download error: ${message}`);
      return;
    }

    downloadQpucirContents(name, qpucirFileNameForSource(protocolSource, name), payload);
  };

  const uploadProtocol = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const contents = await file.text();
      const parsed = parseQpucirPayload(contents);
      setProtocolSource(parsed.source);
      compileProtocolSource(parsed.source, parsed.name);
      setFileStatus(`Uploaded and compiled ${file.name}.`);
      setActiveView('builder');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFileStatus(`Upload error: ${message}`);
    } finally {
      event.target.value = '';
    }
  };

  const showView = (view: AppView) => {
    setActiveView(view);
    setMenuOpen(false);
  };


  return (
    <main className="app-shell">
      <button
        aria-expanded={menuOpen}
        aria-label="Open site navigation"
        className="hamburger-button"
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        <span />
        <span />
        <span />
      </button>

      <nav className={`site-menu ${menuOpen ? 'open' : ''}`} aria-label="Site sections">
        <div className="menu-heading">
          <strong>QPU Playground</strong>
          <button onClick={() => setMenuOpen(false)} type="button">×</button>
        </div>
        <button className={activeView === 'builder' ? 'active' : ''} onClick={() => showView('builder')} type="button">Circuit builder</button>
        <details open>
          <summary>Documentation</summary>
          <button className={activeView === 'docs' ? 'active' : ''} onClick={() => showView('docs')} type="button">Wiki / docs</button>
          <button className={activeView === 'qpu-docs' ? 'active' : ''} onClick={() => showView('qpu-docs')} type="button">QPU Documentation</button>
        </details>
        <button className={activeView === 'particles' ? 'active' : ''} onClick={() => showView('particles')} type="button">Particle visualization</button>
        <details open>
          <summary>File upload and download</summary>
          <button className={activeView === 'files' ? 'active' : ''} onClick={() => showView('files')} type="button">Upload files</button>
          <button className={activeView === 'files' ? 'active' : ''} onClick={() => showView('files')} type="button">Download files</button>
        </details>
        <button className={activeView === 'more' ? 'active' : ''} onClick={() => showView('more')} type="button">More</button>
        <button className="danger" onClick={resetSite} type="button">Reset site</button>
      </nav>

      {menuOpen && <button aria-label="Close menu overlay" className="menu-backdrop" onClick={() => setMenuOpen(false)} type="button" />}

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

      {activeView === 'builder' && (
        <>
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
            gates={renderedGates}
            onDropGate={addGate}
            onRemoveGate={removeGate}
            qubitColors={Array.from({ length: qubitCount }, (_, qubit) => `hsl(${(qubit * 137.508) % 360} 88% 62%)`)}
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
            <div className="start-state-picker" aria-label="Process parameter start states">
              {controllableParams.map((param) => (
                <label key={param.name}>
                  {param.name} start
                  <select value={startStates[param.qubitIndex] ?? '0p'} onChange={(event) => updateStartState(param.qubitIndex, event.target.value as ParticleStartState)}>
                    <option value="0p">0p</option>
                    <option value="1p">1p</option>
                    <option value="sp">sp</option>
                  </select>
                </label>
              ))}
            </div>
            <p className="canvas-tip">Selected {selectedGate} gate will target q{selectedTarget}; controlled gates use the control selectors above. Only declared process parameters are user-controllable; ancilla and reset registers are initialized by the compiler.</p>
          </section>

          <section className="controls panel" aria-label="Run controls">
            <button onClick={run} type="button">Run all</button>
            <button disabled={cursor >= orderedGates.length} onClick={step} type="button">Step gate</button>
            <button onClick={resetCircuit} type="button">Reset state</button>
            <button onClick={measure} type="button">Measure all</button>
            <button onClick={clearCircuit} type="button">Clear circuit</button>
            <button onClick={resetSite} type="button">Reset site</button>
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
        </>
      )}

      {activeView === 'docs' && (
        <section className="panel docs-panel" aria-labelledby="docs-title">
          <div className="section-heading">
            <p className="eyebrow">Wiki / docs</p>
            <h2 id="docs-title">Circuit construction and compile semantics</h2>
          </div>
          <div className="docs-grid">
            <article>
              <h3>How circuits are built</h3>
              <p>Use the circuit builder to drag a gate onto a qubit wire, or select a gate, target, and controls from the workbench. Gates are queued as ordered circuit steps and can be run all at once or stepped one at a time.</p>
              <ul>
                <li><strong>Targets</strong> are the qubit registers modified by a gate.</li>
                <li><strong>Controls</strong> must be distinct from the target and determine when controlled gates fire.</li>
                <li><strong>Measurements</strong> collapse qubits into classical 0/1 outcomes and are recorded in the runtime log.</li>
              </ul>
            </article>
            <article>
              <h3>QPU AST compile requirements</h3>
              <p>A protocol can begin with <code>PARAMS:</code>, should name its entry point with <code>MAIN-PROCESS</code>, and compiles commands with explicit <code>-I</code> inputs and <code>-O</code> outputs where required.</p>
              <ul>
                <li>Primitive gates include X, H, CNOT, CCNOT, and PHASE.</li>
                <li>Derived Boolean gates include NOT, AND, NAND, OR, and XOR.</li>
                <li>Child protocols can be declared, run, and accepted through DECLARECHILD, RUNCHILD, and ACCEPTVALS.</li>
                <li>Constants <code>0p</code>, <code>1p</code>, and <code>sp</code> initialize zero, one, and superposition registers.</li>
              </ul>
            </article>
            <article>
              <h3>Quantum theory references</h3>
              <p>Gate buttons expose the visual vocabulary, while the compiler maps AST operations to state-vector transformations. For deeper theory, start with matrix definitions for Pauli-X, Hadamard, controlled-NOT, Toffoli, phase rotations, and measurement postulates.</p>
              <div className="reference-links">
                <a href="https://en.wikipedia.org/wiki/Quantum_logic_gate" rel="noreferrer" target="_blank">Quantum logic gates</a>
                <a href="https://en.wikipedia.org/wiki/Hadamard_transform" rel="noreferrer" target="_blank">Hadamard transform</a>
                <a href="https://en.wikipedia.org/wiki/Controlled_NOT_gate" rel="noreferrer" target="_blank">Controlled-NOT gate</a>
                <a href="https://www.youtube.com/results?search_query=quantum+logic+gates+explained" rel="noreferrer" target="_blank">YouTube gate explainers</a>
              </div>
            </article>
          </div>
        </section>
      )}

      {activeView === 'qpu-docs' && (
        <section className="panel docs-panel qpu-doc-panel" aria-labelledby="qpu-docs-title">
          <div className="section-heading">
            <p className="eyebrow">Documentation › QPU Documentation</p>
            <h2 id="qpu-docs-title">QPU Circuit Docs PDF</h2>
          </div>
          <p className="canvas-tip">The repository PDF is embedded below for quick reference. If the browser cannot render it, open it directly.</p>
          <div className="pdf-frame">
            <object aria-label="QPU Circuit Docs PDF" data={`${import.meta.env.BASE_URL}QPU_Circuit_Docs.pdf`} type="application/pdf">
              <embed src={`${import.meta.env.BASE_URL}QPU_Circuit_Docs.pdf`} type="application/pdf" title="QPU Circuit Docs PDF" />
            </object>
          </div>
          <a className="primary-link" href={`${import.meta.env.BASE_URL}QPU_Circuit_Docs.pdf`} target="_blank" rel="noreferrer">Open PDF in a new tab</a>
        </section>
      )}

      {activeView === 'files' && (
        <section className="panel files-panel" aria-labelledby="files-title">
          <div className="section-heading">
            <p className="eyebrow">File upload and download</p>
            <h2 id="files-title">Move compiled AST circuits as .qpucir files</h2>
          </div>
          <div className="file-grid">
            <label className="upload-card">
              <strong>Upload files</strong>
              <span>Select a .qpucir JSON export or a plain QPU protocol text file. The app reads the source, compiles it, and opens the circuit builder.</span>
              <input accept=".qpucir,.txt,.qpu,application/json,text/plain" onChange={uploadProtocol} type="file" />
            </label>
            <div className="download-card">
              <strong>Download files</strong>
              <span>Bundled AST examples are exported as pre-saved .qpucir payloads.</span>
              <div className="download-list">
                {protocolExamples.map((example) => (
                  <button key={example.name} onClick={() => downloadConfiguredProtocol(example)} type="button">
                    Download {example.name}
                  </button>
                ))}
                <button onClick={downloadCurrentProtocol} type="button">Download current editor protocol</button>
              </div>
            </div>
          </div>
          <p className="file-status">{fileStatus}</p>
        </section>
      )}

      {activeView === 'particles' && (
        <div className="results-grid standalone-results">
          <ParticleView activeStep={cursor - 1} gates={renderedGates} measurements={measurements} qubitCount={qubitCount} qubitLabels={qubitLabels} startStates={startStates} />
          <OutputPanel log={log} measurements={measurements} qubitCount={qubitCount} state={state} />
        </div>
      )}

      {activeView === 'more' && (
        <section className="panel docs-panel" aria-labelledby="more-title">
          <div className="section-heading">
            <p className="eyebrow">More</p>
            <h2 id="more-title">Quick actions</h2>
          </div>
          <div className="quick-actions">
            <button onClick={() => showView('builder')} type="button">Open circuit builder</button>
            <button onClick={() => showView('files')} type="button">Open file tools</button>
            <button onClick={resetSite} type="button">Reset site completely</button>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
