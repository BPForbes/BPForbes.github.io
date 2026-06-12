import { correctCircuit, type CorrectionGuidance } from './circuitCorrector';
import type { TruthTable, TruthTableTestResult } from './truthTable';
import { testCircuitAgainstTruthTable } from './truthTable';

export type ChildCorrectionResult = {
// Simulator support for childProcessCorrection.
  processName: string;
  corrected: boolean;
  source: string;
  testResult: TruthTableTestResult;
};

// Internal helper: CHILD_REFERENCE_PATTERN.
const CHILD_REFERENCE_PATTERN = /^\s*(?:DECLARECHILD|RUNCHILD|CALL)\s+(\S+)/i;

export const getReferencedChildProcesses = (source: string): string[] => {
  const children = new Set<string>();
  source.replace(/\r\n/g, '\n').split('\n').forEach((line) => {
    const match = line.match(CHILD_REFERENCE_PATTERN);
    if (match) children.add(match[1]);
  });
  return Array.from(children);
};

// Descendant discovery follows nested DECLARE/RUNCHILD/CALL references so fixes can respect child truth tables.
export const collectDescendantProcesses = (
  processName: string,
  librarySources: Record<string, string>,
): string[] => {
  const descendants: string[] = [];
  const visited = new Set<string>();

  const visit = (name: string) => {
    if (visited.has(name)) return;
    visited.add(name);
    const source = librarySources[name];
    if (!source) return;
    getReferencedChildProcesses(source).forEach((childName) => {
      visit(childName);
      if (!descendants.includes(childName)) {
        descendants.push(childName);
      }
    });
  };

  visit(processName);
  return descendants;
};

// Leaf-first ordering corrects dependencies before parents that call them.
export const orderProcessesLeafFirst = (
  processNames: string[],
  librarySources: Record<string, string>,
): string[] => {
  const ordered: string[] = [];
  const visited = new Set<string>();

  const visit = (name: string) => {
    if (visited.has(name)) return;
    visited.add(name);
    const source = librarySources[name];
    if (!source) {
      ordered.push(name);
      return;
    }
    getReferencedChildProcesses(source).forEach(visit);
    ordered.push(name);
  };

  processNames.forEach(visit);
  return ordered;
};

// Public API: correctChildProcessesForCompatibility.
export const correctChildProcessesForCompatibility = (
  parentProcessName: string,
  librarySources: Record<string, string>,
  getTruthTable: (processName: string) => TruthTable | undefined,
  guidance?: CorrectionGuidance,
  autonomous = true,
): { librarySources: Record<string, string>; childCorrections: ChildCorrectionResult[] } => {
  const descendants = collectDescendantProcesses(parentProcessName, librarySources);
  const ordered = orderProcessesLeafFirst(descendants, librarySources);
  const nextLibrary = { ...librarySources };
  const childCorrections: ChildCorrectionResult[] = [];

  // Each corrected child is written into the working library before ancestors are tested against it.
  ordered.forEach((processName) => {
    const truthTable = getTruthTable(processName);
    const source = nextLibrary[processName];
    if (!truthTable || !source) return;

    let currentSource = source;
    let testResult = testCircuitAgainstTruthTable(currentSource, truthTable, nextLibrary);
    let corrected = false;

    if (!testResult.passed) {
      const correction = correctCircuit(
        currentSource,
        truthTable,
        nextLibrary,
        guidance,
        { autonomous },
      );
      currentSource = correction.source;
      testResult = correction.testResult;
      corrected = correction.corrected;
    }

    nextLibrary[processName] = currentSource;
    childCorrections.push({ processName, corrected, source: currentSource, testResult });
  });

  return { librarySources: nextLibrary, childCorrections };
};
