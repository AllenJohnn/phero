const fs = require('fs');
let pw = fs.readFileSync('src/adapters/chatgpt/page-world.ts', 'utf8');
pw = pw.replace(
  '  checkRemixContext();\n  checkNextData();',
  `  // Periodically check for Remix context on initial load since it won't exist at document_start
  let loadCheckCount = 0;
  const loadCheckInterval = setInterval(() => {
    checkRemixContext();
    checkNextData();
    loadCheckCount++;
    if (loadCheckCount > 20 || (window as any).__remixContext) { // 20 * 500ms = 10s max
      clearInterval(loadCheckInterval);
    }
  }, 500);`
);
// Also let's fix the API check to be stricter so we don't log garbage endpoints like limits
pw = pw.replace(/const isBackendApi = url.includes\('\/backend-api\/conversation\/'\);/, "const isBackendApi = url.includes('/backend-api/conversation/') && !url.includes('/limits') && !url.includes('/limit');");

fs.writeFileSync('src/adapters/chatgpt/page-world.ts', pw);
