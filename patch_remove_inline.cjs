const fs = require('fs');
let content = fs.readFileSync('src/adapters/chatgpt/network-capture.ts', 'utf8');

// Remove getPageWorldInterceptorSource and injectPageWorldInterceptor completely
content = content.replace(/export function getPageWorldInterceptorSource[\s\S]*?export function injectPageWorldInterceptor\(doc: Document\): void \{[\s\S]*?\}/, '');

fs.writeFileSync('src/adapters/chatgpt/network-capture.ts', content);

let indexContent = fs.readFileSync('src/adapters/chatgpt/index.ts', 'utf8');
indexContent = indexContent.replace(/import \{ injectPageWorldInterceptor, installNetworkCaptureListener \} from '.\/network-capture.ts';/, "import { installNetworkCaptureListener } from './network-capture.ts';");
indexContent = indexContent.replace(/injectPageWorldInterceptor\(doc\);/, "");
fs.writeFileSync('src/adapters/chatgpt/index.ts', indexContent);
