'use strict';
/* ===== 帳票（入力データから自動作成。転記なし） ===== */
const DOCS = [['ringi', '契約稟議書'], ['hearing', 'ヒアリングシート'], ['setsumei', '勤務説明書'], ['ad', '簡易求人票']];
const TD = (t, span = 1, k = '') => `<td colspan="${span}" class="${k}">${t ?? ''}</td>`;
const H = (t, span = 1) => TD(esc(t), span, 'h');
const V = (t, span = 1, k = '') => TD(escBr(t), span, k);
const TR = (...cells) => `<tr>${cells.join('')}</tr>`;
const SEC = t => TR(TD(esc(t), 12, 'sec'));
const TABLE = (rows, name) => `<table class="form" data-sheet="${esc(name)}"><colgroup>${'<col>'.repeat(12)}</colgroup><tbody>${rows.join('')}</tbody></table>`;
const pstamp = a => !a ? '' : a.ok ? `<span class="pstamp"><b>${esc(surname(a.by))}</b><i>${fmtMD(a.at)}</i></span>` : `<span class="pstamp ng"><b>差戻</b><i>${fmtMD(a.at)}</i></span>`;
const shiftText = s => s.start ? `${fmtTime(s.start)}～${fmtTime(s.end)}` : '';
const sexCount = p => { const n = +p.headcount || 0; return p.sex === '男性' ? [n, 0] : p.sex === '女性' ? [0, n] : [null, null]; };
const joinU = a => [...new Set(a.filter(Boolean))].join('／');

