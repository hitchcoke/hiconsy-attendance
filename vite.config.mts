import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig(({ mode }) => {
  const apiUrl =
    process.env.VITE_API_URL ||
    loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL ||
    'http://127.0.0.1:3000/api';
  const origin = new URL(apiUrl).origin;
  return {
    plugins: [
      vue(),
      {
        name: 'api-content-security-policy',
        transformIndexHtml: (html: string) =>
          html.replace("connect-src 'self'", `connect-src 'self' ${origin}`),
      },
    ],
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl) },
    base: './',
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: { outDir: 'dist/renderer', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  };
});
