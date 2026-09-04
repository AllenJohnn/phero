const fs = require('fs');
let code = fs.readFileSync('tests/adapters/chatgpt-virtualizer.test.ts', 'utf8');
code = code.replace(/virtualizer\.innerHTML = '';/g, `virtualizer.innerHTML = '';
      if (typeof start !== 'undefined' && start > 0) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      } else if (typeof currentStart !== 'undefined' && currentStart > 0) {
        const spinner = dom.window.document.createElement('svg');
        spinner.className = 'animate-spin';
        virtualizer.appendChild(spinner);
      }`);
fs.writeFileSync('tests/adapters/chatgpt-virtualizer.test.ts', code);
