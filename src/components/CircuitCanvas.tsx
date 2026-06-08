import { CircuitGate, GateType, isGateType } from '../simulator/types';
import { GateBlock } from './GateBlock';

type CircuitCanvasProps = {
  qubitCount: number;
  gates: CircuitGate[];
  activeStep: number;
  selectedGate: GateType | null;
  onDropGate: (gate: GateType, qubit: number) => void;
  onRemoveGate: (gateId: string) => void;
};

const gateTouchesQubit = (gate: CircuitGate, qubit: number) => gate.targets.includes(qubit) || gate.controls.includes(qubit);

export function CircuitCanvas({ qubitCount, gates, activeStep, selectedGate, onDropGate, onRemoveGate }: CircuitCanvasProps) {
  const sorted = gates.slice().sort((a, b) => a.step - b.step);
  const columns = Math.max(6, sorted.length + 2);

  const handleDrop = (event: React.DragEvent, qubit: number) => {
    event.preventDefault();
    const droppedGate = event.dataTransfer.getData('text/plain');
    if (isGateType(droppedGate)) onDropGate(droppedGate, qubit);
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
            <div className="wire-row" key={qubit}>
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
                      className={`placed-gate step-${gate.step} ${activeStep === gate.step ? 'active' : ''}`}
                      style={{ ['--step' as string]: gate.step + 1 }}
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
      <p className="canvas-tip">Tip: CNOT targets the wire you drop on and auto-selects a nearby control. CCNOT uses two controls.</p>
    </section>
  );
}
