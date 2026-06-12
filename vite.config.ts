/**
 * Vite/Vitest configuration for the React QPU application.
 *
 * The WebLLM package is excluded from dependency pre-bundling because it is
 * loaded dynamically only when browser-based correction assistance is used.
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm'],
  },
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
