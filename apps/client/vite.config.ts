import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rolldownOptions: { input: { game: resolve('index.html'), study: resolve('art-study.html') } },
  },
});
