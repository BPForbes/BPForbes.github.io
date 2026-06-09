import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import {
  buildProcessCatalogSummaries,
  getCatalogEntries,
  getCatalogEntry,
  getCatalogLibrarySources,
  registerCatalogProcess,
} from '../data/processCatalog';
import { downloadQpucirSource } from '../data/qpucirFile';
import { parseQpucirPayload } from '../data/qpucirFile';
import { createBlankProtocol, extractMainProcessName, syncProtocolToTruthTable } from '../simulator/qpuFormat';
import { parseNaturalLanguageCorrection } from '../simulator/naturalLanguageCorrector';
import { parseNaturalLanguageWithWebLlm } from '../simulator/webLlmNaturalLanguageCorrector';
import {
  CorrectionGuidance,
  createEmptyTruthTable,
  createTruthTableFromColumns,
  formatTestFailureSummary,
  inferTruthTableDimensions,
  isTruthCellValue,
  probeModuleOutputs,
  resizeTruthTable,
  runModuleTest,
  serializeTruthTableJson,
  singleBitFullAdderTruthTable,
  testCircuitAgainstTruthTable,
  type TruthCellValue,
  type TruthTable,
  type TruthTableTestResult,
} from '../simulator/moduleTestApi';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

const DEFAULT_INPUTS = ['A', 'B'];
const DEFAULT_OUTPUTS = ['Y'];
const cellOptions: TruthCellValue[] = ['0p', '1p', 'sp'];
const MAX_INPUT_COUNT = 6;
const MAX_OUTPUT_COUNT = 4;

