import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    cloudflare(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'FleetOps Unified',
        short_name: 'FleetOps',
        description: 'Unified Fleet Operations & Evidence Platform',
        theme_color: '#2563eb',
        icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.fleetops\.com\/api\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 50, maxAgeSeconds: 86400 } }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@worker': path.resolve(__dirname, 'worker/src')
    }
  },
  server: { host: true, port: 5173 },
  build: { target: 'es2022', sourcemap: true }
});
