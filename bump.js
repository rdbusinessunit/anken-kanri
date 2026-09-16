/* 更新のたびに版番号を付け直す道具。
   使い方（このフォルダで）:  node bump.js
   index.html の APP_VERSION と version.json を今の日時に更新します。
   push の前に実行すると、利用者のブラウザが古いページを表示し続けるのを防げます。 */
const fs = require('fs');
const v = new Date().toLocaleString('sv-SE').replace(/[-: ]/g, '').slice(0, 12);
let html = fs.readFileSync('index.html', 'utf8');
if (!/const APP_VERSION = "\d+"/.test(html)) throw new Error('index.html に APP_VERSION が見つかりません');
html = html.replace(/const APP_VERSION = "\d+"/, `const APP_VERSION = "${v}"`);
fs.writeFileSync('index.html', html);
fs.writeFileSync('version.json', JSON.stringify({ version: v }) + '\n');
console.log('版番号を ' + v + ' にしました');
