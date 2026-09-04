const fs = require('fs');
const content = fs.readFileSync('src/adapters/chatgpt/network-capture.ts', 'utf8');
const match = content.match(/export function getPageWorldInterceptorSource\(\): string \{\s*return `([\s\S]*?)`;\s*\}/);
const jsdom = require('jsdom');
const dom = new jsdom.JSDOM('', { runScripts: 'dangerously' });
const doc = dom.window.document;
const script = doc.createElement('script');
script.textContent = match[1];
try {
  doc.head.appendChild(script);
  console.log('JSDOM parsed it successfully');
} catch (e) {
  console.log('JSDOM Syntax Error:', e);
}
