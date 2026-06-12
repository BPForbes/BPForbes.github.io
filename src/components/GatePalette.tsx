import { customPaletteGates, preconfiguredPaletteGates } from '../simulator/gates/registry';
import { GateType } from '../simulator/types';
import { GateBlock } from './GateBlock';
// UI surface for GatePalette in the circuit builder shell.

type GatePaletteProps = {
  selectedGate: GateType | null;
  onSelectGate: (gate: GateType) => void;
};

export function GatePalette({ selectedGate, onSelectGate }: GatePaletteProps) {
  const preconfigured = preconfiguredPaletteGates();
  const custom = customPaletteGates();

  return (
    <div className="palette-sections">
      <div className="palette-section">
        <h3 className="palette-section-title">Preconfigured</h3>
// Section 1: GatePalette implementation detail.
        <div className="palette">
          {preconfigured.map((gate) => (
            <GateBlock
              draggable
              key={gate.id}
              onClick={() => onSelectGate(gate.id)}
              onDragStart={onSelectGate}
              selected={selectedGate === gate.id}
              type={gate.id}
            />
          ))}
        </div>
      </div>

      <div className="palette-section">
        <h3 className="palette-section-title">Custom gates</h3>
        {custom.length === 0 ? (
          <p className="palette-empty">Register a process as a custom gate below to add it here.</p>
// Section 2: GatePalette implementation detail.
        ) : (
          <div className="palette palette-custom">
            {custom.map((gate) => (
              <GateBlock
                draggable
                key={gate.id}
                onClick={() => onSelectGate(gate.id)}
                onDragStart={onSelectGate}
                selected={selectedGate === gate.id}
                type={gate.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
