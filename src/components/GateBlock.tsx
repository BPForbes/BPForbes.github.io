import { GateType } from '../simulator/types';

type GateBlockProps = {
  type: GateType;
  draggable?: boolean;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onDragStart?: (gate: GateType) => void;
};

export const gateLabels: Record<GateType, string> = {
  X: 'X',
  H: 'H',
  CNOT: 'CX',
  CCNOT: 'CCX',
  PHASE: 'P',
  NOT: '¬',
  AND: 'AND',
  NAND: 'NAND',
  OR: 'OR',
  XOR: 'XOR',
  MEASURE: 'M',
};

export function GateBlock({ type, draggable = false, selected = false, compact = false, onClick, onDragStart }: GateBlockProps) {
  return (
    <button
      className={`gate gate-${type.toLowerCase()} ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`}
      draggable={draggable}
      onClick={onClick}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', type);
        onDragStart?.(type);
      }}
      type="button"
      aria-label={`${type} gate`}
    >
      <span>{gateLabels[type]}</span>
    </button>
  );
}
