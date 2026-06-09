import { compileQpuProtocol } from '../simulator/qpuAst';
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
      return { name: parsed.name ?? 'Uploaded QPU circuit', source: parsed.source };
    }
  } catch {
    // Plain-text protocol uploads are accepted as a convenience for hand-authored circuits.
  }
  return { name: extractMainProcessName(contents) ?? 'Uploaded QPU circuit', source: contents };
};

export const downloadQpucirContents = (fileName: string, contents: string) => {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadQpucirSource = (
  source: string,
  librarySources: Record<string, string> = {},
  fallbackName = 'CircuitProcess',
) => {
  const name = extractMainProcessName(source) ?? fallbackName;
  const payload = createQpucirPayload(name, source, librarySources);
  downloadQpucirContents(qpucirFileNameForSource(source, name), JSON.stringify(payload, null, 2));
};
