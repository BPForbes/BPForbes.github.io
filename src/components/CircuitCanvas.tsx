import { isKnownGateType } from '../simulator/gates/registry';
import { CircuitGate, GateType } from '../simulator/types';
import { GateBlock } from './gate/GateBlock';
type CircuitCanvasProps = {
  qubitCount: number;
  gates: CircuitGate[];
  activeStep: number;
  selectedGate: GateType | null;
  qubitColors: string[];
  onDropGate: (gate: GateType, qubit: number) => void;
  onRemoveGate: (gateId: string) => void;
};

const gateTouchesQubit = (gate: CircuitGate, qubit: number) => gate.targets.includes(qubit) || gate.controls.includes(qubit);

export function CircuitCanvas({ qubitCount, gates, activeStep, selectedGate, qubitColors, onDropGate, onRemoveGate }: CircuitCanvasProps) {
  // Columns are step-indexed rather than pixel-positioned so tap, drag, and keyboard placement share one layout model.
  const sorted = gates.slice().sort((a, b) => a.step - b.step);
  const columns = Math.max(6, sorted.length + 2);

  // Drag data is validated against the live registry before it can mutate the circuit.
  const handleDrop = (event: React.DragEvent, qubit: number) => {
    event.preventDefault();
    const droppedGate = event.dataTransfer.getData('text/plain');
    if (isKnownGateType(droppedGate)) onDropGate(droppedGate, qubit);
  };

  const placeSelectedGate = (qubit: number) => {
    if (selectedGate) onDropGate(selectedGate, qubit);
  };

  return (
    <section className="panel circuit-panel" aria-labelledby="circuit-title">
      <div className="section-heading">
        <p className="eyebrow">Circuit canvas</p>
        <h2 id="circuit-title">Drag or tap gates onto wires</h2>
      </div>
      <div className="canvas-scroll" style={{ ['--columns' as string]: columns }}>
        <div className="circuit-grid">
          {Array.from({ length: qubitCount }, (_, qubit) => (
            <div className="wire-row" key={qubit} style={{ ['--particle-color' as string]: qubitColors[qubit] }}>
              <div className="wire-label">q{qubit}</div>
              <div
                className={`wire-lane ${selectedGate ? 'ready' : ''}`}
                onClick={() => placeSelectedGate(qubit)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, qubit)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') placeSelectedGate(qubit);
                }}
                role="button"
                tabIndex={0}
              >
                <span className="wire-line" />
                {sorted.map((gate) => {
                  if (!gateTouchesQubit(gate, qubit)) return null;
                  const isTarget = gate.targets.includes(qubit);
                  const isControl = gate.controls.includes(qubit);
                  return (
                    <span
                      className={`placed-gate step-${gate.step} ${activeStep === gate.step ? 'active' : ''} ${activeStep >= gate.step ? 'done' : ''}`}
                      style={{ ['--step' as string]: gate.step + 1, ['--gate-color' as string]: qubitColors[qubit] }}
                      key={`${gate.id}-${qubit}`}
                    >
                      {isControl ? <span className="control-dot" title={`${gate.type} control`} /> : null}
                      {isTarget ? (
                        <span
                          className="placed-target"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveGate(gate.id);
                          }}
                        >
                          <GateBlock type={gate.type} compact />
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="canvas-tip">Tip: each q-line gets a particle color; mixed control/target operations are connected across the colored wires.</p>
    </section>
  );
}