function docRingi(c) {
  const r = c.ringi, co = c.company, k = kyotenOf(c.kyoten), f = c.flow, ap = f.ringi.approvals || {};
  const allShifts = c.positions.flatMap(p => p.shifts.filter(s => s.start).map(s => ({ s, p })));
  const heads = c.positions.map(sexCount);
  const men = heads.some(h => h[0] == null) ? null : sum(heads.map(h => h[0])), women = heads.some(h => h[1] == null) ? null : sum(heads.map(h => h[1]));
  const total = sum(c.positions.map(p => p.headcount));
  const w = r.warimashi, marks = ['①', '②', '③', '④'];
  const rows = [
    TR(TD('契　約　稟　議　書', 12, 'title')),
    TR(H('取引状況', 2), V(r.torihiki, 4), H('稟議№', 2), V(r.no, 4)),
    TR(H('稟議種別', 2), V(r.shubetsu, 4), H('決裁日', 2), V(fmtJP(f.ringi.decidedAt), 4)),
    TR(H('決済希望スピード', 2), V(r.speed, 4), H('申請日', 2), V(fmtJP(f.ringi.submittedAt), 4)),
    TR(H('契約の種別', 2), V(r.keiyakuShubetsu, 4), H('企業名', 2), V(`${k.corp}　営業所 ${k.office}`, 4)),
    TR(H('変形労働時間 有/無', 2), V(r.henkei, 4), H('申請者', 2), V(r.applicant || c.tanto, 4)),
    SEC('■企業情報'),
    TR(H('企業名', 2), V(co.name, 6), H('工場名', 1), V(co.plant, 3)),
    TR(H('住所', 2), V(`${co.zip ? '〒' + co.zip + '　' : ''}${co.address}`, 10)),
    TR(H('電話番号', 2), V(co.tel, 4), H('FAX', 2), V(co.fax, 4)),
    TR(H('取引企業代表者名', 2), V(co.rep, 2), H('窓口担当者', 1), V(`${co.contactDept} ${co.contactTitle}`.trim(), 3), H('名前', 1), V(co.contactName, 3)),
    TR(H('資本金', 2), V(co.capital, 4), H('区分', 2), V(co.listed, 4)),
    TR(H('創業・設立', 2), V(co.founded, 2), H('業種', 1), V(co.industry, 3), H('生産品目', 1), V(co.products, 3)),
    SEC('■契約内容'),
    TR(H('契約部署', 2), V(r.busho, 2), H('作業内容', 1), V(joinU(c.positions.map(p => p.name)), 4), H('必要資格', 1), V(joinU(c.positions.map(p => p.qualification)), 2)),
    TR(H('契約（予定）日', 2), V(fmtD(r.keiyakuDate), 2), H('期間(自)', 1), V(fmtD(r.kikanFrom), 2), H('期間(至)', 1), V(fmtD(r.kikanTo), 2), H('更新', 1), V(r.koshin, 1)),
    TR(H('契約人数', 2), V(men == null ? '男女不問' : `男性 ${men}人`, 2, 'c'), V(women == null ? '' : `女性 ${women}人`, 2, 'c'), V(`合計 ${total}人`, 2, 'c'), H('勤務形態', 1), V(joinU(c.positions.map(p => p.shiftType)), 3)),
    TR(H('入金サイト', 2), H('締日', 1), V(r.billShime, 2), H('入金日', 1), V(r.billNyukin, 2), H('請求必着日', 2), V(r.billHitchaku, 2)),
    TR(H('勤務内容', 2), H('勤務時間', 3), H('休憩', 1), H('所定労働時間', 2), H('平均稼働日数', 2), H('勤務形態', 2)),
    ...[0, 1, 2, 3].map(i => { const x = allShifts[i]; return TR(V(marks[i], 2, 'c'), V(x ? shiftText(x.s) : '', 3, 'c'), V(x ? `${x.s.breakMin}M` : '', 1, 'c'), V(x ? fmtH(shiftH(x.s)) + 'H' : '', 2, 'c'), V(x && x.p.days ? x.p.days + '日' : '', 2, 'c'), V(x ? (x.s.label || x.p.shiftType) : '', 2, 'c')); }),
    TR(H('休日', 2), V(c.work.holidays, 4), H('給与支給', 2), V(`締日 ${c.work.payShime}　支払日 ${c.work.payDay}`, 4)),
    SEC('■契約金額／支払単価／職業分類'),
    TR(H('主な作業内容', 2), H('請求単価', 1), H('支払単価', 1), H('原価率', 1), H('手当①（支給/請求）', 2), H('手当②（支給/請求）', 2), H('交通費（上限）', 3)),
    ...[0, 1, 2, 3].map(i => { const p = c.positions[i]; if (!p) return TR(V(marks[i], 2), V('', 1), V('', 1), V('', 1), V('', 2), V('', 2), V('', 3)); const rr = rate(p); const t = x => x.name ? `${x.name} ${yen(x.pay)}/${yen(x.bill)}` : ''; return TR(V(`${marks[i]} ${p.name}`, 2), V(yen(p.bill), 1, 'n'), V(yen(p.pay), 1, 'n'), V(pct(rr), 1, 'n' + (rr != null && rr * 100 > cfg().threshold ? ' over' : '')), V(t(p.teate[0]), 2), V(t(p.teate[1]), 2), V(yen(p.kotsuCap), 3, 'n')); }),
    TR(H('割増', 2), V(`時間外 ${w.jikangai}%`, 2, 'c'), V(`深夜 ${w.shinya}%`, 2, 'c'), V(`法定外休出 ${w.hoteigai}%`, 2, 'c'), V(`法定休出 ${w.hotei}%`, 2, 'c'), V(`60H超 ${w.over60}%`, 2, 'c')),
    TR(H('職業安定業務統計', 2), H('小分類', 1), H('職業名', 3), H('地域', 1), H('基準値', 1), H('地域指数', 1), H('基準×指数', 1), H('時給との差異', 2)),
    ...c.positions.map((p, i) => { const x = wageCheck(c, p); return TR(V(marks[i], 2, 'c'), V(p.jobCode, 1, 'c'), V(x.name, 3), V(x.area, 1, 'c'), V(x.base ? yen(x.base) : '', 1, 'n'), V(x.idx ? x.idx + '%' : '', 1, 'n'), V(x.target ? yen(x.target) : '', 1, 'n'), V(x.ok == null ? '' : `${x.diff >= 0 ? '+' : ''}${Math.round(x.diff).toLocaleString()}円`, 2, 'n' + (x.ok === false ? ' over' : ''))); }),
    SEC('■現況及び起案者所見'), TR(V(r.shoken, 12, 'tall')),
    SEC('■備考'), TR(V(r.biko, 12, 'tall')),
    ...cfg().approvers.flatMap(a => [SEC(`■${a.role}コメント`), TR(V(ap[a.role] && ap[a.role].comment || '', 12))]),
    TR(TD('', 12, 'blank')),
    TR(H('決済ナンバー', 4), ...[...cfg().approvers].reverse().map(a => H(a.role, 2))),
    TR(V(r.no, 4, 'c'), ...[...cfg().approvers].reverse().map(a => TD(pstamp(ap[a.role]) || esc(a.name || ''), 2, 'stamp-cell'))),
  ];
  return TABLE(rows, '契約稟議書');
}

