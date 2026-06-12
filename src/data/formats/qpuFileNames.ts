/**
 * File-name conventions for QPU protocol and truth-table artifacts.
 *
 * Centralizing companion-name logic keeps upload validation, downloads, and
 * restrictive file-picker fallbacks aligned for `.qpucir`, `.qpuio`, and tagged
 * `.txt` variants.
 */
// Canonical types remain .qpucir/.qpuio; tagged .txt aliases support restrictive file pickers.
export const QPUCIR_TXT_MARKER = '-qpucir';
export const QPUIO_TXT_MARKER = '-qpuio';

const QPUCIR_EXTENSION_PATTERN = /\.qpucir$/i;
const QPUCIR_TXT_PATTERN = new RegExp(`${QPUCIR_TXT_MARKER}\\.txt$`, 'i');
const QPUIO_EXTENSION_PATTERN = /\.qpuio$/i;
const QPUIO_TXT_PATTERN = new RegExp(`${QPUIO_TXT_MARKER}\\.txt$`, 'i');

export const QPU_FILE_UPLOAD_ACCEPT = '.qpucir,.qpuio,.txt,.qpu,application/json,text/plain';

export const isTxtFileName = (fileName: string) => /\.txt$/i.test(fileName);

export const isQpucirFileName = (fileName: string) => (
  QPUCIR_EXTENSION_PATTERN.test(fileName)
  || QPUCIR_TXT_PATTERN.test(fileName)
);

export const isQpuioFileName = (fileName: string) => (
  QPUIO_EXTENSION_PATTERN.test(fileName)
  || QPUIO_TXT_PATTERN.test(fileName)
);

export const isLooseQpucirUpload = (fileName: string) => (
  isQpucirFileName(fileName)
  || /\.qpu$/i.test(fileName)
  || (!/\.[^./\\]+$/i.test(fileName) && !isQpuioFileName(fileName))
);

export const validateUploadFileName = (fileName: string): void => {
  if (isTxtFileName(fileName) && !isQpucirFileName(fileName) && !isQpuioFileName(fileName)) {
    throw new Error(
      'Plain .txt uploads must include -qpucir or -qpuio in the filename (e.g. RsNorLatchStep-qpucir.txt). Use .qpucir or .qpuio when your device supports them.',
    );
  }
};

export const qpucirTxtFileNameForProcess = (processName: string) => `${processName}${QPUCIR_TXT_MARKER}.txt`;

export const qpuioTxtFileNameForProcess = (processName: string) => `${processName}${QPUIO_TXT_MARKER}.txt`;

export const companionQpuioFileName = (qpucirFileName: string) => {
  if (QPUCIR_EXTENSION_PATTERN.test(qpucirFileName)) {
    return qpucirFileName.replace(QPUCIR_EXTENSION_PATTERN, '.qpuio');
  }
  if (QPUCIR_TXT_PATTERN.test(qpucirFileName)) {
    return qpucirFileName.replace(QPUCIR_TXT_PATTERN, `${QPUIO_TXT_MARKER}.txt`);
  }
  return `${qpucirFileName}.qpuio`;
};

export const companionQpucirFileName = (qpuioFileName: string) => {
  if (QPUIO_EXTENSION_PATTERN.test(qpuioFileName)) {
    return qpuioFileName.replace(QPUIO_EXTENSION_PATTERN, '.qpucir');
  }
  if (QPUIO_TXT_PATTERN.test(qpuioFileName)) {
    return qpuioFileName.replace(QPUIO_TXT_PATTERN, `${QPUCIR_TXT_MARKER}.txt`);
  }
  return `${qpuioFileName}.qpucir`;
};

export const processStemFromQpuioFileName = (fileName: string) => {
  let stem = fileName;
  if (QPUIO_EXTENSION_PATTERN.test(fileName)) {
    stem = fileName.replace(QPUIO_EXTENSION_PATTERN, '');
  } else if (QPUIO_TXT_PATTERN.test(fileName)) {
    stem = fileName.replace(QPUIO_TXT_PATTERN, '');
  }
  if (!stem && (QPUIO_EXTENSION_PATTERN.test(fileName) || QPUIO_TXT_PATTERN.test(fileName))) {
    throw new Error(
      `QPUIO filename '${fileName}' has an empty process stem (e.g. '.qpuio' or '-qpuio.txt' are invalid).`,
    );
  }
  return stem;
};
