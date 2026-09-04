const fs = require('fs');
const content = fs.readFileSync('src/adapters/chatgpt/network-capture.ts', 'utf8');
const match = content.match(/export function getPageWorldInterceptorSource\(\): string \{\s*return `([\s\S]*?)`;\s*\}/);
if (match) {
  try {
    new (require('vm').Script)(match[1]);
    console.log('Valid syntax!');
  } catch(e) {
    console.log('Syntax Error:', e);
  }
}