function docHearing(c, p, i) {
  const co = c.company, h = c.hearing, fac = c.facilities.checks || [];
  const hearingFac = ['更衣室', '食堂', '休憩室', '自動販売機', '電子レンジ', '冷蔵庫', 'ポット', '駐車場', 'ロッカー', '喫煙所'];
  const sh = p.shifts, marks = ['①', '②', '③', '④'];
  const rows = [
    TR(TD('新規受注時ヒアリングシート（派遣求人作成用）', 12, 'title')),
    TR(TD('', 8, 'blank'), H('作成日', 1), V(fmtD(c.juchuDate), 3)),
    TR(H('取引先企業名', 2), V(co.name, 4), H('就業先事業所名', 2), V(co.plant, 4)),
    TR(H('就業先住所', 2), V(co.address, 6), H('営業担当', 1), V(c.tanto, 3)),
    TR(H('契約期間', 2), V(`${h.contract}${h.contractPeriod ? '（' + h.contractPeriod + '）' : ''}`, 3), H('年齢', 1), V(`${p.ageMin ? p.ageMin + '～' : ''}${p.ageMax ? p.ageMax + '歳まで' : '上限なし'}`, 3), H('性別', 1), V(p.sex === '不問' ? '男女' : p.sex, 2)),
    TR(H('募集人数', 2), V(`${p.headcount}名`, 1, 'c'), H('休日', 1), V(c.work.holidays, 4), H('年間', 1), V(h.annualHolidays ? h.annualHolidays + '日' : '', 1, 'c'), H('残業見込み', 1), V(filled(p.overtimeH) ? p.overtimeH + '時間' : '', 1, 'c')),
    TR(H('福利厚生', 2), V(hearingFac.map(x => (fac.includes(x) ? '●' : '○') + x).join('　'), 10)),
    TR(H('時給', 2), V(yen(p.pay), 3, 'n'), H('備考', 1), V([p.kotsuRule && '交通費 ' + p.kotsuRule, p.kotsuCap && '上限' + yen(p.kotsuCap)].filter(Boolean).join('　'), 6)),
    ...[0, 1, 2, 3].map(j => TR(j === 0 ? H('勤務時間', 2) : TD('', 2, 'h'), V(marks[j], 1, 'c'), V(sh[j] ? shiftText(sh[j]) : '', 4, 'c'), H('備考', 1), V(sh[j] ? `${sh[j].label}（実働${fmtH(shiftH(sh[j]))}H）` : '', 4))),
    ...[0, 1, 2, 3].map(j => TR(j === 0 ? H('休憩時間', 2) : TD('', 2, 'h'), V(marks[j], 1, 'c'), V(sh[j] && sh[j].breakFrom ? `${fmtTime(sh[j].breakFrom)}～${fmtTime(sh[j].breakTo)}` : sh[j] ? `${sh[j].breakMin}分` : '', 4, 'c'), H('備考', 1), V(j === 0 ? p.shiftNote : '', 4))),
    SEC('仕事内容（重要事項）※出来るだけ詳しく'), TR(V(detailText(p), 12, 'tall')),
    SEC('ざっくりメリット・デメリット'), TR(V(meritLines(c).join('\n'), 12, 'tall')),
    SEC('職場環境（応募率に影響大）'), TR(V(h.environment, 12, 'tall')),
    SEC('備考欄（その他アピールポイント）'), TR(V(h.appeal, 12, 'tall')),
  ];
  return TABLE(rows, `ヒアリング${c.positions.length > 1 ? i + 1 : ''}`);
}

