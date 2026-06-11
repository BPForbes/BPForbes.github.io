export const QPUCIR_TXT_MARKER = '-qpucir';
export const QPUIO_TXT_MARKER = '-qpuio';

export const QPU_FILE_UPLOAD_ACCEPT = '.qpucir,.qpuio,.txt,.qpu,application/json,text/plain';

export const isTxtFileName = (fileName: string) => /\.txt$/i.test(fileName);

export const isQpucirFileName = (fileName: string) => (
  /\.qpucir$/i.test(fileName)
  || new RegExp(`${QPUCIR_TXT_MARKER}\\.txt$`, 'i').test(fileName)
);

export const isQpuioFileName = (fileName: string) => (
  /\.qpuio$/i.test(fileName)
  || new RegExp(`${QPUIO_TXT_MARKER}\\.txt$`, 'i').test(fileName)
);

export const isLooseQpucirUpload = (fileName: string) => (
  isQpucirFileName(fileName)
  || /\.qpu$/i.test(fileName)
  || (!/\.[^./\\]+$/i.test(fileName) && !isQpuioFileName(fileName))
);

export const validateUploadFileName = (fileName: string): void => {
  if (isTxtFileName(fileName) && !isQpucirFileName(fileName) && !isQpuioFileName(fileName)) {
    throw new Error(
      'Text uploads must include -qpucir or -qpuio in the filename (e.g. RsNorLatchStep-qpucir.txt).',
    );
  }
};

export const qpucirTxtFileNameForProcess = (processName: string) => `${processName}${QPUCIR_TXT_MARKER}.txt`;

export const qpuioTxtFileNameForProcess = (processName: string) => `${processName}${QPUIO_TXT_MARKER}.txt`;

export const companionQpuioFileName = (qpucirFileName: string) => {
  if (/\.qpucir$/i.test(qpucirFileName)) {
    return qpucirFileName.replace(/\.qpucir$/i, '.qpuio');
  }
  if (new RegExp(`${QPUCIR_TXT_MARKER}\\.txt$`, 'i').test(qpucirFileName)) {
    return qpucirFileName.replace(new RegExp(`${QPUCIR_TXT_MARKER}\\.txt$`, 'i'), `${QPUIO_TXT_MARKER}.txt`);
  }
  return `${qpucirFileName}.qpuio`;
};

export const companionQpucirFileName = (qpuioFileName: string) => {
  if (/\.qpuio$/i.test(qpuioFileName)) {
    return qpuioFileName.replace(/\.qpuio$/i, '.qpucir');
  }
  if (new RegExp(`${QPUIO_TXT_MARKER}\\.txt$`, 'i').test(qpuioFileName)) {
    return qpuioFileName.replace(new RegExp(`${QPUIO_TXT_MARKER}\\.txt$`, 'i'), `${QPUCIR_TXT_MARKER}.txt`);
  }
  return `${qpuioFileName}.qpucir`;
};

export const processStemFromQpuioFileName = (fileName: string) => {
  if (/\.qpuio$/i.test(fileName)) return fileName.replace(/\.qpuio$/i, '');
  if (new RegExp(`${QPUIO_TXT_MARKER}\\.txt$`, 'i').test(fileName)) {
    return fileName.replace(new RegExp(`${QPUIO_TXT_MARKER}\\.txt$`, 'i'), '');
  }
  return fileName;
};
