import fourBitFullAdderQpucir from './processes/four-bit-full-adder.qpucir?raw';
import fourBitFullAdderQpuio from './processes/four-bit-full-adder.qpuio?raw';
import phaseDemoQpucir from './processes/phase-demo.qpucir?raw';
import phaseDemoQpuio from './processes/phase-demo.qpuio?raw';
import singleBitFullAdderQpuio from './processes/single-bit-full-adder.qpuio?raw';
import singleBitFullAdderQpucir from './processes/single-bit-full-adder.qpucir?raw';
import twoBitFullAdderQpucir from './processes/two-bit-full-adder.qpucir?raw';
import twoBitFullAdderQpuio from './processes/two-bit-full-adder.qpuio?raw';
import { parseQpuioPayload } from './qpuioFile';
import type { CircuitGate } from '../simulator/types';
import { extractMainProcessName } from '../simulator/qpuFormat';
import type { TruthTable } from '../simulator/truthTable';

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

export type ConfiguredQpucirProcess = {
  format: 'qpucir';
  version: 1;
  name: string;
  source: string;
  fileName: string;
  contents: string;
  truthTable?: TruthTable;
  truthTableFileName?: string;
  compiled?: QpucirPayload['compiled'];
  exportedAt?: string;
};

const parseConfiguredProcess = (
  fileName: string,
  contents: string,
  truthTableBundle?: { fileName: string; contents: string },
): ConfiguredQpucirProcess => {
  let payload: QpucirPayload;

  try {
    payload = JSON.parse(contents) as QpucirPayload;
  } catch {
    const name = extractMainProcessName(contents) ?? fileName.replace(/\.qpucir$/i, '');
    const truthTable = truthTableBundle
      ? parseQpuioPayload(truthTableBundle.contents, contents).truthTable
      : undefined;
    return {
      format: 'qpucir',
      version: 1,
      name,
      source: contents,
      fileName,
      contents,
      truthTable,
      truthTableFileName: truthTableBundle?.fileName,
    };
  }

  if (payload.format !== 'qpucir' || payload.version !== 1 || typeof payload.name !== 'string' || typeof payload.source !== 'string') {
    throw new Error(`${fileName} is not a valid .qpucir process file.`);
  }

  const truthTable = truthTableBundle
    ? parseQpuioPayload(truthTableBundle.contents, payload.source).truthTable
    : undefined;

  return {
    ...payload,
    fileName,
    contents: payload.source,
    truthTable,
    truthTableFileName: truthTableBundle?.fileName,
  };
};

const bundledQpuio = (fileName: string, contents: string) => ({ fileName, contents });

export const configuredProcesses = [
  parseConfiguredProcess('four-bit-full-adder.qpucir', fourBitFullAdderQpucir, bundledQpuio('four-bit-full-adder.qpuio', fourBitFullAdderQpuio)),
  parseConfiguredProcess('two-bit-full-adder.qpucir', twoBitFullAdderQpucir, bundledQpuio('two-bit-full-adder.qpuio', twoBitFullAdderQpuio)),
  parseConfiguredProcess('single-bit-full-adder.qpucir', singleBitFullAdderQpucir, bundledQpuio('single-bit-full-adder.qpuio', singleBitFullAdderQpuio)),
  parseConfiguredProcess('phase-demo.qpucir', phaseDemoQpucir, bundledQpuio('phase-demo.qpuio', phaseDemoQpuio)),
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