function docSetsumei(c, pair, n) {
  const co = c.company, k = kyotenOf(c.kyoten), fac = c.facilities.checks || [], F = cfg().fixed;
  const A = pair[0], B = pair[1];
  const cell = (fn, k2 = '') => [A, B].map(p => p ? V(fn(p), 5, k2) : V('—', 5, 'c')).join('');
  const row = (label, fn, k2) => TR(H(label, 2), cell(fn, k2));
  const shiftsTxt = p => p.shifts.filter(s => s.start).map((s, j) => `${['①', '②', '③', '④'][j]} ${s.label} ${shiftText(s)}　稼働${fmtH(shiftH(s))}H　休憩${s.breakMin}M${s.breakFrom ? `（${fmtTime(s.breakFrom)}－${fmtTime(s.breakTo)}）` : ''}`).join('\n');
  const moneyTxt = p => { const m = monthly(p); return m.lines.filter(l => l.h).map(l => `${l.k}　${yen(l.u)} × ${fmtH(l.h)}H ＝ ${yen(l.amt)}`).concat(m.kotsu ? [`交通費　${yen(m.kotsu)}`] : []).join('\n') + `\n月収例　計 ${yen(m.total)}`; };
  const has = x => fac.includes(x) ? 'あり' : 'なし';
  const rows = [
    TR(TD('事業所 勤務条件説明書', 12, 'title')),
    TR(H('事業所名', 2), V(`${co.name}　${co.plant}`, 5), H('管轄営業所', 1), V(`${k.corp}　${k.office}営業所`, 4)),
    TR(H('所在地', 2), V(co.address, 5), H('所在地', 1), V(k.address, 4)),
    TR(H('勤務地', 2), V(co.access, 5), H('TEL/FAX', 1), V([k.tel, k.fax].filter(Boolean).join(' / '), 4)),
    TR(H('企業説明', 2), V(co.description, 5), H('事業所担当', 1), V(c.setsumei.officeTanto || c.tanto, 4)),
    SEC('■勤務条件'),
    TR(H('', 2), H(`${n * 2 + 1}. ${A ? A.name : ''}`, 5), H(B ? `${n * 2 + 2}. ${B.name}` : '', 5)),
    row('雇用期間', p => p.koyo),
    row('年齢', p => `${p.ageMin || ''}～${p.ageMax ? p.ageMax + '歳迄' : ''}`),
    row('資格・経験', p => p.qualification),
    row('業務内容', p => detailText(p), 'tall'),
    row('作業姿勢', p => p.posture),
    row('勤務時間', p => shiftsTxt(p)),
    row('備考', p => p.shiftNote),
    row('休日', () => c.work.holidays),
    row('稼働日数・時間', p => `${p.days ? p.days + '日' : ''}　${monthHours(p) != null ? fmtH(monthHours(p)) + 'H/月' : ''}`),
    row('深夜・残業', p => `深夜 ${fmtH(+p.nightH || 0)}H/月　残業 ${fmtH(+p.overtimeH || 0)}H/月`),
    row('通常残業・休日出勤', p => `通常残業 ${fmtH(+p.normalOtH || 0)}H/月　休日出勤 ${fmtH(+p.holidayH || 0)}H/月`),
    row('基本給・月収例', p => `時給 ${yen(p.pay)}\n` + moneyTxt(p)),
    row('手当／割増', p => `残業時給 ${yen(p.pay * 1.25)}/H　深夜割増 ${yen(p.pay * 0.25)}/H　休出時給 ${yen(p.pay * 1.25)}/H`),
    row('交通費', p => [p.kotsuRule, p.kotsuCap ? '上限 ' + yen(p.kotsuCap) + '/月' : ''].filter(Boolean).join('　')),
    TR(H('職場の特徴', 2), V(meritLines(c).join('\n'), 10)),
    TR(H('給与支払', 2), V(`毎月${c.work.payShime}締め　${c.work.payDay}払い（銀行振込となります）`, 10)),
    TR(H('作業服', 2), V((c.setsumei.uniform || []).join('　') || '—', 10)),
    TR(H('福利厚生施設', 2), V(`食堂施設：${has('食堂')}${c.facilities.shokudoNote ? '（' + c.facilities.shokudoNote + '）' : ''}\n休憩施設：${has('休憩室')}　ロッカー・更衣：${fac.includes('ロッカー') || fac.includes('更衣室') ? 'あり' : 'なし'}\nその他：${[fac.filter(x => ['自動販売機', '電子レンジ', '冷蔵庫', 'ポット', '駐車場', '喫煙所'].includes(x)).join('、'), c.facilities.otherNote].filter(Boolean).join('　')}`, 10)),
    TR(H('教育訓練制度', 2), V(c.setsumei.training, 10)),
    TR(H('入社時必要品', 2), V(F.hitsuyo, 10)),
    TR(H('労働保険及び社会保険加入', 2), V(F.hoken + `\n予定派遣先 ${co.name} ${co.plant} の就業条件では、以下の通りとなります。\n雇用保険（　加入あり ・ 加入なし　）　健康・厚生年金保険（　加入あり ・ 加入なし　）`, 10)),
    TR(H('事業運営の概要', 2), V(F.gaiyo, 10)),
    TR(H('派遣制度の概要', 2), V(F.seido, 10)),
    TR(TD([...F.notes, ...String(c.setsumei.notes || '').split('\n').filter(Boolean)].map(x => '・' + esc(x)).join('<br>'), 12)),
  ];
  return TABLE(rows, `勤務説明書${n ? n + 1 : ''}`);
}

