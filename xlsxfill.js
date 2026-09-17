'use strict';
/* ===== 元のExcel様式に値を流し込んで保存する
   templates/ のファイルを読み、指定セルの値だけ書き換えます。
   罫線・結合セル・図・数式はそのまま残ります（数式は開いたときに再計算されます）。 ===== */
const TEMPLATES = {
  hearing: { file: 'templates/ヒアリングシート.xlsx', sheet: 'nx', sheetIndex: 0, label: '新規受注時ヒアリングシート' },
  ringi: { file: 'templates/稟議書.xlsx', sheet: '契約稟議2026', sheetIndex: 0, label: '契約稟議書' },
  setsumei: { file: 'templates/勤務説明書.xlsx', sheet: '富双合成', sheetIndex: 1, label: '勤務説明書' },
};
function loadScriptOnce(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('script')); document.head.appendChild(s); });
}
async function loadJSZip() { if (!window.JSZip) await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'); return window.JSZip; }
const colToNum = s => [...s].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
function setCell(doc, ref, value) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) return;
  const col = colToNum(m[1]), rowNum = +m[2];
  const ns = doc.documentElement.namespaceURI;
  const sheetData = doc.getElementsByTagName('sheetData')[0];
  const rows = sheetData.getElementsByTagName('row');
  let row = null;
  for (let i = 0; i < rows.length; i++) {
    const r = +rows[i].getAttribute('r');
    if (r === rowNum) { row = rows[i]; break; }
    if (r > rowNum) { row = doc.createElementNS(ns, 'row'); row.setAttribute('r', String(rowNum)); sheetData.insertBefore(row, rows[i]); break; }
  }
  if (!row) { row = doc.createElementNS(ns, 'row'); row.setAttribute('r', String(rowNum)); sheetData.appendChild(row); }
  const cs = row.getElementsByTagName('c');
  let cell = null;
  for (let i = 0; i < cs.length; i++) {
    const cr = cs[i].getAttribute('r'); const ci = colToNum(/^([A-Z]+)/.exec(cr)[1]);
    if (ci === col) { cell = cs[i]; break; }
    if (ci > col) { cell = doc.createElementNS(ns, 'c'); cell.setAttribute('r', ref); row.insertBefore(cell, cs[i]); break; }
  }
  if (!cell) { cell = doc.createElementNS(ns, 'c'); cell.setAttribute('r', ref); row.appendChild(cell); }
  while (cell.firstChild) cell.removeChild(cell.firstChild);
  const v = value;
  if (v === '' || v == null) { cell.removeAttribute('t'); return; }
  if (typeof v === 'number' && isFinite(v)) {
    cell.removeAttribute('t');
    const ve = doc.createElementNS(ns, 'v'); ve.textContent = String(v); cell.appendChild(ve);
  } else {
    cell.setAttribute('t', 'inlineStr');
    const is = doc.createElementNS(ns, 'is'), t = doc.createElementNS(ns, 't');
    t.setAttribute('xml:space', 'preserve'); t.textContent = String(v); is.appendChild(t); cell.appendChild(is);
  }
}
async function fillTemplate(kind, cells, filename) {
  const T = TEMPLATES[kind];
  let JSZipLib; try { JSZipLib = await loadJSZip(); } catch { throw new Error('Excel出力の部品を読み込めませんでした。通信状態を確認してください'); }
  const res = await fetch(T.file + '?v=' + Date.now());
  if (!res.ok) throw new Error(`テンプレート（${T.file}）を読み込めませんでした`);
  const zip = await JSZipLib.loadAsync(await res.arrayBuffer());
  const parse = async path => new DOMParser().parseFromString(await zip.file(path).async('string'), 'application/xml');
  // 対象シートのxmlを探す
  const wb = await parse('xl/workbook.xml'), rels = await parse('xl/_rels/workbook.xml.rels');
  const sheets = [...wb.getElementsByTagName('sheet')];
  let sheet = sheets.find(s => s.getAttribute('name') === T.sheet) || sheets[T.sheetIndex] || sheets[0];
  const rid = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rel = [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
  const path = 'xl/' + rel.getAttribute('Target').replace(/^\//, '').replace(/^xl\//, '');
  const doc = await parse(path);
  Object.entries(cells).forEach(([ref, value]) => setCell(doc, ref, value));
  zip.file(path, new XMLSerializer().serializeToString(doc));
  // 開いたときに数式を計算し直す
  const calcPr = wb.getElementsByTagName('calcPr')[0];
  if (calcPr) { calcPr.setAttribute('fullCalcOnLoad', '1'); zip.file('xl/workbook.xml', new XMLSerializer().serializeToString(wb)); }
  // 数式の計算順メモは作り直させる
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    const ct = await parse('[Content_Types].xml');
    [...ct.getElementsByTagName('Override')].forEach(o => { if (o.getAttribute('PartName') === '/xl/calcChain.xml') o.parentNode.removeChild(o); });
    zip.file('[Content_Types].xml', new XMLSerializer().serializeToString(ct));
    [...rels.getElementsByTagName('Relationship')].forEach(r => { if ((r.getAttribute('Target') || '').indexOf('calcChain') >= 0) r.parentNode.removeChild(r); });
    zip.file('xl/_rels/workbook.xml.rels', new XMLSerializer().serializeToString(rels));
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveFile(filename, blob);
}
function dateSerial(v) { const d = dateOf(v); if (!d) return ''; return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000); }
const sanitize = s => String(s).replace(/[\\/:*?"<>|]/g, '_').slice(0, 90);
const dotDate = s => fmtD(s || today()).replace(/\//g, '.');

/* ---- ① 新規受注時ヒアリングシート ---- */
function cellsHearing(c, p) {
  const h = c.hearing, sh = p.shifts || [];
  const time = j => sh[j] && sh[j].start ? `${fmtTime(sh[j].start)}～${fmtTime(sh[j].end)}` : '';
  const brk = j => sh[j] && sh[j].breakFrom ? `${fmtTime(sh[j].breakFrom)}～${fmtTime(sh[j].breakTo)}` : sh[j] && sh[j].breakMin ? `${sh[j].breakMin}分` : '';
  const cells = {
    AF3: dateSerial(c.juchuDate), I4: c.company.name, AB4: c.company.plant,
    I6: c.company.address, AL6: c.tanto,
    K8: `期間：（　${h.contract === '短期' ? h.contractPeriod || '短期' : h.contract || ''}　）`,
    U8: `${p.ageMin ? p.ageMin + '～' : ''}${p.ageMax || ''}`, AF8: p.sex === '不問' ? '　男女' : `　${p.sex}`,
    E10: +p.headcount || '', M10: c.work.holidays, AE10: +h.annualHolidays || '', AL10: filled(p.overtimeH) ? +p.overtimeH : '',
    E12: (c.facilities.checks || []).join('　'), E14: c.facilities.shokudoNote || '', K14: c.facilities.otherNote || '',
    E16: +p.pay || '', U16: [p.kotsuRule && '交通費 ' + p.kotsuRule, p.kotsuCap && '上限' + yen(p.kotsuCap)].filter(Boolean).join('　'),
    A36: detailText(p), A54: h.environment, A63: [h.appeal, ...meritLines(c)].filter(Boolean).join('\n'),
  };
  [0, 1, 2, 3].forEach(j => {
    cells['G' + (18 + j * 2)] = time(j);
    cells['AB' + (18 + j * 2)] = sh[j] ? sh[j].label || '' : '';
    cells['G' + (26 + j * 2)] = brk(j);
    cells['AB' + (26 + j * 2)] = j === 0 ? p.shiftNote || '' : '';
  });
  return cells;
}

/* ---- ② 契約稟議書 ---- */
function cellsRingi(c) {
  const r = c.ringi, co = c.company, k = kyotenOf(c.kyoten), f = c.flow, ap = f.ringi.approvals || {};
  const sub = dateOf(f.ringi.submittedAt) || dateOf(today());
  const heads = c.positions.map(p => ({ n: +p.headcount || 0, sex: p.sex }));
  const men = sum(heads.filter(x => x.sex === '男性').map(x => x.n)), women = sum(heads.filter(x => x.sex === '女性').map(x => x.n));
  const any = sum(heads.filter(x => x.sex !== '男性' && x.sex !== '女性').map(x => x.n));
  const allShifts = c.positions.flatMap(p => (p.shifts || []).filter(s => s.start).map(s => ({ s, p })));
  const w = r.warimashi, appr = cfg().approvers;
  const cells = {
    D3: r.torihiki, T3: r.no, D4: r.shubetsu, Q4: dateSerial(f.ringi.decidedAt),
    D5: r.speed, Q5: sub.getFullYear(), T5: sub.getMonth() + 1, V5: sub.getDate(),
    D6: r.keiyakuShubetsu, Q6: k.corp, V6: k.office, D7: r.henkei, Q7: r.applicant || c.tanto,
    D9: co.name, P9: co.plant, E10: co.zip, H10: co.address, D11: co.tel, O11: co.fax,
    D12: co.rep, L12: co.contactDept, P12: co.contactTitle, T12: co.contactName,
    F13: co.capital, L13: co.listed, G14: co.founded, N14: co.industry, U14: co.products,
    D16: r.busho, J16: c.positions.map(p => p.name).filter(Boolean).join('／'),
    T16: [...new Set(c.positions.map(p => p.qualification).filter(Boolean))].join('／'),
    D17: dateSerial(r.keiyakuDate), J17: dateSerial(r.kikanFrom), P17: dateSerial(r.kikanTo), U17: r.koshin,
    E18: men || '', H18: women || '', K18: men + women + any,
    O18: r.billShime, R18: r.billNyukin, V18: r.billHitchaku,
    D24: c.work.holidays, N24: c.work.payShime, T24: c.work.payDay,
    F31: +w.jikangai || '', J31: +w.shinya || '', N31: +w.hoteigai || '', R31: +w.hotei || '', V31: +w.over60 || '',
    A39: r.shoken, A41: r.biko,
    A44: (ap[(appr[0] || {}).role] || {}).comment || '', A46: (ap[(appr[1] || {}).role] || {}).comment || '', A48: (ap[(appr[2] || {}).role] || {}).comment || '',
  };
  [0, 1, 2, 3].forEach(i => {
    const row = 20 + i, x = allShifts[i];
    cells['E' + row] = x ? fmtTime(x.s.start) : ''; cells['H' + row] = x ? fmtTime(x.s.end) : '';
    cells['J' + row] = x ? +x.s.breakMin || 0 : ''; cells['M' + row] = x ? fmtH(shiftH(x.s)) : '';
    cells['P' + row] = x ? fmtH(shiftH(x.s)) : ''; cells['S' + row] = x && x.p.days ? +x.p.days : '';
    cells['V' + row] = x ? x.s.label || x.p.shiftType : '';
  });
  [0, 1, 2, 3].forEach(i => {
    const row = 27 + i, p = c.positions[i];
    cells['B' + row] = p ? p.name : ''; cells['D' + row] = p && +p.bill ? +p.bill : ''; cells['F' + row] = p && +p.pay ? +p.pay : '';
    cells['J' + row] = p ? (p.teate[0] || {}).name || '' : ''; cells['L' + row] = p && +(p.teate[0] || {}).pay ? +p.teate[0].pay : ''; cells['N' + row] = p && +(p.teate[0] || {}).bill ? +p.teate[0].bill : '';
    cells['P' + row] = p ? (p.teate[1] || {}).name || '' : ''; cells['R' + row] = p && +(p.teate[1] || {}).pay ? +p.teate[1].pay : ''; cells['T' + row] = p && +(p.teate[1] || {}).bill ? +p.teate[1].bill : '';
    cells['V' + row] = p && +p.kotsuCap ? `${(+p.kotsuCap).toLocaleString()}円` : '';
    const jrow = 33 + i;
    cells['D' + jrow] = p && p.jobCode ? +p.jobCode : '';
    cells['J' + jrow] = p ? (c.company.pref || prefFromAddr(c.company.address)) : '';
  });
  const roles = [...appr].reverse();   // 決済・経理・管理本部・所長の並び
  ['I51', 'O51', 'R51', 'U51'].forEach((ref, i) => {
    const role = (roles[i] || {}).role; const a = role ? ap[role] : null;
    cells[ref] = a && a.ok ? `${surname(a.by)}\n${fmtMD(a.at)}` : (roles[i] || {}).name || '';
  });
  return cells;
}

/* ---- ③ 勤務説明書 ---- */
function cellsSetsumei(c, pair) {
  const co = c.company, k = kyotenOf(c.kyoten), F = cfg().fixed, fac = c.facilities.checks || [];
  const A = pair[0], B = pair[1];
  const L = { name: 'E11', koyo: 'E12', ext: 'L12', ageMin: 'E14', ageMax: 'H14', qual: 'E15', note: 'E31', holidays: 'E32', days: 'E34', monthH: 'J34', night: 'E35', ot: 'J35', nOt: 'E36', hol: 'J36', pay: 'F37', nightRate: 'E39', kotsuRule: 'E43', kotsuMonth: 'J43', kotsuCap: 'E49', shift: [['D25', 'G25', 'I25', 'K25', 'E26', 'G26'], ['D27', 'G27', 'I27', 'K27', 'E28', 'G28'], ['D29', 'G29', 'I29', 'K29', 'E30', 'G30']] };
  const R = { name: 'O11', koyo: 'O12', ext: 'V12', ageMin: 'O14', ageMax: 'R14', qual: 'O15', note: 'O31', holidays: 'O32', days: 'O34', monthH: 'T34', night: 'O35', ot: 'T35', nOt: 'O36', hol: 'T36', pay: 'P37', nightRate: '', kotsuRule: 'P43', kotsuMonth: '', kotsuCap: 'O49', shift: [['N25', 'Q25', 'S25', 'U25', 'O26', 'Q26'], ['N27', 'Q27', 'S27', 'U27', 'O28', 'Q28'], ['N29', 'Q29', 'S29', 'U29', 'O30', 'Q30']] };
  const cells = {
    N2: '', D3: co.name, J3: co.plant, Q3: k.corp, U3: k.office ? `${k.office}営業所` : '', Q4: k.address, Q6: k.tel, Q7: k.fax,
    Q8: c.setsumei.officeTanto || c.tanto, T8: '', D5: co.address, D7: co.access, G7: '', I7: '', D9: co.description,
    C17: [A && `①${A.name}\n${detailText(A)}`, B && `②${B.name}\n${detailText(B)}`].filter(Boolean).join('\n\n'),
    G51: c.work.payShime, H51: '締め', J51: c.work.payDay, K51: '', L51: '払い　（　銀行振込となります　）',
    N53: c.facilities.shokudoNote || (fac.includes('食堂') ? 'あり' : ''), N54: fac.includes('休憩室') ? 'あり' : '',
    N55: fac.includes('ロッカー') || fac.includes('更衣室') ? 'あり' : '', N56: c.facilities.otherNote || fac.filter(x => !['食堂', '休憩室', 'ロッカー', '更衣室'].includes(x)).join('、'),
    N57: c.setsumei.training, E58: F.hitsuyo, E59: '',
    E60: (F.hoken || '').split('\n')[0] || '', E61: (F.hoken || '').split('\n')[1] || '', E62: (F.hoken || '').split('\n')[2] || '',
    E65: F.gaiyo, E66: F.seido, S67: '',
  };
  const notes = [...(F.notes || []), ...String(c.setsumei.notes || '').split('\n').map(x => x.trim()).filter(Boolean)];
  for (let i = 0; i < 8; i++) { cells['B' + (67 + i)] = notes[i] ? '・' : ''; cells['C' + (67 + i)] = notes[i] || ''; cells['T' + (67 + i)] = ''; }
  [[A, L], [B, R]].forEach(([p, M]) => {
    if (!p) { Object.values(M).forEach(v => { if (typeof v === 'string' && v) cells[v] = ''; }); M.shift.forEach(s => s.forEach(ref => { cells[ref] = ''; })); return; }
    const m = monthly(p);
    cells[M.name] = p.name; cells[M.koyo] = p.koyo; cells[M.ext] = '';
    cells[M.ageMin] = +p.ageMin || ''; cells[M.ageMax] = +p.ageMax || '';
    cells[M.qual] = p.qualification; cells[M.note] = p.shiftNote; cells[M.holidays] = c.work.holidays;
    cells[M.days] = +p.days || ''; cells[M.monthH] = monthHours(p) != null ? +fmtH(monthHours(p)) : '';
    cells[M.night] = +p.nightH || 0; cells[M.ot] = +p.overtimeH || 0; cells[M.nOt] = +p.normalOtH || 0; cells[M.hol] = +p.holidayH || 0;
    cells[M.pay] = +p.pay || ''; cells[M.kotsuCap] = +p.kotsuCap || '';
    if (M.nightRate) cells[M.nightRate] = +p.pay ? Math.round(p.pay * 0.25) : '';
    if (M.kotsuRule) cells[M.kotsuRule] = p.kotsuRule || '';
    if (M.kotsuMonth) cells[M.kotsuMonth] = +p.kotsuMonthly || '';
    const sh = (p.shifts || []).filter(s => s.start);
    M.shift.forEach((refs, j) => {
      const s = sh[j];
      cells[refs[0]] = s ? fmtTime(s.start) : ''; cells[refs[1]] = s ? fmtTime(s.end) : '';
      cells[refs[2]] = s ? +fmtH(shiftH(s)) : ''; cells[refs[3]] = s ? +s.breakMin || 0 : '';
      cells[refs[4]] = s && s.breakFrom ? fmtTime(s.breakFrom) : ''; cells[refs[5]] = s && s.breakTo ? fmtTime(s.breakTo) : '';
    });
    if (sh.length > 3) cells[M.note] = [p.shiftNote, `※他に ${sh.slice(3).map(s => `${s.label} ${fmtTime(s.start)}～${fmtTime(s.end)}`).join('、')}`].filter(Boolean).join(' ');
  });
  return cells;
}

/* ---- 出力（各タブのボタンから呼ぶ） ---- */
async function exportTemplate(kind, c, idx = 0) {
  const nm = sanitize(caseName(c));
  try {
    if (kind === 'hearing') {
      const p = c.positions[idx] || c.positions[0];
      await fillTemplate('hearing', cellsHearing(c, p), sanitize(`新規受注時ヒアリングシート　${nm}${c.positions.length > 1 ? '_' + (p.name || idx + 1) : ''}`) + '.xlsx');
    } else if (kind === 'ringi') {
      await fillTemplate('ringi', cellsRingi(c), sanitize(`契約稟議（${dotDate(c.ringi.keiyakuDate || c.juchuDate)}　${nm}）`) + '.xlsx');
    } else {
      const pair = c.positions.slice(idx * 2, idx * 2 + 2);
      await fillTemplate('setsumei', cellsSetsumei(c, pair), sanitize(`${nm}　勤務説明書`) + '.xlsx');
    }
    toast('Excelを保存しました');
  } catch (e) { console.error(e); toast(String(e.message || e), 'warn'); }
}
