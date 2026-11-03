import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Shown in the app footer so you can tell exactly which commit is live (compare with the latest commit on GitHub).
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  define: { __BUILD_ID__: JSON.stringify(BUILD) },
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
});