function adDraft(c, p) {
  const f = c.facilities.checks || [];
  const m = monthly(p);
  return [
    `【職種】${p.name}`,
    `【給与】時給${yen(p.pay)}${m.total && monthHours(p) ? `（月収例 ${yen(m.total)}）` : ''}`,
    `【勤務地】${c.company.address}${c.company.access ? '（' + c.company.access + '）' : ''}`,
    `【勤務時間】${p.shifts.filter(s => s.start).map(s => `${s.label} ${shiftText(s)}（休憩${s.breakMin}分）`).join('／')}${p.shiftNote ? '\n　' + p.shiftNote : ''}`,
    `【休日】${c.work.holidays}${c.hearing.annualHolidays ? `（年間休日${c.hearing.annualHolidays}日）` : ''}`,
    `【仕事内容】\n${detailText(p)}`,
    `【応募資格】${p.ageMin ? p.ageMin + '歳以上' : ''}${p.ageMax ? '〜' + p.ageMax + '歳まで' : ''}${p.sex && p.sex !== '不問' ? '・' + p.sex : ''}${p.qualification ? '\n' + p.qualification : ''}`,
    `【待遇】${[p.kotsuRule && '交通費支給（' + p.kotsuRule + (p.kotsuCap ? '・上限' + yen(p.kotsuCap) : '') + '）', (c.setsumei.uniform || []).length && '制服貸与', ...f].filter(Boolean).join('／')}`,
    meritLines(c, true).length && `【職場の特徴】\n${meritLines(c, true).map(x => '・' + x).join('\n')}`,
    c.hearing.environment && `【職場環境】${c.hearing.environment}`,
    `【募集人数】${p.headcount}名`,
    (c.adOrder.media || []).length && `（掲載希望媒体：${c.adOrder.media.join('・')}）`,
    c.adOrder.note && `（RDへの要望：${c.adOrder.note}）`,
  ].filter(Boolean).join('\n');
}
function docAd(c) {
  const blocks = c.positions.map((p, i) => `<div class="sheet"><div class="eyebrow">簡易求人票 ${c.positions.length > 1 ? i + 1 : ''}・入力内容から自動作成</div><h2 style="font-family:var(--serif);font-size:20px;margin:6px 0 14px;color:var(--paper-ink)">${esc(caseName(c))}</h2>${TABLE([TR(H('原稿', 2), V(adDraft(c, p), 10))], `求人票${i + 1}`)}</div>`).join('');
  const ai = c.jobAd && c.jobAd.text ? `<div class="sheet"><div class="eyebrow">AI作成の求人原稿 ・ ${fmtDT(c.jobAd.at)} ${esc(c.jobAd.by)}</div><div class="adtext" style="margin-top:10px">${esc(c.jobAd.text)}</div>${TABLE([TR(V(c.jobAd.text, 12))], 'AI原稿').replace('<table', '<table hidden')}</div>` : '';
  return blocks + ai;
}

