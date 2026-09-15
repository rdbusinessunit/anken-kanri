'use strict';
/* ===== 求人広告データの取込
   Indeed：広告配信実績CSV（求人メモ先頭の案件番号・名称で案件を特定）
   求人ボックス：採用ボードの求人一覧CSV（求人ラベル＝案件名、なければ勤務地×時給でまとめる）
                ＋求人別の実績CSV（同じ求人IDで表示・クリック・応募を結合） ===== */
const AD_MEDIA = ['Indeed', '求人BOX'];
const mediaCols = () => [...new Set([...AD_MEDIA, ...cfg().media])];
const toNum = s => { const v = String(s ?? '').replace(/[￥¥,円\s]/g, ''); return v === '' || isNaN(+v) ? 0 : +v; };
const codeNorm = s => s == null || String(s).trim() === '' || isNaN(parseInt(s, 10)) ? '' : String(parseInt(s, 10));
const ymd = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const METRICS = ['n', 'hold', 'active', 'imp', 'click', 'apply', 'cost'];
const zeroM = () => ({ n: 0, hold: 0, stop: 0, active: 0, imp: 0, click: 0, apply: 0, cost: 0 });
const addM = (a, b) => { for (const k of ['imp', 'click', 'apply', 'cost']) a[k] = (a[k] || 0) + (b[k] || 0); };
const idNum = s => +String(s || '').trim().split('-').pop() || 0;
const UNK = '（未区分）';
const isUnk = k => !k || k === UNK || k === '（不明）';

function decodeCsv(buf) {
  let t; try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { t = new TextDecoder('shift_jis').decode(buf); }
  return t.replace(/^﻿/, '');
}
function csvObjects(text) {
  const rows = parseCSV(text).filter(r => r.some(x => String(x).trim() !== ''));
  const head = (rows[0] || []).map(h => String(h).trim());
  return { head, rows: rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) };
}
function detectAd(head) {
  if (head.includes('求人メモ') && head.includes('利用済予算')) return 'Indeed';
  if (head.includes('求人ID') && head.includes('勤務地_詳細_1')) return 'KBLIST';
  if (head.includes('勤務先名') && (head.includes('キャンペーン名') || head.includes('アクション数'))) return 'KBREPORT';
  return null;
}
const TYPE_LABEL = { Indeed: 'Indeed 広告配信実績', KBLIST: '求人ボックス 求人一覧（採用ボード）', KBREPORT: '求人ボックス 求人別実績' };
function periodFrom(name) {
  let m = name.match(/_(\d{8})_(\d{8})\.csv$/i); if (m) return `${fmtD(ymd(m[1]))}〜${fmtMD(ymd(m[2]))}`;
  m = name.match(/_(\d{8})_\d{6}\.csv$/i); if (m) return `${fmtD(ymd(m[1]))}取得`;
  m = name.match(/_(\d{8})\d{4}\.csv$/i); if (m) return `${fmtD(ymd(m[1]))}時点`;
  return '';
}
const titleHead = t => String(t || '').replace(/^【[^】]*】/, '').split(/[／/｜|]/)[0].trim().slice(0, 30);
// Indeedの求人メモ「274　日立建機龍ヶ崎　40代独身男性 9/10内藤編集」→ 番号274・案件名「日立建機龍ヶ崎」
function memoParse(memo, title) {
  const s = String(memo || '').replace(/⭐[^⭐\n]*⭐/g, ' ').replace(/\s+/g, ' ').trim();
  const m = s.match(/^[⭐★✅\s　]*(\d{1,4})[\s　]*(.*)$/);
  let code = m ? codeNorm(m[1]) : '';
  const tc = String(title || '').match(/plus-?[IC]-(\d{1,4})/i); if (!code && tc) code = codeNorm(tc[1]);
  let name = ((m ? m[2] : s).split(/[\s　]+/)[0] || '').replace(/[（(][^）)]*[）)]?/g, '').replace(/[✅⭐★]/g, '').trim();
  if (/^\d+(代|歳)/.test(name)) name = '';
  return { code, name };
}
function kbKyoten(w) {
  w = String(w || '');
  if (/plus-?I(?![a-z])/i.test(w)) return 'plus-i';
  if (/plus-?C(?![a-z])/i.test(w)) return 'plus-c';
  if (/next/i.test(w)) return 'next';
  if (/bring\s*up/i.test(w)) return 'up';
  return UNK;
}
const kbCode = (...s) => { for (const x of s) { const m = String(x || '').match(/plus-?[IC]-(\d{1,4})/i); if (m) return codeNorm(m[1]); } return ''; };
const kbAddr = (pref, detail) => (String(pref || '') + String(detail || '')).normalize('NFKC').replace(/〒?\d{3}-?\d{4}|[\s　]/g, '');
const addrShort = a => String(a || '').replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}?県)/, '');
const kbStatus = s => /^公開/.test(s) ? 'live' : s === '掲載保留' ? 'hold' : s === '下書き' ? 'draft' : 'stop';

