import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { build as esbuild } from 'esbuild'

function serviceWorkerPlugin(): Plugin {
  const compileSw = async () => {
    try {
      await esbuild({
        entryPoints: [path.resolve(__dirname, 'src/sw/sw.ts')],
        outfile: path.resolve(__dirname, 'public/sw.js'),
        bundle: true,
        format: 'iife',
        target: 'es2022',
        sourcemap: false,
      })
    } catch (err) {
      console.error('[SW Plugin] Compilation failed:', err)
    }
  }

  return {
    name: 'vite-plugin-service-worker-compiler',
    async buildStart() {
      await compileSw()
    },
    async handleHotUpdate({ file }) {
      if (file.includes('/src/sw/')) {
        await compileSw()
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    serviceWorkerPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['appa.basingse.bug'],
  },
})
