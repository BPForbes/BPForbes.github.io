/**
 * Tiny feature probe for browser-only WebGPU support.
 *
 * Keeping the check behind a function prevents server-side or test environments
 * from touching `navigator` unless the caller explicitly asks for WebGPU.
 */
export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}