/* ---- Indeed ---- */
function parseIndeed(rows, kyoten) {
  const G = {};
  for (const r of rows) {
    const no = String(r['求人番号'] || '').trim(); if (!no || no === '合計') continue;
    const { code, name } = memoParse(r['求人メモ'], r['求人内容']);
    const nm = name || titleHead(r['求人内容']);
    const key = code ? `${kyoten}#${code}` : `${kyoten}|${norm(nm)}`;
    const g = G[key] || (G[key] = { key, kyoten, code, name: nm, title: String(r['求人内容'] || '').replace(/\s+/g, ' ').slice(0, 60), ...zeroM() });
    const m = { imp: toNum(r['表示数']), click: toNum(r['クリック数']), apply: toNum(r['応募数']), cost: toNum(r['利用済予算']) };
    g.n++; if (m.imp > 0) g.active++; addM(g, m);
  }
  const groups = Object.values(G); const tot = zeroM();
  groups.forEach(g => { tot.n += g.n; tot.active += g.active; addM(tot, g); });
  return { groups, tot };
}

/* ---- 求人ボックス ---- */
function kbListCompact(rows) {
  return rows.filter(r => r['求人ID']).map(r => ({
    id: idNum(r['求人ID']), st: kbStatus(String(r['求人ステータス'] || '').trim()), w: r['勤務先名'], title: String(r['求人タイトル'] || ''),
    addr: kbAddr(r['勤務地_県_1'], r['勤務地_詳細_1']), wage: toNum(r['給与（下限）']), phone: String(r['応募受付の電話番号'] || '').trim(),
    label: cleanLabel(r['求人ラベル']),
  }));
}
// 求人ラベル「内外テック仙台 9:00 P20」「N12P3」「ユニテック群馬 40代既婚男性P2」→ 案件名だけにする
function cleanLabel(s) {
  const raw = String(s || '').normalize('NFKC').trim(); if (/^P\d+$/.test(raw)) return '';
  const c = raw.replace(/★.*$/, '').replace(/P\d+$/, '').replace(/\d{1,2}:\d{2}(\(\d+\))?/g, '').replace(/\(\d+\)/g, '').replace(/\d+代(既婚|独身)?(男性|女性|男女)?/g, '').replace(/\s+/g, ' ').trim();
  return c || raw;
}
function kbReportCompact(rows) {
  const m = {};
  rows.forEach(r => { const id = idNum(r['求人番号']); if (!id) return; m[id] = { st: kbStatus(String(r['ステータス'] || '').trim()), w: r['勤務先名'], imp: toNum(r['表示回数']), click: toNum(r['クリック数']), apply: toNum(r['応募数']), cost: toNum(r['費用']) }; });
  return m;
}
// 電話番号→拠点：勤務先名で拠点が分かる行の95%以上が同じ拠点で、分からない行が半分以下の番号だけ採用
function derivePhones(list) {
  const P = {};
  list.forEach(r => { if (!r.phone) return; const p = P[r.phone] || (P[r.phone] = { all: 0, unk: 0, k: {} }); p.all++; const k = kbKyoten(r.w); if (isUnk(k)) p.unk++; else p.k[k] = (p.k[k] || 0) + 1; });
  const out = {};
  Object.entries(P).forEach(([ph, p]) => { const known = p.all - p.unk; const top = Object.entries(p.k).sort((a, b) => b[1] - a[1])[0]; if (top && top[1] / known >= 0.95 && p.unk / p.all <= 0.5) out[ph] = top[0]; });
  return out;
}
function buildKB({ list, report, map, indeedGroups, stored }) {
  const G = {}, ids = {}, unmatched = {}, akLabel = {}, addrLabel = {};
  const phones = list ? derivePhones(list) : (stored && stored.phones) || {};
  const nameKy = {}; indeedGroups.forEach(g => { if (g.name && !isUnk(g.kyoten)) nameKy[norm(g.name)] = g.kyoten; });
  const touch = (key, meta) => G[key] || (G[key] = { key, kyoten: '', code: '', name: '', addr: '', wage: 0, title: '', suggest: '', kys: {}, ...zeroM(), ...meta });
  const apply = (g, st, ky, m) => { if (st === 'live') g.n++; else g[st]++; g.kys[ky] = (g.kys[ky] || 0) + 1; if (m) { if (m.imp > 0) g.active++; addM(g, m); } };
  if (list) {
    for (const r of list) {
      if (r.st === 'draft') continue;
      let ky = kbKyoten(r.w); if (isUnk(ky) && phones[r.phone]) ky = phones[r.phone];
      const code = kbCode(r.w, r.title); const ak = `${r.addr}@${r.wage}`; let key, meta;
      if (r.label) { akLabel[ak] = akLabel[ak] || r.label; addrLabel[r.addr] = addrLabel[r.addr] || r.label; }
      if (code) { key = `C|${code}`; meta = { code, name: r.label }; }
      else if (r.label) { key = `L|${norm(r.label)}`; meta = { name: r.label }; }
      else { const m = map[ak] || {}; key = `A|${ak}`; meta = { name: m.name || '', code: codeNorm(m.code), fixedKy: m.kyoten || '' }; }
      const g = touch(key, { ...meta, addr: r.addr, wage: r.wage, title: r.title.slice(0, 50) });
      const rep = report ? report[r.id] : null;
      const st = rep ? rep.st : r.st; apply(g, st, ky, rep); if (st !== 'stop') ids[r.id] = key;
    }
  } else if (report && stored) {
    // 実績CSVだけの時は、前回の求人一覧で覚えた「求人ID→案件」を使う
    const prev = Object.fromEntries((stored.groups || []).map(g => [g.key, g])); const kb0 = S.ads.kbids || {}; const pid = Object.fromEntries(Object.entries(kb0.ids || {}).map(([i, n]) => [i, (kb0.keys || [])[n]]));
    Object.entries(report).forEach(([id, m]) => {
      const key = pid[id]; const ky = kbKyoten(m.w);
      if (key && prev[key]) { const p = prev[key]; const g = touch(key, { code: p.code, name: p.name, addr: p.addr, wage: p.wage, title: p.title, fixedKy: p.fixedKy }); apply(g, m.st, isUnk(ky) ? p.kyoten : ky, m); ids[id] = key; }
      else { const u = unmatched[ky] || (unmatched[ky] = zeroM()); u[m.st === 'live' ? 'n' : m.st]++; addM(u, m); }
    });
  }
  const all = Object.values(G);
  // 同じ住所×時給にラベル付きの求人があれば、その案件名を自動で使う
  all.forEach(g => { if (g.key.startsWith('A|') && !g.name) { const ak = g.key.slice(2); if (akLabel[ak]) { g.name = akLabel[ak]; g.auto = true; } else if (addrLabel[g.addr]) g.suggest = addrLabel[g.addr]; } });
  // 拠点の決定：割り当て済み → 勤務先名・電話番号の多数派 → Indeedの同名案件
  all.forEach(g => {
    const top = Object.entries(g.kys).filter(([k]) => !isUnk(k)).sort((a, b) => b[1] - a[1])[0];
    g.kyoten = g.fixedKy || (top ? top[0] : '') || Object.entries(nameKy).find(([n]) => g.name && (n.startsWith(norm(g.name)) || norm(g.name).startsWith(n)))?.[1] || UNK;
    delete g.kys;
  });
  const groups = all.filter(g => g.n || g.hold);
  const byKyoten = {};
  all.forEach(g => { const k = byKyoten[g.kyoten] || (byKyoten[g.kyoten] = zeroM()); k.n += g.n; k.hold += g.hold; k.stop += g.stop; addM(k, g); });
  Object.entries(unmatched).forEach(([ky, u]) => { const k = byKyoten[ky] || (byKyoten[ky] = zeroM()); k.n += u.n; k.hold += u.hold; addM(k, u); });
  return { groups, byKyoten, unmatched, ids, phones, hasMetrics: !!report };
}
const kbName = g => g.name || `（未命名）${addrShort(g.addr)}・${g.wage ? g.wage.toLocaleString() + '円' : ''}`;

