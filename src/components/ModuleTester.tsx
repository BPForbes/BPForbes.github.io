import { ChangeEvent, useMemo, useState } from 'react';
import { protocolLibrary } from '../data/protocolExamples';
import {
  CorrectionGuidance,
  GatePreference,
  createEmptyTruthTable,
  inferTruthTableDimensions,
  isTruthCellValue,
  probeModuleOutputs,
  runModuleTest,
  serializeTruthTableJson,
  singleBitFullAdderTruthTable,
  type TruthCellValue,
  type TruthTable,
} from '../simulator/moduleTestApi';

type ModuleTesterProps = {
  initialSource?: string;
  onApplySource?: (source: string) => void;
};

const gateOptions: GatePreference[] = ['CNOT', 'CCNOT', 'X', 'H', 'NOT', 'AND', 'OR', 'XOR'];

const cellOptions: TruthCellValue[] = ['0p', '1p', 'sp'];

export const ModuleTester = ({ initialSource = '', onApplySource }: ModuleTesterProps) => {
  const [source, setSource] = useState(initialSource);
  const [truthTable, setTruthTable] = useState<TruthTable | null>(null);
  const [status, setStatus] = useState('Upload a .qpucir file or paste protocol source, then define or infer a truth table.');
  const [guidedGate, setGuidedGate] = useState<GatePreference>('CNOT');
  const [guidedInputs, setGuidedInputs] = useState('');
  const [guidedOutput, setGuidedOutput] = useState('');
  const [preferredGates, setPreferredGates] = useState<GatePreference[]>(['CNOT', 'CCNOT']);
  const [lastResult, setLastResult] = useState<string>('');

  const dimensions = useMemo(() => {
    try {
      return source.trim() ? inferTruthTableDimensions(source) : null;
    } catch {
      return null;
    }
  }, [source]);

  const updateCell = (rowIndex: number, columnIndex: number, value: TruthCellValue) => {
    if (!truthTable) return;
    const nextRows = truthTable.rows.map((row, index) => (
      index === rowIndex ? row.map((cell, cellIndex) => (cellIndex === columnIndex ? value : cell)) : row
    ));
    setTruthTable({ ...truthTable, rows: nextRows });
  };

  const loadSource = (nextSource: string, label: string) => {
    setSource(nextSource);
    setTruthTable(null);
    setStatus(`Loaded ${label}. Infer dimensions or load a truth table to begin testing.`);
  };

  const uploadQpucir = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const contents = await file.text();
      let nextSource = contents;
      try {
        const parsed = JSON.parse(contents) as { format?: string; source?: string };
        if (parsed.format === 'qpucir' && typeof parsed.source === 'string') {
          nextSource = parsed.source;
        }
      } catch {
        // Plain-text .qpucir uploads are accepted.
      }
      loadSource(nextSource, file.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Upload error: ${message}`);
    } finally {
      event.target.value = '';
    }
  };

  const inferTable = () => {
    try {
      const table = createEmptyTruthTable(source);
      setTruthTable(table);
      setStatus(`Inferred ${table.rows.length} row(s) × ${table.inputColumns.length + table.outputColumns.length} column(s) from PARAMS and RETURNVALS.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Infer error: ${message}`);
    }
  };

  const loadFullAdderExample = () => {
    setTruthTable(singleBitFullAdderTruthTable());
    setStatus('Loaded canonical single-bit full adder truth table.');
  };

  const probeOutputs = () => {
    if (!truthTable) {
      setStatus('Infer or load a truth table first.');
      return;
    }
    try {
      const probed = probeModuleOutputs(source, truthTable, protocolLibrary);
      setTruthTable(probed);
      setStatus('Filled output columns by simulating the current circuit for each input row.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Probe error: ${message}`);
    }
  };

  const runTest = (autonomous: boolean) => {
    if (!truthTable) {
      setStatus('Infer or load a truth table before testing.');
      return;
    }

    const guidance: CorrectionGuidance = {
      preferredGates,
      gates: guidedInputs.trim() && guidedOutput.trim()
        ? [{
          gate: guidedGate,
          inputs: guidedInputs.split(/\s+/).filter(Boolean),
          output: guidedOutput.trim(),
        }]
        : undefined,
    };

    try {
      const response = runModuleTest({
        source,
        truthTable,
        librarySources: protocolLibrary,
        guidance,
        autonomous,
      });
      setLastResult(JSON.stringify({
        passed: response.testResult.passed,
        passedRows: response.testResult.passedRows,
        totalRows: response.testResult.totalRows,
        failedRows: response.testResult.failedRows,
        correctionSteps: response.correctionSteps,
      }, null, 2));

      if (response.correctedSource && !response.testResult.passed) {
        setSource(response.correctedSource);
        onApplySource?.(response.correctedSource);
        setStatus(`Correction attempted; ${response.testResult.passedRows}/${response.testResult.totalRows} rows pass. Updated editor source.`);
        return;
      }

      if (response.correctedSource && response.testResult.passed) {
        setSource(response.correctedSource);
        onApplySource?.(response.correctedSource);
        setStatus(`Circuit corrected successfully (${response.testResult.passedRows}/${response.testResult.totalRows} rows pass).`);
        return;
      }

      setStatus(response.testResult.passed
        ? `All ${response.testResult.totalRows} truth-table rows pass.`
        : `${response.testResult.failedRows.length} row(s) failed; add guided gates or run autonomous correction.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Test error: ${message}`);
    }
  };

  const downloadTruthTable = () => {
    if (!truthTable) return;
    const blob = new Blob([serializeTruthTableJson(truthTable)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'truth-table.json';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const allColumns = truthTable ? [...truthTable.inputColumns, ...truthTable.outputColumns] : [];

  return (
    <section className="panel module-tester-panel" aria-labelledby="module-tester-title">
      <div className="section-heading">
        <p className="eyebrow">Module test API</p>
        <h2 id="module-tester-title">Verify and correct .qpucir modules against truth tables</h2>
      </div>

      <div className="module-tester-grid">
        <label className="upload-card">
          <strong>Upload .qpucir</strong>
          <span>Plain protocol text or qpucir JSON envelope.</span>
          <input accept=".qpucir,.txt,.qpu,application/json,text/plain" onChange={uploadQpucir} type="file" />
        </label>

        <div className="module-tester-actions">
          <button onClick={inferTable} type="button">Infer truth-table dimensions</button>
          <button onClick={loadFullAdderExample} type="button">Load full-adder truth table</button>
          <button disabled={!truthTable} onClick={probeOutputs} type="button">Probe outputs from circuit</button>
          <button disabled={!truthTable} onClick={downloadTruthTable} type="button">Download truth table JSON</button>
        </div>
      </div>

      {dimensions && (
        <p className="canvas-tip">
          Inferred size: {dimensions.rowCount} rows × {dimensions.columnCount} columns
          ({dimensions.inputCount} input(s), {dimensions.outputCount} output(s)).
        </p>
      )}

      <textarea
        aria-label="Module protocol source"
        className="module-source-editor"
        onChange={(event) => setSource(event.target.value)}
        spellCheck={false}
        value={source}
      />

      {truthTable && (
        <div className="truth-table-editor-wrap">
          <table className="truth-table-editor">
            <thead>
              <tr>
                <th>#</th>
                {allColumns.map((column, index) => (
                  <th key={column} className={index < truthTable.inputColumns.length ? 'input-col' : 'output-col'}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {truthTable.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td>{rowIndex}</td>
                  {row.map((cell, columnIndex) => (
                    <td key={`${rowIndex}-${columnIndex}`}>
                      <select
                        onChange={(event) => {
                          const value = event.target.value;
                          if (isTruthCellValue(value)) updateCell(rowIndex, columnIndex, value);
                        }}
                        value={cell}
                      >
                        {cellOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="guided-correction-panel">
        <summary>Guided correction (preferred gates and -I / -O bindings)</summary>
        <div className="guided-grid">
          <label>
            Preferred gates
            <select
              multiple
              onChange={(event) => {
                const selected = Array.from(event.target.selectedOptions)
                  .map((option) => option.value)
                  .filter((value): value is GatePreference => gateOptions.includes(value as GatePreference));
                setPreferredGates(selected);
              }}
              value={preferredGates}
            >
              {gateOptions.map((gate) => <option key={gate} value={gate}>{gate}</option>)}
            </select>
          </label>
          <label>
            Gate to insert
            <select onChange={(event) => setGuidedGate(event.target.value as GatePreference)} value={guidedGate}>
              {gateOptions.map((gate) => <option key={gate} value={gate}>{gate}</option>)}
            </select>
          </label>
          <label>
            -I registers (space-separated)
            <input onChange={(event) => setGuidedInputs(event.target.value)} placeholder="$A:0 $B:0" value={guidedInputs} />
          </label>
          <label>
            -O register
            <input onChange={(event) => setGuidedOutput(event.target.value)} placeholder="Sum:0" value={guidedOutput} />
          </label>
        </div>
      </details>

      <div className="module-tester-actions">
        <button disabled={!truthTable} onClick={() => runTest(false)} type="button">Test only</button>
        <button disabled={!truthTable} onClick={() => runTest(true)} type="button">Test and correct autonomously</button>
      </div>

      <p className="file-status">{status}</p>
      {lastResult && (
        <details>
          <summary>Last API response</summary>
          <pre>{lastResult}</pre>
        </details>
      )}
    </section>
  );
};
