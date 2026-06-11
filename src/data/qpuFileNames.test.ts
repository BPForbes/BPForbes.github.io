import { describe, expect, it } from 'vitest';
import {
  companionQpucirFileName,
  companionQpuioFileName,
  isQpucirFileName,
  isQpuioFileName,
  qpucirTxtFileNameForProcess,
  qpuioTxtFileNameForProcess,
  validateUploadFileName,
} from './qpuFileNames';

describe('qpuFileNames', () => {
  it('recognizes qpucir and qpuio txt naming', () => {
    expect(isQpucirFileName('adder.qpucir')).toBe(true);
    expect(isQpucirFileName('RsNorLatchStep-qpucir.txt')).toBe(true);
    expect(isQpuioFileName('adder.qpuio')).toBe(true);
    expect(isQpuioFileName('RsNorLatchStep-qpuio.txt')).toBe(true);
    expect(isQpucirFileName('notes.txt')).toBe(false);
    expect(isQpuioFileName('notes.txt')).toBe(false);
  });

  it('rejects plain txt uploads without type markers', () => {
    expect(() => validateUploadFileName('notes.txt')).toThrow(/-qpucir|-qpuio/i);
    expect(() => validateUploadFileName('RsNorLatchStep.txt')).toThrow(/-qpucir|-qpuio/i);
  });

  it('allows tagged txt uploads', () => {
    expect(() => validateUploadFileName('RsNorLatchStep-qpucir.txt')).not.toThrow();
    expect(() => validateUploadFileName('RsNorLatchStep-qpuio.txt')).not.toThrow();
  });

  it('builds download filenames', () => {
    expect(qpucirTxtFileNameForProcess('RsNorLatchStep')).toBe('RsNorLatchStep-qpucir.txt');
    expect(qpuioTxtFileNameForProcess('RsNorLatchStep')).toBe('RsNorLatchStep-qpuio.txt');
  });

  it('maps companion names across qpucir and txt conventions', () => {
    expect(companionQpuioFileName('adder.qpucir')).toBe('adder.qpuio');
    expect(companionQpuioFileName('RsNorLatchStep-qpucir.txt')).toBe('RsNorLatchStep-qpuio.txt');
    expect(companionQpucirFileName('adder.qpuio')).toBe('adder.qpucir');
    expect(companionQpucirFileName('RsNorLatchStep-qpuio.txt')).toBe('RsNorLatchStep-qpucir.txt');
  });
});