/* ---- 取り込み済みデータの集計 ---- */
const adDocs = () => Object.entries(S.ads || {}).filter(([id]) => !['kbmap', 'kbids'].includes(id)).map(([, d]) => d);
const adLoaded = m => adDocs().some(d => d.media === m);
function adIndex() {
  const out = [];
  for (const d of adDocs()) for (const g of d.groups || []) {
    const x = { key: d.media + ':' + g.key, kyoten: g.kyoten, code: g.code, name: d.media === '求人BOX' ? kbName(g) : g.name, named: !!g.name, addr: g.addr || '', title: g.title || '', media: {} };
    x.media[d.media] = { n: g.n || 0, hold: g.hold || 0, active: g.active || 0, imp: g.imp || 0, click: g.click || 0, apply: g.apply || 0, cost: g.cost || 0 };
    out.push(x);
  }
  return out;
}
function matchCaseAd(c, g) {
  if (g.code && (c.adCodes || []).map(codeNorm).includes(g.code) && (!c.kyoten || c.kyoten === g.kyoten || isUnk(g.kyoten))) return true;
  if (g.named !== false && aliasesOf(c).some(a => norm(g.name).includes(a))) return true;
  const detail = addrShort(g.addr);
  return detail.length >= 6 && !/[市町村区郡]$/.test(detail) && norm(c.company.address).includes(norm(detail));
}
const adGroupsFor = (c, idx = adIndex()) => idx.filter(g => matchCaseAd(c, g));
function adSum(groups, m) { const o = zeroM(); groups.forEach(g => { const x = g.media[m]; if (x) for (const k of METRICS) o[k] += x[k] || 0; }); return o; }
// 同じ現場の求人を1行にまとめる（「日立建機龍ヶ崎フォークリフト」→ 求人ボックスの求人ラベル「日立建機龍ヶ崎」）
function adSites(idx = adIndex()) {
  const bases = [...new Set(idx.filter(g => g.media['求人BOX'] && g.named).map(g => g.name))].sort((a, b) => b.length - a.length);
  const out = {};
  for (const g of idx) {
    const base = g.named ? (bases.find(b => norm(g.name).startsWith(norm(b))) || g.name) : g.name;
    const s = out[norm(base)] || (out[norm(base)] = { key: norm(base), name: base, named: g.named, kyoten: '', codes: [], groups: [], media: {} });
    if (isUnk(s.kyoten) && !isUnk(g.kyoten)) s.kyoten = g.kyoten; else if (!s.kyoten) s.kyoten = g.kyoten;
    if (g.code && !s.codes.includes(g.code)) s.codes.push(g.code);
    s.groups.push(g);
    for (const [m, x] of Object.entries(g.media)) { const t = s.media[m] || (s.media[m] = zeroM()); for (const k of METRICS) t[k] += x[k] || 0; }
  }
  return Object.values(out);
}
// 拠点×媒体：求人数と案件数。取込のない媒体は手入力の掲載から
function mediaByKyoten(sites = adSites()) {
  const out = {}; const cell = (k, m) => ((out[k] = out[k] || {})[m] = out[k][m] || { n: 0, sites: 0, hold: 0, manual: false });
  sites.forEach(s => Object.entries(s.media).forEach(([m, x]) => { const c = cell(s.kyoten || UNK, m); c.n += x.n; c.hold += x.hold || 0; if (x.n) c.sites++; }));
  adDocs().filter(d => d.media === '求人BOX').forEach(d => Object.entries(d.unmatched || {}).forEach(([k, u]) => { cell(k, '求人BOX').n += u.n; }));
  for (const m of mediaCols()) {
    if (adLoaded(m)) continue;
    const seen = {};
    Object.values(S.postings).filter(p => p.media === m && p.status !== '停止' && S.cases[p.caseId]).forEach(p => { const k = S.cases[p.caseId].kyoten || '拠点未設定'; const c = cell(k, m); c.n += +p.count || 0; c.manual = true; if (!seen[k + p.caseId]) { seen[k + p.caseId] = 1; c.sites++; } });
  }
  return out;
}

