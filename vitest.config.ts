import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./src/__tests__/setup.ts'],
    // Multi-step userEvent flows (typing long @mentions, awaiting parallel
    // agent replies) can comfortably exceed the 5s default under system
    // load without indicating a real hang, so allow more headroom.
    testTimeout: 15000,
  },
});
