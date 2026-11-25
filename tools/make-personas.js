/* ペルソナ一覧表（xlsx）から、アプリが読む personas.json を作る。
   使い方: node tools/make-personas.js <ペルソナ一覧表.xlsx> . */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { load } = require('./xlsxread.js');

/* 表の見出し → アプリで使う短い名前 */
const MAP = {
  'No.': 'id', '人物像名': 'name',
  'ペルソナタイプ（メイン）': 'type', 'ペルソナタイプ（サブ）': 'sub',
  '年代': 'gen', '年齢（歳）': 'age', '性別': 'sex',
  '家族区分': 'fam', '子どもの年齢（末子）': 'child',
  '現在の状況': 'stat', '国籍': 'nat', '希望の働き方': 'work',
  '応募のきっかけ': 'trig', '主な不安': 'worry', '重視ポイント（複数）': 'pts',
  '現在の職種': 'job', '家族構成': 'home', '趣味': 'hobby',
  '仕事選びの希望': 'hope', '応募前の不安': 'fear', '応募の決め手': 'win',
};

const sh = load(process.argv[2])[0];
const headRow = sh.rows.find(r => r.cells.A === 'No.');
if (!headRow) throw new Error('見出しの行が見つからない');
const colOf = {};
for (const [col, label] of Object.entries(headRow.cells)) {
  const key = MAP[String(label).trim()];
  if (key) colOf[key] = col;
}
const missing = Object.values(MAP).filter(k => !colOf[k]);
if (missing.length) throw new Error('表に無い項目: ' + missing.join(','));

const cols = Object.values(MAP);
const rows = sh.rows.filter(r => /^P\d+$/.test(String(r.cells.A || '').trim()))
  .map(r => cols.map(k => String(r.cells[colOf[k]] || '').trim()));
if (rows.length < 100) throw new Error('行が少なすぎる: ' + rows.length);

/* 重視ポイントは「、」区切りの複数値。アプリ側で毎回割るのは無駄なので配列にしておく */
const iPts = cols.indexOf('pts');
rows.forEach(r => { r[iPts] = r[iPts] ? r[iPts].split('、').map(x => x.trim()).filter(Boolean) : []; });

/* 絞り込みに使う値の一覧。表に出てくる順ではなく、多い順に並べる */
const tally = key => {
  const i = cols.indexOf(key), c = {};
  rows.forEach(r => { const v = r[i]; (Array.isArray(v) ? v : [v]).forEach(x => { if (x) c[x] = (c[x] || 0) + 1; }); });
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k]) => k);
};
const out = {
  作り方: 'ペルソナ一覧表（xlsx）から gen.js で作ったもの。手で編集しないこと',
  cols,
  opts: { type: tally('type'), gen: tally('gen'), fam: tally('fam'), work: tally('work'), pts: tally('pts') },
  rows,
};
const json = JSON.stringify(out);
fs.writeFileSync(path.join(process.argv[3], 'personas.json'), json);
console.log('件数', rows.length, '／', (json.length / 1024).toFixed(0), 'KB（gzipで', (zlib.gzipSync(json).length / 1024).toFixed(0), 'KB）');
console.log('絞り込みの選択肢', Object.entries(out.opts).map(([k, v]) => `${k}:${v.length}`).join(' '));
