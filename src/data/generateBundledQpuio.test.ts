import { writeFileSync } from 'fs';
import { describe, it } from 'vitest';
import {
  fourBitFullAdderTruthTable,
  phaseDemoTruthTable,
  twoBitFullAdderTruthTable,
} from './bundledTruthTables';
import { serializeQpuioText } from './qpuioFile';

const writeProcess = (fileName: string, contents: string) => writeFileSync(new URL(`./processes/${fileName}`, import.meta.url), contents);

describe('generate bundled qpuio', () => {
  it('generate qpuio files for bundled processes', () => {
    writeProcess('two-bit-full-adder.qpuio', serializeQpuioText('TwoBitFullAdder', twoBitFullAdderTruthTable()));
    writeProcess('four-bit-full-adder.qpuio', serializeQpuioText('FourBitFullAdder', fourBitFullAdderTruthTable()));
    writeProcess('phase-demo.qpuio', `${serializeQpuioText('PhaseDemo', phaseDemoTruthTable()).replace(
      'MAIN-PROCES: PhaseDemo\n',
      'MAIN-PROCES: PhaseDemo\nINPUTS: Init\nOUTPUTS: Q0\n',
    )}`);
  });
});
