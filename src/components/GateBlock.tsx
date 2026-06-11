import { getGateDefinition, gateLabels } from '../simulator/gates/registry';
import { GateType } from '../simulator/types';

type GateBlockProps = {
  type: GateType;
  draggable?: boolean;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onDragStart?: (gate: GateType) => void;
};

const fallbackLabels: Record<string, string> = {
  RESET: 'R',
};

export function GateBlock({ type, draggable = false, selected = false, compact = false, onClick, onDragStart }: GateBlockProps) {
  const definition = getGateDefinition(type);
  const labels = gateLabels();
  const label = definition?.label ?? labels[type] ?? fallbackLabels[type] ?? type;
  const cssClass = definition?.cssClass ?? `gate-${String(type).toLowerCase()}`;
  const customStyle = definition?.color ? { background: definition.color } : undefined;

  return (
    <button
      className={`gate ${cssClass} ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`}
      draggable={draggable}
      onClick={onClick}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', type);
        onDragStart?.(type);
      }}
      style={customStyle}
      type="button"
      aria-label={`${type} gate`}
    >
      <span>{label}</span>
    </button>
  );
}
