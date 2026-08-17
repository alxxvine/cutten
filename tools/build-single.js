/* Собирает игру в один самодостаточный HTML-файл: dragon.html.
   Такой файл можно скачать и открыть двойным кликом — без сервера и без интернета.
   Запуск: npm run build:single

   Порядок скриптов берётся из index.html, чтобы сборка не рассыпалась,
   когда файлов станет больше. */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('index.html');
const css = read('style.css');

// Собираем список подключённых скриптов ровно в том порядке, в каком они в разметке.
const scriptTag = /<script src="([^"]+)"><\/script>/g;
const scripts = [];
let match;
while ((match = scriptTag.exec(html)) !== null) scripts.push(match[1]);

if (!scripts.length) {
  console.error('В index.html не нашлось ни одного <script src>. Сборка отменена.');
  process.exit(1);
}

const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'Дракончик'])[1];
const icon = (html.match(/<link rel="icon"[^>]*>/) || [''])[0];

// Тело страницы без тегов скриптов — их подставим уже с содержимым.
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
console.log(`dragon.html собран: ${kb} КБ, скриптов внутри: ${scripts.length}`);
console.log('Файлы: ' + scripts.join(', '));
