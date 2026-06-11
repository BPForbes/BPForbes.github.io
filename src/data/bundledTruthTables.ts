import type { TruthCellValue, TruthTable } from '../simulator/truthTable';
import { indexToInputRow } from '../simulator/truthTable';

const bit = (value: number): TruthCellValue => (value === 1 ? '1p' : '0p');

const adderRow = (
  aBits: number[],
  bBits: number[],
  cin: number,
): { sumBits: number[]; cout: number } => {
  const width = Math.max(aBits.length, bBits.length);
  const sumBits: number[] = [];
  let carry = cin;
  for (let index = 0; index < width; index += 1) {
    const a = aBits[index] ?? 0;
    const b = bBits[index] ?? 0;
    const total = a + b + carry;
    sumBits.push(total & 1);
    carry = total > 1 ? 1 : 0;
  }
  return { sumBits, cout: carry };
};

export const twoBitFullAdderTruthTable = (): TruthTable => {
  const inputColumns = ['A0', 'A1', 'B0', 'B1', 'Cin'];
  const outputColumns = ['Cout', 'S1tmp', 'S0tmp'];
  const rows = Array.from({ length: 32 }, (_, rowIndex) => {
    const inputs = indexToInputRow(rowIndex, inputColumns.length).map((cell) => (cell === '1p' ? 1 : 0));
    const [a0, a1, b0, b1, cin] = inputs;
    const low = adderRow([a0], [b0], cin);
    const high = adderRow([a1], [b1], low.cout);
    return [...inputs.map(bit), bit(high.cout), bit(high.sumBits[0]), bit(low.sumBits[0])];
  });
  return { inputColumns, outputColumns, rows };
};

export const fourBitFullAdderTruthTable = (): TruthTable => {
  const inputColumns = ['A0', 'A1', 'A2', 'A3', 'B0', 'B1', 'B2', 'B3', 'Cin'];
  const outputColumns = ['C4', 'Sum3', 'Sum2', 'Sum1', 'Sum0'];
  const rows = Array.from({ length: 512 }, (_, rowIndex) => {
    const inputs = indexToInputRow(rowIndex, inputColumns.length).map((cell) => (cell === '1p' ? 1 : 0));
    const aBits = inputs.slice(0, 4);
    const bBits = inputs.slice(4, 8);
    const cin = inputs[8];
    const { sumBits, cout } = adderRow(aBits, bBits, cin);
    return [
      ...inputs.map(bit),
      bit(cout),
      bit(sumBits[3]),
      bit(sumBits[2]),
      bit(sumBits[1]),
      bit(sumBits[0]),
    ];
  });
  return { inputColumns, outputColumns, rows };
};

export const phaseDemoTruthTable = (): TruthTable => ({
  inputColumns: [],
  outputColumns: ['Q0'],
  rows: [['sp']],
});