const generateId = () => {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const welcomeMessage = `Welcome to the Circuit Correction Lab. Pick a cataloged process or upload a .qpucir module, shape the truth table, then chat to test and correct circuits.
The lab uses a browser language model when WebGPU is available. If the model cannot load, the built-in command parser is used.
Try: "open SingleBitFullAdder", "test the circuit", or "fix the circuit automatically".`;

const createInitialTruthTable = () => createTruthTableFromColumns(DEFAULT_INPUTS, DEFAULT_OUTPUTS);

const nextColumnNames = (prefix: string, count: number, existing: string[] = []) => (
  Array.from({ length: count }, (_, index) => existing[index] ?? `${prefix}${index}`)
);

export const ModuleLab = () => {
  const [source, setSource] = useState(() => createBlankProtocol(DEFAULT_INPUTS, DEFAULT_OUTPUTS));
  const [truthTable, setTruthTable] = useState<TruthTable>(() => createInitialTruthTable());
  const [lastTestResult, setLastTestResult] = useState<TruthTableTestResult | null>(null);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [status, setStatus] = useState('Adjust the truth-table dimensions or choose a cataloged process to begin.');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', text: welcomeMessage },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [pendingGuidance, setPendingGuidance] = useState<CorrectionGuidance>({});

  const catalogEntries = useMemo(() => getCatalogEntries(), [source, status]);
  const librarySources = useMemo(() => getCatalogLibrarySources(), [catalogEntries.length]);
  const processCatalog = useMemo(() => buildProcessCatalogSummaries(), [catalogEntries.length]);
  const activeProcessName = extractMainProcessName(source);

  const dimensions = useMemo(() => {
    try {
      return truthTable
        ? {
          rowCount: truthTable.rows.length,
          columnCount: truthTable.inputColumns.length + truthTable.outputColumns.length,
          inputCount: truthTable.inputColumns.length,
          outputCount: truthTable.outputColumns.length,
        }
        : null;
    } catch {
      return null;
    }
  }, [truthTable]);

  const failedRowIndexes = useMemo(
    () => new Set(lastTestResult?.failedRows.map((row) => row.rowIndex) ?? []),
    [lastTestResult],
  );

  const pushMessage = (role: ChatMessage['role'], text: string) => {
    setMessages((current) => [...current, { id: generateId(), role, text }]);
  };

  const buildNlContext = (table: TruthTable | null = truthTable) => ({
    source,
    truthTable: table,
    inputColumns: table?.inputColumns ?? [],
    outputColumns: table?.outputColumns ?? [],
    activeProcessName,
    processCatalog,
    lastTestResult,
    libraryProcessNames: Object.keys(librarySources),
  });

  const applySource = (nextSource: string, label: string, resetTable = true) => {
    setSource(nextSource);
    setLastTestResult(null);
    if (resetTable) {
      try {
        setTruthTable(createEmptyTruthTable(nextSource));
      } catch {
        setTruthTable(createInitialTruthTable());
      }
    }
    setStatus(label);
  };

  const loadCatalogProcess = (name: string) => {
    const entry = getCatalogEntry(name);
    if (!entry) {
      setStatus(`Process "${name}" is not in the catalog.`);
      return null;
    }
    setSelectedCatalogId(entry.id);
    applySource(entry.source, `Loaded catalog process ${entry.name}.`);
    pushMessage('assistant', `Loaded ${entry.name} from the process catalog. Say "infer truth table" or "test the circuit" to continue.`);
    return entry;
  };

  const updateCell = (rowIndex: number, columnIndex: number, value: TruthCellValue) => {
    if (!truthTable) return;
    const nextRows = truthTable.rows.map((row, index) => (
      index === rowIndex ? row.map((cell, cellIndex) => (cellIndex === columnIndex ? value : cell)) : row
    ));
    setTruthTable({ ...truthTable, rows: nextRows });
    setLastTestResult(null);
  };

  const updateInputCount = (count: number) => {
    if (!truthTable) return;
    const inputColumns = nextColumnNames('A', count, truthTable.inputColumns);
    const nextTable = resizeTruthTable(truthTable, inputColumns, truthTable.outputColumns);
    setTruthTable(nextTable);
    setSource((current) => syncProtocolToTruthTable(current, inputColumns, nextTable.outputColumns));
    setLastTestResult(null);
  };

  const updateOutputCount = (count: number) => {
    if (!truthTable) return;
    const outputColumns = nextColumnNames('Y', count, truthTable.outputColumns);
    const nextTable = resizeTruthTable(truthTable, truthTable.inputColumns, outputColumns);
    setTruthTable(nextTable);
    setSource((current) => syncProtocolToTruthTable(current, nextTable.inputColumns, outputColumns));
    setLastTestResult(null);
  };

  const uploadQpucir = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const contents = await file.text();
      const parsed = parseQpucirPayload(contents);
      registerCatalogProcess({
        name: parsed.name,
        source: parsed.source,
        origin: 'uploaded',
        description: `Uploaded from ${file.name}`,
      });
      setSelectedCatalogId('');
      applySource(parsed.source, `Loaded ${file.name}.`);
      pushMessage('assistant', `Loaded ${file.name} into the catalog. Say "infer truth table" or "test the circuit" to continue.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Upload error: ${message}`);
      pushMessage('assistant', `Upload failed: ${message}`);
    } finally {
      event.target.value = '';
    }
  };

  const inferTable = () => {
    const table = createEmptyTruthTable(source);
    setTruthTable(table);
    setLastTestResult(null);
    setStatus(`Inferred ${table.rows.length} rows × ${table.inputColumns.length + table.outputColumns.length} columns.`);
    return table;
  };

  const runTestOnly = (table: TruthTable) => {
    const testResult = testCircuitAgainstTruthTable(source, table, librarySources);
    setLastTestResult(testResult);
    const summary = formatTestFailureSummary(testResult);
    setStatus(summary);
    return { testResult, summary };
  };

  const runCorrection = (
    table: TruthTable,
    guidance: CorrectionGuidance,
    autonomous: boolean,
  ) => {
    const response = runModuleTest({
      source,
      truthTable: table,
      librarySources,
      guidance,
      autonomous,
      correct: true,
    });

    if (response.correctedSource) {
      setSource(response.correctedSource);
      registerCatalogProcess({
        name: extractMainProcessName(response.correctedSource) ?? `${activeProcessName ?? 'Circuit'}Corrected`,
        source: response.correctedSource,
        origin: 'corrected',
        description: `Corrected in Circuit Correction Lab (${autonomous ? 'autonomous' : 'guided'})`,
      });
    }

    setLastTestResult(response.testResult);
    const summary = formatTestFailureSummary(response.testResult);
    setStatus(summary);
    return { response, summary };
  };

  const handleIntent = async (text: string) => {
    const context = buildNlContext();

    const intent = await parseNaturalLanguageWithWebLlm(
      text,
      context,
      (progress) => setStatus(progress),
    ) ?? parseNaturalLanguageCorrection(text, context);

    let table = truthTable;
    let guidance: CorrectionGuidance = {
      ...pendingGuidance,
      ...intent.guidance,
      preferredGates: intent.guidance?.preferredGates ?? pendingGuidance.preferredGates,
      gates: intent.guidance?.gates ?? pendingGuidance.gates,
    };

    if (intent.guidance?.preferredGates?.length) {
      setPendingGuidance((current) => ({ ...current, preferredGates: intent.guidance?.preferredGates }));
    }

    if (intent.loadCatalogProcess) {
      const entry = loadCatalogProcess(intent.loadCatalogProcess);
      if (!entry) {
        pushMessage('assistant', `${intent.reply}\n\nI could not find "${intent.loadCatalogProcess}" in the catalog.`);
        return;
      }
    }

    if (intent.loadFullAdderTable) {
      table = singleBitFullAdderTruthTable();
      setTruthTable(table);
      setLastTestResult(null);
    }

    if (intent.inferTable) {
      table = inferTable();
    }

    if (intent.truthTable) {
      table = intent.truthTable;
      setTruthTable(table);
      setLastTestResult(null);
    }

    if (intent.probeOutputs) {
      if (!table) {
        pushMessage('assistant', 'Infer or load a truth table before probing outputs.');
        return;
      }
      table = probeModuleOutputs(source, table, librarySources);
      setTruthTable(table);
      setLastTestResult(null);
    }

    if (intent.runTest) {
      if (!table) {
        table = inferTable();
      }
      try {
        if (intent.autonomous || intent.guidance?.gates?.length) {
          const { summary } = runCorrection(table, guidance, intent.autonomous ?? false);
          pushMessage('assistant', `${intent.reply}\n\n${summary}`);
          if (intent.autonomous) setPendingGuidance({});
        } else {
          const { summary } = runTestOnly(table);
          pushMessage('assistant', `${intent.reply}\n\n${summary}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pushMessage('assistant', `${intent.reply}\n\nCould not complete that action: ${message}`);
      }
      return;
    }

    pushMessage('assistant', intent.reply);
  };

  const submitChat = async (event: FormEvent) => {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    pushMessage('user', text);
    setChatInput('');
    setChatBusy(true);
    try {
      await handleIntent(text);
    } catch (err) {
      console.error('handleIntent failed', err);
      pushMessage('assistant', 'Sorry, something went wrong while processing your message.');
    } finally {
      setChatBusy(false);
    }
  };

  const runManualTest = (autonomous: boolean) => {
    if (!truthTable) {
      setStatus('Infer or load a truth table first.');
      return;
    }
    try {
      if (autonomous) {
        const { summary } = runCorrection(truthTable, pendingGuidance, true);
        pushMessage('assistant', `Autonomous correction finished.\n\n${summary}`);
        setPendingGuidance({});
      } else {
        const { summary } = runTestOnly(truthTable);
        pushMessage('assistant', `Test finished.\n\n${summary}`);
      }
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
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadCircuit = () => {
    try {
      downloadQpucirSource(source, librarySources, activeProcessName ?? 'CorrectedCircuit');
      setStatus('Downloaded corrected circuit as .qpucir.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Download error: ${message}`);
    }
  };

  const quickStatus = useMemo(() => {
    if (lastTestResult) {
      return formatTestFailureSummary(lastTestResult);
    }
    if (!truthTable || !source.trim()) return status;
    try {
      const result = testCircuitAgainstTruthTable(source, truthTable, librarySources);
      return result.passed
        ? `Circuit matches truth table (${result.totalRows}/${result.totalRows} rows).`
        : `Mismatch on ${result.failedRows.length} row(s). Run Test circuit to highlight failures.`;
    } catch {
      return status;
    }
  }, [source, truthTable, status, lastTestResult, librarySources]);

  const allColumns = truthTable ? [...truthTable.inputColumns, ...truthTable.outputColumns] : [];

  return (
    <div className="module-lab-shell">
      <header className="module-lab-hero panel">
        <div>
          <p className="eyebrow">Circuit correction lab</p>
          <h1>Test modules and fix circuits with natural language.</h1>
          <p>Choose a cataloged process or upload a .qpucir file, define the expected truth table, and chat with the correction assistant to translate human instructions into gate-level fixes.</p>
        </div>
      </header>

      <div className="module-lab-layout">
        <section className="module-lab-workspace panel" aria-labelledby="module-lab-workspace-title">
          <div className="section-heading">
            <p className="eyebrow">Module workspace</p>
            <h2 id="module-lab-workspace-title">Protocol and truth table</h2>
          </div>

          <div className="module-tester-grid">
            <label className="upload-card">
              <strong>Upload .qpucir</strong>
              <span>Plain protocol text or qpucir JSON envelope.</span>
              <input accept=".qpucir,.txt,.qpu,application/json,text/plain" onChange={uploadQpucir} type="file" />
            </label>

            <label className="upload-card">
              <strong>Catalog process</strong>
              <span>Recently compiled, uploaded, and bundled processes.</span>
              <select
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedCatalogId(value);
                  if (value) {
                    const entry = catalogEntries.find((candidate) => candidate.id === value);
                    if (entry) loadCatalogProcess(entry.name);
                  }
                }}
                value={selectedCatalogId}
              >
                <option value="">Select a cataloged process…</option>
                {catalogEntries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} ({entry.origin})
                  </option>
                ))}
              </select>
            </label>

            <div className="module-tester-actions">
              <button onClick={() => { inferTable(); pushMessage('assistant', 'Inferred truth-table dimensions from PARAMS and RETURNVALS.'); }} type="button">Infer truth table</button>
              <button onClick={() => { setTruthTable(singleBitFullAdderTruthTable()); setLastTestResult(null); pushMessage('assistant', 'Loaded canonical full-adder truth table.'); }} type="button">Full-adder table</button>
              <button disabled={!truthTable} onClick={() => truthTable && setTruthTable(probeModuleOutputs(source, truthTable, librarySources))} type="button">Probe outputs</button>
              <button disabled={!truthTable} onClick={downloadTruthTable} type="button">Download table</button>
              <button disabled={!source.trim()} onClick={downloadCircuit} type="button">Download .qpucir</button>
            </div>
          </div>

          <div className="truth-table-dimensions">
            <label>
              Input columns
              <input
                max={MAX_INPUT_COUNT}
                min={0}
                onChange={(event) => updateInputCount(Number(event.target.value))}
                type="number"
                value={truthTable?.inputColumns.length ?? 0}
              />
            </label>
            <label>
              Output columns
              <input
                max={MAX_OUTPUT_COUNT}
                min={1}
                onChange={(event) => updateOutputCount(Number(event.target.value))}
                type="number"
                value={truthTable?.outputColumns.length ?? 0}
              />
            </label>
          </div>

          {dimensions && (
            <p className="canvas-tip">
              Table size: {dimensions.rowCount} rows × {dimensions.columnCount} columns.
              {activeProcessName ? ` Active process: ${activeProcessName}.` : ''}
            </p>
          )}

          <textarea
            aria-label="Module protocol source"
            className="module-source-editor"
            onChange={(event) => {
              setSource(event.target.value);
              setLastTestResult(null);
            }}
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
                    <tr
                      className={failedRowIndexes.has(rowIndex) ? 'truth-row-fail' : lastTestResult?.passed ? 'truth-row-pass' : undefined}
                      key={rowIndex}
                    >
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

          <div className="module-tester-actions">
            <button disabled={!truthTable} onClick={() => runManualTest(false)} type="button">Test circuit</button>
            <button disabled={!truthTable} onClick={() => runManualTest(true)} type="button">Correct autonomously</button>
          </div>

          <p className="file-status">{quickStatus}</p>
        </section>

        <section className="module-lab-chat panel" aria-labelledby="module-lab-chat-title">
          <div className="section-heading">
            <p className="eyebrow">Correction chat</p>
            <h2 id="module-lab-chat-title">Natural language assistant</h2>
          </div>

          <div className="chat-log" aria-live="polite">
            {messages.map((message) => (
              <article className={`chat-bubble ${message.role}`} key={message.id}>
                <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
                <p>{message.text}</p>
              </article>
            ))}
          </div>

          <form className="chat-composer" onSubmit={submitChat}>
            <label className="sr-only" htmlFor="correction-chat-input">Describe a correction</label>
            <textarea
              id="correction-chat-input"
              onChange={(event) => setChatInput(event.target.value)}
              placeholder='e.g. "Open IMPLIES", "test the circuit", or "fix the circuit automatically"'
              rows={3}
              value={chatInput}
            />
            <button disabled={chatBusy} type="submit">{chatBusy ? 'Parsing…' : 'Send correction'}</button>
          </form>
        </section>
      </div>
    </div>
  );
};
