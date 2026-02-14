import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const frontendDir = dirname(fileURLToPath(import.meta.url));
const frontendPackage = JSON.parse(
  readFileSync(resolve(frontendDir, 'package.json'), 'utf8')
) as { version?: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = (env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const appName = env.VITE_APP_NAME?.trim() || 'LoRaMapr';
  const appVersion = frontendPackage.version || '0.0.0';

  return {
    plugins: [react()],
    define: {
      __APP_NAME__: JSON.stringify(appName),
      __APP_VERSION__: JSON.stringify(appVersion)
    },
    server: {
      proxy: {
        '/api': {
          target,
          changeOrigin: true
        }
      }
    }
  };
});
