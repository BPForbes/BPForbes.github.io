import fourBitFullAdderQpucir from './processes/four-bit-full-adder.qpucir?raw';
import phaseDemoQpucir from './processes/phase-demo.qpucir?raw';
import singleBitFullAdderQpucir from './processes/single-bit-full-adder.qpucir?raw';
import twoBitFullAdderQpucir from './processes/two-bit-full-adder.qpucir?raw';
import type { CircuitGate } from '../simulator/types';

export type QpucirPayload = {
  format: 'qpucir';
  version: 1;
  name: string;
  source: string;
  compiled?: {
    qubitCount: number;
    gates: CircuitGate[];
    tokenMap: Record<string, number>;
  };
  exportedAt?: string;
};

export type ConfiguredQpucirProcess = QpucirPayload & {
  fileName: string;
  contents: string;
};

const parseConfiguredProcess = (fileName: string, contents: string): ConfiguredQpucirProcess => {
  const payload = JSON.parse(contents) as QpucirPayload;
  if (payload.format !== 'qpucir' || payload.version !== 1 || typeof payload.name !== 'string' || typeof payload.source !== 'string') {
    throw new Error(`${fileName} is not a valid .qpucir process file.`);
  }

  return { ...payload, fileName, contents };
};

export const configuredProcesses = [
  parseConfiguredProcess('four-bit-full-adder.qpucir', fourBitFullAdderQpucir),
  parseConfiguredProcess('two-bit-full-adder.qpucir', twoBitFullAdderQpucir),
  parseConfiguredProcess('single-bit-full-adder.qpucir', singleBitFullAdderQpucir),
  parseConfiguredProcess('phase-demo.qpucir', phaseDemoQpucir),
];

const protocolLibraryNames: Record<string, string> = {
  'single-bit-full-adder.qpucir': 'SingleBitFullAdder',
  'two-bit-full-adder.qpucir': 'TwoBitFullAdder',
};

export const protocolLibrary = Object.fromEntries(
  configuredProcesses
    .filter((process) => protocolLibraryNames[process.fileName])
    .map((process) => [protocolLibraryNames[process.fileName], process.source]),
) as Record<string, string>;

export const protocolExamples = configuredProcesses;
