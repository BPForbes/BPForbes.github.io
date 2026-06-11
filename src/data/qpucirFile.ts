import { compileQpuProtocol } from '../simulator/qpuAst';
import { qpucirTxtFileNameForProcess } from './qpuFileNames';
import { extractMainProcessName, qpucirFileNameForSource } from '../simulator/qpuFormat';
import type { QpucirPayload } from './protocolExamples';

export const createQpucirPayload = (
  name: string,
  source: string,
  librarySources: Record<string, string> = {},
): QpucirPayload => {
  const compiled = compileQpuProtocol(source, librarySources);
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

export const parseQpucirPayload = (contents: string): { name: string; source: string } => {
  try {
    const parsed = JSON.parse(contents) as Partial<QpucirPayload>;
    if (parsed.format === 'qpucir' && typeof parsed.source === 'string') {
      const safeName = typeof parsed.name === 'string' && parsed.name.trim()
        ? parsed.name
        : 'Uploaded QPU circuit';
      return { name: safeName, source: parsed.source };
    }
  } catch {
    // Plain-text protocol uploads are accepted as a convenience for hand-authored circuits.
  }
  return { name: extractMainProcessName(contents) ?? 'Uploaded QPU circuit', source: contents };
};

export const downloadQpucirContents = (fileName: string, contents: string) => {
  const blob = new Blob([contents], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const downloadQpucirSource = (
  source: string,
  _librarySources: Record<string, string> = {},
  fallbackName = 'CircuitProcess',
) => {
  const name = extractMainProcessName(source) ?? fallbackName;
  downloadQpucirContents(qpucirFileNameForSource(source, name), source);
};

export const downloadQpucirTxtSource = (
  source: string,
  fallbackName = 'CircuitProcess',
) => {
  const name = extractMainProcessName(source) ?? fallbackName;
  downloadQpucirContents(qpucirTxtFileNameForProcess(name), source);
};
