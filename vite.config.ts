import { defineConfig, build } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { copyFileSync, existsSync, mkdirSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'build-extension-bundles',
      async closeBundle() {
        if (!existsSync('dist')) {
          mkdirSync('dist', { recursive: true });
        }

        // 1. Bundle content.js as a completely self-contained IIFE (no imports)
        await build({
          configFile: false,
          plugins: [react()],
          resolve: {
            alias: {
              '@': path.resolve(__dirname, './src'),
            },
          },
          define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
          },
          build: {
            emptyOutDir: false,
            outDir: 'dist',
            lib: {
              entry: path.resolve(__dirname, 'src/content/index.ts'),
              name: 'PheroContent',
              formats: ['iife'],
              fileName: () => 'content.js',
            },
            rollupOptions: {
              output: {
                extend: true,
                inlineDynamicImports: true,
              },
            },
          },
        });

        // 2. Bundle background.js as a clean self-contained service worker
        await build({
          configFile: false,
          resolve: {
            alias: {
              '@': path.resolve(__dirname, './src'),
            },
          },
          define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
          },
          build: {
            emptyOutDir: false,
            outDir: 'dist',
            lib: {
              entry: path.resolve(__dirname, 'src/background/index.ts'),
              name: 'PheroBackground',
              formats: ['es'],
              fileName: () => 'background.js',
            },
            rollupOptions: {
              output: {
                inlineDynamicImports: true,
              },
            },
          },
        });

        // 3. Copy manifest.json
        if (existsSync('manifest.json')) {
          copyFileSync('manifest.json', 'dist/manifest.json');
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'src/ui/popup/index.html'),
      },
    },
  },
});
