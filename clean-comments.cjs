const fs = require('fs');
const path = require('path');

function strip(code) {
  return code.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, (match, p1) => {
    if (p1 !== undefined) return p1;
    return '';
  });
}

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
      const src = fs.readFileSync(fullPath, 'utf8');
      const cleaned = strip(src);
      if (cleaned !== src) {
        fs.writeFileSync(fullPath, cleaned, 'utf8');
        console.log('Cleaned', fullPath);
      }
    }
  }
}

processDir(path.join(__dirname, 'src'));
