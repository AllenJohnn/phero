const fs = require('fs');
let code = fs.readFileSync('tests/adapters/chatgpt-virtualizer.test.ts', 'utf8');
code = code.replace(/\\'COMPLETE\\'/g, "'COMPLETE'");
fs.writeFileSync('tests/adapters/chatgpt-virtualizer.test.ts', code);
