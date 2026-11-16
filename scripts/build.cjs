const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = ['index.html', 'styles.css', 'core.js', 'bridge.js', 'app.js', 'host.js'];
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'dist'));
for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(root, 'dist', file));
}
fs.writeFileSync(path.join(root, 'dist', '.nojekyll'), '');
console.log('Static files ready in dist/');
