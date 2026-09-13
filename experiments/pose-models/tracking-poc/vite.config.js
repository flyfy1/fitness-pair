import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  server: { fs: { allow: ['../../..'] } },
  build: { rollupOptions: { input: {
    lab: fileURLToPath(new URL('./index.html', import.meta.url)),
    methodology: fileURLToPath(new URL('./methodology/index.html', import.meta.url)),
  } } },
});