/* ===== 取込画面 ===== */
function impState() {
  if (!S.imp) S.imp = { files: [], v: 0, cache: null, ai: null, suggest: {}, busy: '' };
  return S.imp;
}
async function loadAdFiles(fileList) {
  const I = impState(); const bad = [];
  for (const f of fileList) {
    I.busy = `${f.name} を読み込んでいます…`; rerender(); await new Promise(r => setTimeout(r, 30));
    const { head, rows } = csvObjects(decodeCsv(await f.arrayBuffer()));
    const type = detectAd(head);
    if (!type) { bad.push(f.name); continue; }
    const account = (f.name.match(/_求人_(\d+)_/) || [])[1] || '';
    const entry = { name: f.name, type, period: periodFrom(f.name), account, count: rows.length };
    if (type === 'Indeed') { entry.rows = rows; entry.kyoten = (cfg().adAccounts || {})[account] || 'plus-i'; }
    if (type === 'KBLIST') entry.list = kbListCompact(rows);
    if (type === 'KBREPORT') entry.report = kbReportCompact(rows);
    const same = I.files.findIndex(x => x.type === type && (type !== 'Indeed' || x.account === account));
    if (same >= 0) I.files[same] = entry; else I.files.push(entry);
  }
  I.busy = ''; I.v++;
  if (bad.length) toast('種類を判定できないファイルがあります：' + bad.join('、'), 'warn');
  rerender();
}
function impParse() {
  const I = impState();
  if (I.cache && I.cache.v === I.v) return I.cache;
  const indeed = I.files.filter(f => f.type === 'Indeed').map(f => ({ file: f, ...parseIndeed(f.rows, f.kyoten) }));
  const indeedGroups = [...indeed.flatMap(x => x.groups), ...adDocs().filter(d => d.media === 'Indeed' && !indeed.some(x => x.file.kyoten === d.kyoten)).flatMap(d => d.groups || [])];
  const lf = I.files.find(f => f.type === 'KBLIST'), rf = I.files.find(f => f.type === 'KBREPORT');
  const stored = (S.ads || {}).kyujinbox || null;
  let kb = null;
  if (lf || (rf && stored)) kb = { listFile: lf, reportFile: rf, ...buildKB({ list: lf ? lf.list : null, report: rf ? rf.report : null, map: ((S.ads || {}).kbmap || {}).groups || {}, indeedGroups, stored }) };
  I.cache = { v: I.v, indeed, kb, indeedGroups, reportOnlyNoBase: rf && !lf && !stored };
  return I.cache;
}
function viewAds() {
  const I = impState(); const P = I.files.length ? impParse() : null;
  const docs = adDocs();
  const current = docs.length ? `<table class="list" style="margin-top:10px"><thead><tr><th>媒体</th><th>拠点</th><th>元ファイル</th><th>期間</th><th style="text-align:right">公開中の求人</th><th>取込</th></tr></thead><tbody>${docs.map(d => `<tr><td>${chip(d.media, 'info')}</td><td>${esc(d.kyoten || '全拠点')}</td><td class="small">${esc((d.sources || [d.source]).filter(Boolean).join(' ＋ '))}</td><td class="small">${esc(d.period || '')}</td><td class="n" style="text-align:right">${d.media === 'Indeed' ? d.tot.n : sum(Object.values(d.byKyoten || {}).map(v => v.n))}</td><td class="small muted">${fmtDT(d.importedAt)} ${esc(d.importedBy || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted" style="margin:8px 0 0">まだ取り込まれていません。</p>';
  return `<div class="pagehead"><div><div class="eyebrow">AD DATA</div><h1>求人広告の取込</h1></div><span class="sub">Indeed・求人ボックスの求人数と実績を案件別にまとめます</span><span class="spacer"></span><a class="btn ghost" href="#/postings">← 求人管理</a></div>
  <div class="panel" style="padding:16px 18px;margin-bottom:18px">
    <div class="row"><label class="btn primary" for="adsin" tabindex="0">CSVファイルを選ぶ</label><input type="file" id="adsin" accept=".csv,text/csv" multiple hidden><span class="small muted">${I.busy ? esc(I.busy) : '複数まとめて選べます。種類と文字コードは中身から自動で判定します。'}</span></div>
    <ul class="small muted" style="margin:10px 0 0;padding-left:18px;line-height:1.8">
      <li><b>Indeed</b>：広告配信実績（求人ごと）のCSV。求人メモ先頭の番号と名称で案件を分けます。</li>
      <li><b>求人ボックス</b>：採用ボードの<b>求人一覧CSV</b>（saiyoboard_kyujin_…）と、管理画面の<b>求人別CSV</b>（…_求人別_開始日_終了日）を一緒に選んでください。求人一覧で案件を分け、求人別で表示・クリック・応募を付けます。</li>
    </ul>
    <h3 style="font-size:12px;letter-spacing:.08em;color:var(--ink-2);margin-top:16px">取り込み済み</h3>${current}
  </div>
  ${P ? impPreview(P) : ''}`;
}
function impPreview(P) {
  const I = impState(); const C = cfg();
  const files = I.files.map((f, i) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line-2)">${chip(TYPE_LABEL[f.type], 'info')}<span class="small">${esc(f.name)}</span><span class="small muted">${esc(f.period)}${f.period ? '・' : ''}${f.count.toLocaleString()}行</span><span class="spacer"></span>${f.type === 'Indeed' ? `<label class="small">このアカウントの拠点 <select class="inp" style="width:auto;min-height:0;padding:4px 8px" data-impk="${i}">${C.kyotens.map(k => `<option${k.id === f.kyoten ? ' selected' : ''}>${esc(k.id)}</option>`).join('')}</select></label>` : ''}<button class="btn sm ghost" data-act="impdrop" data-i="${i}" aria-label="外す">×</button></div>`).join('');
  const warn = [];
  if (P.reportOnlyNoBase) warn.push('求人ボックスの求人別CSVだけでは案件が分かりません。採用ボードの求人一覧CSVも一緒に選んでください（1回取り込めば、次回から求人別CSVだけでも更新できます）。');
  if (P.kb && !P.kb.hasMetrics) warn.push('求人ボックスの求人別CSVがないため、表示・クリック・応募は0になります。');
  const idx = [...P.indeed.flatMap(x => x.groups.map(g => ({ key: 'Indeed:' + g.key, kyoten: g.kyoten, code: g.code, name: g.name, named: true, addr: '', media: { Indeed: g } }))),
    ...(P.kb ? P.kb.groups.map(g => ({ key: '求人BOX:' + g.key, kyoten: g.kyoten, code: g.code, name: kbName(g), named: !!g.name, addr: g.addr, media: { '求人BOX': g } })) : [])];
  const sites = adSites(idx).sort((a, b) => sum(Object.values(b.media).map(x => x.n)) - sum(Object.values(a.media).map(x => x.n)));
  const mat = {}; sites.forEach(s => Object.entries(s.media).forEach(([m, x]) => { const c = ((mat[s.kyoten] = mat[s.kyoten] || {})[m] = (mat[s.kyoten] || {})[m] || { n: 0, s: 0 }); c.n += x.n; if (x.n) c.s++; }));
  const ks = Object.keys(mat).sort((a, b) => isUnk(a) - isUnk(b) || a.localeCompare(b));
  const matHTML = `<table class="list"><thead><tr><th>拠点</th>${AD_MEDIA.map(m => `<th style="text-align:right">${m}</th>`).join('')}</tr></thead><tbody>${ks.map(k => `<tr><td>${esc(k)}</td>${AD_MEDIA.map(m => { const c = (mat[k] || {})[m]; return `<td class="n" style="text-align:right">${c ? `<b>${c.n.toLocaleString()}</b>件<span class="small muted"> ／${c.s}案件</span>` : '<span class="muted">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
  const kbTot = P.kb ? sum(Object.values(P.kb.byKyoten).map(v => v.n)) : 0, kbHold = P.kb ? sum(Object.values(P.kb.byKyoten).map(v => v.hold)) : 0;
  const phones = P.kb ? Object.entries(P.kb.phones) : [];
  return `<section class="panel" style="padding:16px 18px;margin-bottom:18px">
    <div class="row"><h2 style="font-size:15px">取り込む内容の確認</h2><span class="spacer"></span><button class="btn primary" data-act="impsave"${P.reportOnlyNoBase && !P.indeed.length ? ' disabled' : ''}>この内容で取り込む</button></div>
    <div style="margin:8px 0 12px">${files}</div>
    ${warn.map(w => `<div class="banner warn">${esc(w)}</div>`).join('')}
    ${P.kb ? `<p class="small muted" style="margin:0 0 10px">求人ボックス：公開中 ${kbTot.toLocaleString()}件・掲載保留 ${kbHold.toLocaleString()}件（募集停止・下書きは数えません）。拠点は「勤務先名のplus-I等」→「応募受付の電話番号」${phones.length ? `（${phones.map(([p, k]) => `${p}＝${k}`).join('、')}）` : ''}→「Indeedの同名案件」の順で判定しています。</p>` : ''}
    <div class="pgrid"><div><h4>拠点×媒体の求人数</h4><div class="scroll-x">${matHTML}</div><p class="small muted">「／○案件」は同じ現場をまとめた案件の数です。</p></div>
    <div><h4>案件別（上位15）</h4><div class="scroll-x"><table class="ptab"><thead><tr><th>拠点</th><th>案件</th><th style="text-align:right">Indeed</th><th style="text-align:right">求人BOX</th></tr></thead><tbody>${sites.slice(0, 15).map(s => `<tr><td class="small">${esc(s.kyoten)}</td><td>${esc(s.name)}</td><td class="n" style="text-align:right">${(s.media.Indeed || {}).n || ''}</td><td class="n" style="text-align:right">${(s.media['求人BOX'] || {}).n || ''}</td></tr>`).join('')}</tbody></table></div></div></div>
  </section>
  ${P.kb && P.kb.groups.some(g => g.key.startsWith('A|')) ? kbNameTool(P) : ''}`;
}
function kbNameTool(P) {
  const I = impState(); const C = cfg();
  const list = P.kb.groups.filter(g => g.key.startsWith('A|') && (g.n || g.hold)).sort((a, b) => (!!a.name - !!b.name) || (b.n + b.hold) - (a.n + a.hold));
  const unnamed = list.filter(g => !g.name);
  const names = [...new Set([...P.indeedGroups.map(g => g.name), ...P.kb.groups.filter(g => g.name).map(g => g.name), ...Object.values(S.cases).map(c => c.company.name)].filter(Boolean))];
  const ai = I.ai;
  return `<section class="panel" style="padding:16px 18px">
    <div class="row"><h2 style="font-size:15px">求人ラベルのない求人ボックス求人に案件名を付ける</h2><span class="spacer"></span><button class="btn sm primary" data-act="kbnamesave">名前を保存</button></div>
    <p class="small muted" style="margin:6px 0 12px;max-width:85ch">採用ボードで求人ラベルが空の求人は、勤務地×時給でまとめています（未命名 ${unnamed.length}件）。一度名前を付ければ次回の取込でも自動で使います。採用ボードで求人ラベルを付けて入稿すれば、この作業は不要になります。</p>
    <div id="kbaimsg">${ai ? (ai.busy ? '<p class="small muted">AIが候補を考えています…（1分ほど）</p>' : ai.err ? `<p class="small" style="color:var(--crit)">${esc(ai.err)}</p>` : `<p class="small muted">AIの候補を入れました（${ai.n}件）。確認してから「名前を保存」を押してください。</p>`) : ''}</div>
    <datalist id="dl-adnames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="scroll-x"><table class="ptab kbn"><thead><tr><th>勤務地</th><th style="text-align:right">時給</th><th style="text-align:right">公開</th><th style="text-align:right">保留</th><th>求人タイトルの例</th><th style="min-width:180px">案件名</th><th style="width:70px">番号</th><th style="width:110px">拠点</th></tr></thead><tbody>
    ${list.map(g => { const ak = g.key.slice(2); const sg = I.suggest[ak] || {}; const v = g.name || sg.name || g.suggest || ''; return `<tr data-gk="${esc(ak)}"><td class="small">${esc(addrShort(g.addr))}</td><td class="n" style="text-align:right">${g.wage ? g.wage.toLocaleString() : ''}</td><td class="n" style="text-align:right">${g.n}</td><td class="n" style="text-align:right">${g.hold || ''}</td><td class="small muted">${esc(g.title)}</td>
      <td><input data-k="name" list="dl-adnames" value="${esc(v)}" placeholder="例：トーダン"${!g.name && v ? ' class="sug"' : ''} title="${esc(sg.reason || (g.suggest && !g.name ? '同じ住所に求人ラベル「' + g.suggest + '」の求人があります' : ''))}"></td>
      <td><input data-k="code" value="${esc(g.code || sg.code || '')}"></td>
      <td><select data-k="kyoten"><option value="">${UNK}</option>${C.kyotens.map(k => `<option${k.id === (isUnk(g.kyoten) ? sg.kyoten : g.kyoten) ? ' selected' : ''}>${esc(k.id)}</option>`).join('')}</select></td></tr>`; }).join('')}
    </tbody></table></div>
  </section>`;
}
async function kbNameSave() {
  const I = impState(); const map = { ...(((S.ads || {}).kbmap || {}).groups || {}) };
  $$('tr[data-gk]').forEach(tr => {
    const ak = tr.dataset.gk; const name = tr.querySelector('[data-k="name"]').value.trim(); const code = tr.querySelector('[data-k="code"]').value.trim(); const kyoten = tr.querySelector('[data-k="kyoten"]').value;
    if (name) map[ak] = { name, code: codeNorm(code), kyoten }; else delete map[ak];
  });
  await Store.put('ads', 'kbmap', { groups: map, updatedAt: nowISO(), updatedBy: S.me });
  I.suggest = {}; I.v++; toast('案件名を保存しました'); rerender();
}
async function kbAI() {
  const I = impState(); const P = impParse(); if (!P.kb) return;
  const targets = P.kb.groups.filter(g => g.key.startsWith('A|') && !g.name && (g.n || g.hold)).slice(0, 80);
  const sample = window.claude && window.claude.use ? await window.claude.use('sample') : null;
  if (!sample) { toast('この表示ではAIを利用できません', 'warn'); return; }
  I.ai = { busy: true }; $('#kbaimsg').innerHTML = '<p class="small muted">AIが候補を考えています…（1分ほど）</p>';
  const cands = [
    ...P.indeedGroups.filter((g, i, a) => a.findIndex(y => y.name === g.name) === i).slice(0, 150).map(g => `Indeed｜${g.kyoten}｜${g.code || '-'}｜${g.name}｜${g.title || ''}`),
    ...P.kb.groups.filter(g => g.name).map(g => `求人BOXラベル｜${g.kyoten}｜${g.code || '-'}｜${g.name}｜${addrShort(g.addr)} 時給${g.wage}`),
    ...Object.values(S.cases).map(c => `台帳｜${c.kyoten || '-'}｜-｜${c.company.name} ${c.company.plant || ''}｜${c.company.address || ''}`),
  ].join('\n');
  const prompt = `人材派遣会社の求人ボックス掲載データの整理です。「対象」は、案件名（派遣先の名前）が付いていない求人のまとまり（勤務地×時給）です。「候補」から同じ派遣先・同じ仕事のものを選び、案件名を付けてください。
- 候補の案件名はそのまま使う（例：「トーダン」「LIXIL岩井」）。地名・時給・仕事内容（タイトル）が一致するものを選ぶ
- 一致する候補がなければ、勤務地と仕事内容から短い案件名をつけ、codeは空、confidenceは「低」
- kyotenは候補の拠点（plus-i など）。分からなければ空
出力はJSON配列のみ：[{"key":"対象のkey","name":"案件名","code":"番号または空","kyoten":"plus-i","confidence":"高|中|低","reason":"一致した根拠（短く）"}]

候補（出所｜拠点｜番号｜案件名｜Indeedタイトル・住所など）：
${cands}

対象（key｜勤務地｜時給｜件数｜タイトル例）：
${targets.map(g => `${g.key.slice(2)}｜${addrShort(g.addr)}｜${g.wage}｜${g.n + g.hold}｜${g.title}`).join('\n')}`;
  try {
    const res = await sample.json(prompt, { cache: false });
    let n = 0; (Array.isArray(res) ? res : []).forEach(x => { if (x && x.key && x.name) { I.suggest[x.key] = { name: String(x.name), code: codeNorm(x.code), kyoten: cfg().kyotens.some(k => k.id === x.kyoten) ? x.kyoten : '', reason: `AI（${x.confidence || '—'}）：${x.reason || ''}` }; n++; } });
    I.ai = { n };
  } catch (e) { I.ai = { err: AI_ERR(e) }; }
  rerender();
}
async function impSave() {
  if (needMe()) return;
  const I = impState(); const P = impParse(); const t = nowISO();
  for (const x of P.indeed) {
    await Store.put('ads', `indeed-${x.file.kyoten}`, { media: 'Indeed', kyoten: x.file.kyoten, account: x.file.account, source: x.file.name, period: x.file.period, importedAt: t, importedBy: S.me, tot: x.tot, groups: x.groups });
  }
  if (P.kb) {
    const lf = P.kb.listFile, rf = P.kb.reportFile;
    await Store.put('ads', 'kyujinbox', { media: '求人BOX', kyoten: '', sources: [lf && lf.name, rf && rf.name].filter(Boolean), period: rf ? rf.period : (lf ? lf.period : ''), importedAt: t, importedBy: S.me, hasMetrics: P.kb.hasMetrics, phones: P.kb.phones, groups: P.kb.groups, byKyoten: P.kb.byKyoten, unmatched: P.kb.unmatched });
    if (lf) { const keys = [...new Set(Object.values(P.kb.ids))]; const pos = Object.fromEntries(keys.map((k, i) => [k, i])); await Store.put('ads', 'kbids', { keys, ids: Object.fromEntries(Object.entries(P.kb.ids).map(([i, k]) => [i, pos[k]])), at: t }); }
  }
  const acc = { ...(cfg().adAccounts || {}) }; let changed = false;
  P.indeed.forEach(x => { if (x.file.account && acc[x.file.account] !== x.file.kyoten) { acc[x.file.account] = x.file.kyoten; changed = true; } });
  if (changed) await Store.put('config', 'main', { ...cfg(), adAccounts: acc });
  toast(`取り込みました：${[P.indeed.length ? 'Indeed' : '', P.kb ? '求人ボックス' : ''].filter(Boolean).join('・')}`);
  S.imp = null; location.hash = '#/postings';
}

/* ---- 案件の詳細パネルに出す広告実績 ---- */
function adDetailHTML(c, groups) {
  if (!adDocs().length) return '';
  const rows = groups.map(g => { const m = Object.keys(g.media)[0]; return { m, g, x: g.media[m] }; }).sort((a, b) => b.x.n - a.x.n);
  const body = rows.map(({ m, g, x }) => `<tr><td class="small">${m}</td><td class="small n">${esc(g.code || '')}</td><td>${esc(g.name)}</td><td class="n" style="text-align:right">${x.n}${x.hold ? `<span class="small muted">＋保留${x.hold}</span>` : ''}</td><td class="n" style="text-align:right">${x.imp.toLocaleString()}</td><td class="n" style="text-align:right">${x.click}</td><td class="n small" style="text-align:right">${x.imp ? pct(x.click / x.imp) : ''}</td><td class="n" style="text-align:right">${x.apply || ''}</td><td class="n" style="text-align:right">${x.cost ? yen(x.cost) : ''}</td></tr>`).join('');
  return `<h4>求人広告（取込データ）</h4>${rows.length ? `<div class="scroll-x"><table class="ptab"><thead><tr><th>媒体</th><th>番号</th><th>広告側の案件名</th><th style="text-align:right">件数</th><th style="text-align:right">表示</th><th style="text-align:right">クリック</th><th style="text-align:right">CTR</th><th style="text-align:right">応募</th><th style="text-align:right">費用</th></tr></thead><tbody>${body}</tbody></table></div>` : `<p class="small muted">この案件に紐づく広告がありません。<a href="#/case/${c.id}/log">案件番号・応募シートでの名称</a>を設定すると紐づきます。</p>`}<div style="height:14px"></div>`;
}
