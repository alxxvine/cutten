/* Builds the game into one self-contained HTML file: dragon.html.
   Download it, double-click it, and it runs — no server and no internet needed.
   Run with: npm run build:single

   The script order comes from index.html so the build keeps working
   as more files are added. */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('index.html');
const css = read('style.css');

// Collect the linked scripts in exactly the order the markup lists them.
const scriptTag = /<script src="([^"]+)"><\/script>/g;
const scripts = [];
let match;
while ((match = scriptTag.exec(html)) !== null) scripts.push(match[1]);

if (!scripts.length) {
  console.error('No <script src> found in index.html. Build aborted.');
  process.exit(1);
}

const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'Dragon Meadow'])[1];
const icon = (html.match(/<link rel="icon"[^>]*>/) || [''])[0];

// The page body without script tags — we inline them with their contents below.
let body = html.split('<body>')[1].split('</body>')[0];
for (const src of scripts) {
  body = body.replace(`<script src="${src}"></script>`, '');
}

const inlined = scripts
  .map((src) => `<script>\n${read(src).trim()}\n</script>`)
  .join('\n');

const out = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${icon}
<style>
${css.trim()}
</style>
</head>
<body>
${body.trim()}

${inlined}
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'dragon.html'), out);

const kb = Math.round(Buffer.byteLength(out) / 1024);
console.log(`dragon.html built: ${kb} KB, scripts inlined: ${scripts.length}`);
console.log('Files: ' + scripts.join(', '));
