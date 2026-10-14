/** Configure the single static frontend and isolated component tests. */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: env.VITE_DEV_HOST || '127.0.0.1',
      port: Number(env.VITE_DEV_PORT || 5173),
      strictPort: true,
    },
    preview: {
      host: env.VITE_PREVIEW_HOST || '127.0.0.1',
      port: Number(env.VITE_PREVIEW_PORT || 4173),
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.js'],
      include: ['tests/**/*.test.{js,jsx}'],
      exclude: ['e2e/**', 'node_modules/**'],
      pool: 'forks',
      minWorkers: 1,
      maxWorkers: 1,
    },
  };
});
