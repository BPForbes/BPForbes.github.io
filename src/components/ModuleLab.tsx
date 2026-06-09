import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { protocolExamples, protocolLibrary } from '../data/protocolExamples';
import { parseNaturalLanguageCorrection } from '../simulator/naturalLanguageCorrector';
import { parseNaturalLanguageWithWebLlm } from '../simulator/webLlmNaturalLanguageCorrector';
import {
  CorrectionGuidance,
  createEmptyTruthTable,
  inferTruthTableDimensions,
  isTruthCellValue,
  probeModuleOutputs,
  runModuleTest,
  serializeTruthTableJson,
  singleBitFullAdderTruthTable,
  testCircuitAgainstTruthTable,
  type TruthCellValue,
  type TruthTable,
} from '../simulator/moduleTestApi';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

const defaultSource = protocolExamples.find((example) => example.name.includes('Single'))?.source
  ?? protocolExamples[0].source;

const cellOptions: TruthCellValue[] = ['0p', '1p', 'sp'];

const generateId = () => {
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const welcomeMessage = `Welcome to the Circuit Correction Lab. Upload a .qpucir module, infer or load a truth table, then describe fixes in plain language.
The lab uses a browser language model when WebGPU is available. If the model cannot load, the built-in command parser is used.
Try: "load the full adder truth table", "add a CNOT from A to Sum", or "fix the circuit automatically".`;

export const ModuleLab = () => {
  const [source, setSource] = useState(defaultSource);
  const [truthTable, setTruthTable] = useState<TruthTable | null>(null);
  const [status, setStatus] = useState('Upload a module or edit the protocol below, then chat to test and correct it.');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', text: welcomeMessage },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [pendingGuidance, setPendingGuidance] = useState<CorrectionGuidance>({});

  const dimensions = useMemo(() => {
    try {
      return source.trim() ? inferTruthTableDimensions(source) : null;
    } catch {
      return null;
    }
  }, [source]);

  const inferredColumns = dimensions ? getColumnsFromSource(source) : { inputs: [], outputs: [] };
  const inputColumns = truthTable?.inputColumns ?? inferredColumns.inputs;
  const outputColumns = truthTable?.outputColumns ?? inferredColumns.outputs;

  const pushMessage = (role: ChatMessage['role'], text: string) => {
    setMessages((current) => [...current, { id: generateId(), role, text }]);
  };

  const updateCell = (rowIndex: number, columnIndex: number, value: TruthCellValue) => {
    if (!truthTable) return;
    const nextRows = truthTable.rows.map((row, index) => (
      index === rowIndex ? row.map((cell, cellIndex) => (cellIndex === columnIndex ? value : cell)) : row
    ));
    setTruthTable({ ...truthTable, rows: nextRows });
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
        // Plain-text uploads are accepted.
      }
      setSource(nextSource);
      setTruthTable(null);
      setStatus(`Loaded ${file.name}.`);
      pushMessage('assistant', `Loaded ${file.name}. Say "infer truth table" or "load full adder truth table" to continue.`);
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
    setStatus(`Inferred ${table.rows.length} rows × ${table.inputColumns.length + table.outputColumns.length} columns.`);
    return table;
  };

  const executeCorrection = (
    table: TruthTable,
    guidance: CorrectionGuidance,
    autonomous: boolean,
  ) => {
    const response = runModuleTest({
      source,
      truthTable: table,
      librarySources: protocolLibrary,
      guidance,
      autonomous,
    });

    if (response.correctedSource) {
      setSource(response.correctedSource);
    }

    const summary = response.testResult.passed
      ? `All ${response.testResult.totalRows} truth-table rows pass.`
      : `${response.testResult.failedRows.length} row(s) still fail (${response.testResult.passedRows}/${response.testResult.totalRows} pass).`;

    setStatus(summary);
    return { response, summary };
  };

  const handleIntent = async (text: string) => {
    const context = {
      source,
      truthTable,
      inputColumns,
      outputColumns,
    };

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

    if (intent.loadFullAdderTable) {
      table = singleBitFullAdderTruthTable();
      setTruthTable(table);
    }

    if (intent.inferTable) {
      table = inferTable();
    }

    if (intent.truthTable) {
      table = intent.truthTable;
      setTruthTable(table);
    }

    if (intent.probeOutputs) {
      if (!table) {
        pushMessage('assistant', 'Infer or load a truth table before probing outputs.');
        return;
      }
      table = probeModuleOutputs(source, table, protocolLibrary);
      setTruthTable(table);
    }

    if (intent.runTest) {
      if (!table) {
        table = inferTable();
      }
      try {
        const { summary } = executeCorrection(table, guidance, intent.autonomous ?? false);
        pushMessage('assistant', `${intent.reply}\n\n${summary}`);
        if (intent.autonomous || intent.guidance?.gates?.length) {
          setPendingGuidance({});
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
      const { summary } = executeCorrection(truthTable, pendingGuidance, autonomous);
      pushMessage('assistant', autonomous ? `Autonomous correction finished.\n\n${summary}` : `Test finished.\n\n${summary}`);
      if (autonomous) setPendingGuidance({});
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

  const quickStatus = useMemo(() => {
    if (!truthTable) return status;
    try {
      const result = testCircuitAgainstTruthTable(source, truthTable, protocolLibrary);
      return result.passed
        ? `Circuit matches truth table (${result.totalRows}/${result.totalRows} rows).`
        : `Mismatch on ${result.failedRows.length} row(s).`;
    } catch {
      return status;
    }
  }, [source, truthTable, status]);

  const allColumns = truthTable ? [...truthTable.inputColumns, ...truthTable.outputColumns] : [];

  return (
    <div className="module-lab-shell">
      <header className="module-lab-hero panel">
        <div>
          <p className="eyebrow">Circuit correction lab</p>
          <h1>Test modules and fix circuits with natural language.</h1>
          <p>Upload a .qpucir file, define the expected truth table, and chat with the correction assistant to translate human instructions into gate-level fixes.</p>
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

            <div className="module-tester-actions">
              <button onClick={() => { inferTable(); pushMessage('assistant', 'Inferred truth-table dimensions from PARAMS and RETURNVALS.'); }} type="button">Infer truth table</button>
              <button onClick={() => { setTruthTable(singleBitFullAdderTruthTable()); pushMessage('assistant', 'Loaded canonical full-adder truth table.'); }} type="button">Full-adder table</button>
              <button disabled={!truthTable} onClick={() => truthTable && setTruthTable(probeModuleOutputs(source, truthTable, protocolLibrary))} type="button">Probe outputs</button>
              <button disabled={!truthTable} onClick={downloadTruthTable} type="button">Download table</button>
            </div>
          </div>

          {dimensions && (
            <p className="canvas-tip">
              Inferred size: {dimensions.rowCount} rows × {dimensions.columnCount} columns.
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
              placeholder='e.g. "Add a CNOT from A to Sum" or "fix the circuit automatically"'
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

function getColumnsFromSource(source: string) {
  try {
    const table = createEmptyTruthTable(source);
    return { inputs: table.inputColumns, outputs: table.outputColumns };
  } catch {
    return { inputs: [], outputs: [] };
  }
}
