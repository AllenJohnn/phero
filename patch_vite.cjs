const fs = require('fs');
const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
const newViteConfig = viteConfig.replace(
  '// 2. Bundle background.js',
  `// 2. Bundle page-world.js
        await build({
          configFile: false,
          resolve: { alias: { '@': path.resolve(__dirname, './src') } },
          define: { 'process.env.NODE_ENV': JSON.stringify('production') },
          build: {
            emptyOutDir: false,
            outDir: 'dist',
            lib: {
              entry: path.resolve(__dirname, 'src/adapters/chatgpt/page-world.ts'),
              name: 'PheroPageWorld',
              formats: ['iife'],
              fileName: () => 'page-world.js',
            }
          },
        });

        // 2.5 Bundle background.js`
);
fs.writeFileSync('vite.config.ts', newViteConfig);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
manifest.content_scripts.push({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  js: ['page-world.js'],
  run_at: 'document_start',
  world: 'MAIN'
});
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
