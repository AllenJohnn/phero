const fs = require('fs');

let claudeTest = fs.readFileSync('tests/adapters/claude.test.ts', 'utf8');
claudeTest = claudeTest.replace(
  "const dom = new JSDOM(html, { url: 'https://claude.ai/chat/incomplete-conv-id' });",
  "const dom = new JSDOM(html, { url: 'https://claude.ai/chat/incomplete-conv-id' });\n      (globalThis as any).PHERO_MOCK_IS_AT_TOP = false;"
);
fs.writeFileSync('tests/adapters/claude.test.ts', claudeTest);

let chatgptTest = fs.readFileSync('tests/adapters/chatgpt.test.ts', 'utf8');
chatgptTest = chatgptTest.replace(
  "const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/long-thread-id' });",
  "const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/long-thread-id' });\n      (globalThis as any).PHERO_MOCK_IS_AT_TOP = false;"
);
fs.writeFileSync('tests/adapters/chatgpt.test.ts', chatgptTest);

let chatgptCap = fs.readFileSync('src/adapters/chatgpt/capture.ts', 'utf8');
chatgptCap = chatgptCap.replace(
  "return true;\n  }\n\n  public getScrollContainer",
  "return false;\n  }\n\n  public getScrollContainer"
);
fs.writeFileSync('src/adapters/chatgpt/capture.ts', chatgptCap);

let orch = fs.readFileSync('src/core/capture/orchestrator.ts', 'utf8');
orch = orch.replace(
  "if (metrics.isAtTop && strategy.isAtBeginning(doc, collectedMessages)) {",
  "if (metrics.isAtTop || strategy.isAtBeginning(doc, collectedMessages)) {"
);
fs.writeFileSync('src/core/capture/orchestrator.ts', orch);
