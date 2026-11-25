/* xlsx を読むだけの最小の道具。xlsx は中身が zip なので、自分でほどいて XML を読む。
   使い方: node xlsxread.js <ファイル> [行数] */
const fs = require('fs'), zlib = require('zlib');

function unzip(buf) {
  /* 末尾から中央ディレクトリを探す */
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip ではない');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let k = 0; k < n; k++) {
    const nameLen = buf.readUInt16LE(p + 28), extLen = buf.readUInt16LE(p + 30), cmtLen = buf.readUInt16LE(p + 32);
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lho = buf.readUInt32LE(p + 42);
    const lNameLen = buf.readUInt16LE(lho + 26), lExtLen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lNameLen + lExtLen;
    const raw = buf.slice(start, start + csize);
    out[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
    p += 46 + nameLen + extLen + cmtLen;
  }
  return out;
}

const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');

function sharedStrings(xml) {
  if (!xml) return [];
  return [...xml.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => dec(x[1])).join(''));
}

function sheetRows(xml, ss) {
  const rows = [];
  for (const rm of xml.toString('utf8').matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[2], inner = cm[3];
      const t = (attrs.match(/t="([^"]+)"/) || [])[1];
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (t === 's') val = ss[+v] || '';
      else if (t === 'inlineStr') val = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => dec(x[1])).join('');
      else val = v == null ? '' : dec(v);
      cells[cm[1]] = val;
    }
    rows.push({ r: +rm[1], cells });
  }
  return rows;
}

function load(file) {
  const z = unzip(fs.readFileSync(file));
  const ss = sharedStrings(z['xl/sharedStrings.xml']);
  const wb = (z['xl/workbook.xml'] || Buffer.from('')).toString('utf8');
  const names = [...wb.matchAll(/<sheet[^>]*name="([^"]*)"/g)].map(m => dec(m[1]));
  const files = Object.keys(z).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => (+a.match(/(\d+)/)[1]) - (+b.match(/(\d+)/)[1]));
  return files.map((f, i) => ({ name: names[i] || f, rows: sheetRows(z[f], ss) }));
}

module.exports = { load };

if (require.main === module) {
  const lim = +(process.argv[3] || 8);
  for (const sh of load(process.argv[2])) {
    console.log('=== シート:', sh.name, '／ 行数', sh.rows.length);
    sh.rows.slice(0, lim).forEach(r => console.log(r.r, JSON.stringify(r.cells).slice(0, 400)));
  }
}
