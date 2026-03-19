import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000'
  const isProduction = mode === 'production'

  return {
    plugins: [
      react(),
      viteCompression({
        algorithm: 'gzip',
        ext: '.gz',
        threshold: 1024,
        deleteOriginFile: false,
      }),
      viteCompression({
        algorithm: 'brotliCompress',
        ext: '.br',
        threshold: 1024,
        deleteOriginFile: false,
      }),
    ],
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      minify: 'esbuild',
      target: 'es2020',
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }

            if (
              id.includes('/react/')
              || id.includes('/react-dom/')
              || id.includes('/scheduler/')
            ) {
              return 'react-vendor'
            }

            if (
              id.includes('/@tanstack/react-query/')
              || id.includes('/@tanstack/query-core/')
              || id.includes('/@tanstack/react-virtual/')
              || id.includes('/@tanstack/virtual-core/')
            ) {
              return 'tanstack-query'
            }

            if (
              id.includes('/framer-motion/')
              || id.includes('/motion-dom/')
              || id.includes('/motion-utils/')
            ) {
              return 'framer-motion'
            }

            if (id.includes('/react-router/')) {
              return 'router'
            }

            if (
              id.includes('/react-hook-form/')
              || id.includes('/@hookform/')
              || id.includes('/zod/')
            ) {
              return 'forms'
            }

            return 'vendor'
          },
        },
      },
    },
    esbuild: isProduction
      ? {
        drop: ['console', 'debugger'],
      }
      : undefined,
  }
})
