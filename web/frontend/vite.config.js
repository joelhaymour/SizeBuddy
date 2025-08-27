import { defineConfig } from "vite";
import { dirname } from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import dotenv from 'dotenv';

dotenv.config();

if (
  process.env.npm_lifecycle_event === "build" &&
  !process.env.CI &&
  !process.env.VITE_SHOPIFY_API_KEY
) {
  console.warn("\nWarning: VITE_SHOPIFY_API_KEY not found in environment variables");
}

const host = process.env.HOST
  ? process.env.HOST.replace(/https?:\/\//, "")
  : "localhost";

console.log('Vite config initializing with:', {
  host,
  FRONTEND_PORT: process.env.FRONTEND_PORT,
  BACKEND_PORT: process.env.BACKEND_PORT,
  NODE_ENV: process.env.NODE_ENV
});

// HMR configuration
const hmrConfig = host === "localhost" 
  ? {
      protocol: "ws",
      host: "localhost",
      port: 64999,
      clientPort: 64999,
    }
  : false;

export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  plugins: [react()],
  define: {
    "process.env.SHOPIFY_API_KEY": JSON.stringify(process.env.VITE_SHOPIFY_API_KEY),
  },
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    host: "localhost",
    port: process.env.FRONTEND_PORT || 5173,
    hmr: hmrConfig,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BACKEND_PORT || 3000}`,
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, _res) => {
            console.error('Proxy error:', {
              error: err.message,
              stack: err.stack,
              url: req.url,
              method: req.method,
              headers: req.headers
            });
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Proxy request:', {
              url: req.url,
              method: req.method,
              headers: req.headers,
              body: req.body
            });
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Proxy response:', {
              url: req.url,
              method: req.method,
              status: proxyRes.statusCode,
              headers: proxyRes.headers
            });
          });
        }
      }
    }
  },
});