function viewDoc(r) {
  const raw = S.cases[r.id]; if (!raw) return `<div class="empty panel">案件が見つかりません。<a href="#/cases">案件一覧へ</a></div>`;
  const c = normalizeCase(raw); const type = DOCS.some(d => d[0] === r.tab) ? r.tab : 'ringi';
  let body = '';
  if (type === 'ringi') body = `<div class="sheet">${docRingi(c)}</div>`;
  if (type === 'hearing') body = c.positions.map((p, i) => `<div class="sheet">${docHearing(c, p, i)}</div>`).join('');
  if (type === 'setsumei') { const pairs = []; for (let i = 0; i < c.positions.length; i += 2) pairs.push(c.positions.slice(i, i + 2)); body = pairs.map((pr, n) => `<div class="sheet">${docSetsumei(c, pr, n)}</div>`).join(''); }
  if (type === 'ad') body = docAd(c);
  const miss = type === 'ringi' ? check(c, 'a2') : type === 'ad' ? check(c, 'a1') : check(c, 'a3');
  return `<div class="pagehead noprint"><div><div class="eyebrow">DOCUMENTS</div><h1>${esc(caseName(c))}</h1></div><span class="spacer"></span><a class="btn ghost" href="#/case/${c.id}">← 案件に戻る</a></div>
  <div class="doctools noprint">
    <div class="seg-f" role="group" aria-label="帳票">${DOCS.map(([k, l]) => `<button data-act="doctype" data-v="${k}" aria-pressed="${k === type}">${l}</button>`).join('')}</div>
    <span class="spacer"></span>
    <button class="btn" data-act="print">印刷・PDF</button>
    <button class="btn primary" data-act="xlsx">Excelで保存</button>
  </div>
  ${!miss.ok ? `<div class="banner warn noprint">未入力の項目があります：${esc(miss.miss.slice(0, 6).join('、'))}${miss.miss.length > 6 ? ` ほか${miss.miss.length - 6}件` : ''}　<a href="#/case/${c.id}/${type === 'ringi' ? 'a2' : type === 'ad' ? 'a1' : 'a3'}">入力する</a></div>` : ''}
  <div id="aiadout" class="noprint"></div>
  <div class="docs" id="docs">${body}</div>`;
}

/* ---- 出力 ---- */
let _xlsx = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsx) return _xlsx;
  _xlsx = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => { _xlsx = null; rej(new Error('load')); }; document.head.appendChild(s); });
  return _xlsx;
}
async function exportXlsx(c, type) {
  let X; try { X = await loadXLSX(); } catch { return toast('Excel出力の部品を読み込めませんでした。通信状態を確認してください', 'warn'); }
  const wb = X.utils.book_new();
  $$('#docs table.form').forEach((t, i) => {
    const ws = X.utils.table_to_sheet(t, { raw: true });
    ws['!cols'] = Array.from({ length: 12 }, () => ({ wch: 11 }));
    X.utils.book_append_sheet(wb, ws, (t.dataset.sheet || 'Sheet' + (i + 1)).slice(0, 31));
  });
  const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
  const name = `${DOCS.find(d => d[0] === type)[1]}（${fmtD(today()).replace(/\//g, '.')}_${caseName(c)}）.xlsx`.replace(/[\\/:*?"<>|]/g, '_');
  saveFile(name, out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); toast('Excelを保存しました');
}
