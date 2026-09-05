const fs = require('fs');

// Update page-world.ts to send logs via CustomEvent
let pw = fs.readFileSync('src/adapters/chatgpt/page-world.ts', 'utf8');
pw = pw.replace(/console\.log\((.*?)\)/g, "document.dispatchEvent(new CustomEvent('__phero_chatgpt_log__', { detail: $1 }))");
// But we still want actual console.logs in the page world just in case.
pw = pw.replace(/document\.dispatchEvent\(new CustomEvent\('__phero_chatgpt_log__', { detail: (.*?) }\)\)/g, "console.log($1); document.dispatchEvent(new CustomEvent('__phero_chatgpt_log__', { detail: $1 }))");

fs.writeFileSync('src/adapters/chatgpt/page-world.ts', pw);

// Update network-capture.ts to listen to these logs
let nc = fs.readFileSync('src/adapters/chatgpt/network-capture.ts', 'utf8');
nc = nc.replace(/export function installNetworkCaptureListener\(doc: Document\): void \{/, `export function installNetworkCaptureListener(doc: Document): void {
  doc.addEventListener('__phero_chatgpt_log__', ((e: CustomEvent) => {
    Logger.info('[MAIN WORLD] ' + e.detail);
  }) as EventListener);
`);
fs.writeFileSync('src/adapters/chatgpt/network-capture.ts', nc);
