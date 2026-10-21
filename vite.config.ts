import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves project sites from /<repository>/. Dev keeps the root path.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/OpenBOR-Workbench/' : '/',
  plugins: [react()],
  build: {
    sourcemap: false,
  },
}));
