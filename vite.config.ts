import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.STACK_API_PORT ?? 5174);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 127.0.0.1, not localhost: the API only listens on IPv4 loopback.
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
});
