'use strict';
/* ===== 共通部品 ===== */
const chip = (t, tone = '') => `<span class="chip ${tone}">${esc(t)}</span>`;
function gaugeHTML(r) {
  const th = cfg().threshold;
  if (r == null) return `<div class="gauge na"><div class="bar"><em style="left:${th}%"></em></div><span>未判定</span></div>`;
  const over = r * 100 > th + 1e-9;
  return `<div class="gauge ${over ? 'over' : 'ok'}" title="原価率＝支払単価÷請求単価（しきい値${th}%）"><div class="bar"><i style="width:${Math.min(100, r * 100)}%"></i><em style="left:${th}%"></em></div><span>${pct(r)}</span></div>`;
}
const trkHTML = c => `<span class="trk" title="${steps(c).map(s => s.k + '：' + ({ done: '完了', todo: '未', wait: '決裁待ち', back: '差戻し', locked: 'ロック' }[s.st])).join(' / ')}">${steps(c).map(s => `<i class="${s.st}"></i>`).join('')}</span>`;
function stampHTML(a) {
  if (!a) return `<span class="stamp empty">未</span>`;
  if (a.ok) return `<span class="stamp" title="${esc(a.by)} ${fmtDT(a.at)}"><b>${esc(surname(a.by))}</b><i>${fmtMD(a.at)}</i></span>`;
  return `<span class="stamp ng" title="${esc(a.comment || '')}"><b>差戻</b><i>${fmtMD(a.at)}</i></span>`;
}

/* ===== 入力フィールド ===== */
let MISS = new Set();
function fld(path, label, type = 'text', o = {}) {
  LABELS[path.replace(/\.\d+\./g, '.*.')] = label;
  const D = S.draft || {};
  const v = get(D, path) ?? '';
  const id = 'f_' + path.replace(/\./g, '_');
  let key = o.miss || label; const pm = path.match(/^positions\.(\d+)\./);
  if (pm && (D.positions || []).length > 1) key += `（職種${+pm[1] + 1}）`;
  const missing = o.req && MISS.has(key);
  const req = o.req ? `<i class="req">${o.req === true ? '必須' : esc(o.req)}</i>` : '';
  const t = o.t ? ` data-t="${o.t}"` : '';
  let input;
  switch (type) {
    case 'textarea': input = `<textarea id="${id}" data-p="${path}" rows="${o.rows || 3}" placeholder="${esc(o.ph || '')}">${esc(v)}</textarea>`; break;
    case 'select': input = `<select id="${id}" data-p="${path}">${['', ...o.options].map(x => { const [val, lb] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}"${String(v) === String(val) ? ' selected' : ''}>${esc(lb || '選択…')}</option>`; }).join('')}</select>`; break;
    case 'seg': input = `<div class="seg" role="radiogroup" aria-label="${esc(label)}">${o.options.map(x => `<label><input type="radio" name="${id}" data-p="${path}" value="${esc(x)}"${String(v) === String(x) ? ' checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>`; break;
    case 'checks': input = `<div class="checks">${o.options.map(x => `<label><input type="checkbox" data-p="${path}" data-multi value="${esc(x)}"${(Array.isArray(v) ? v : []).includes(x) ? ' checked' : ''}>${esc(x)}</label>`).join('')}</div>`; break;
    case 'yen': case 'num': {
      const step = o.step != null ? o.step : type === 'yen' ? 50 : o.unit === '%' ? 5 : 1;
      const min = o.min != null ? o.min : 0;
      input = `<div class="suffix"><input type="number" inputmode="decimal" id="${id}" data-p="${path}" data-t="num" value="${esc(v)}" step="${step}" min="${min}" placeholder="${esc(o.ph || '')}"><span>${type === 'yen' ? '円' : esc(o.unit || '')}</span></div>`; break;
    }
    case 'date': input = `<input type="date" id="${id}" data-p="${path}" value="${esc(v)}">`; break;
    case 'time': input = `<input type="time" id="${id}" data-p="${path}" value="${esc(v)}" step="300">`; break;
    default: input = `<input type="text" id="${id}" data-p="${path}"${t} value="${esc(v)}" placeholder="${esc(o.ph || '')}"${o.list ? ` list="${o.list}"` : ''} autocomplete="off">`;
  }
  const lb = type === 'seg' || type === 'checks' ? `<span class="lb">${esc(label)}${req}</span>` : `<label for="${id}">${esc(label)}${req}</label>`;
  return `<div class="f ${o.w || ''}${missing ? ' miss' : ''}">${lb}${input}${o.hint ? `<small>${o.hint}</small>` : ''}${o.after || ''}</div>`;
}
const section = (title, body, lead = '', extra = '') => `<section class="fs"><h3>${title}${extra}</h3>${lead ? `<p class="lead">${lead}</p>` : ''}${body}</section>`;
const fg = (...a) => `<div class="fg">${a.join('')}</div>`;

/* ===== 案件一覧 ===== */
function viewList() {
  const F = S.filters, C = cfg();
  const all = Object.values(S.cases).map(normalizeCase);
  const attn = all.flatMap(c => alertsFor(c).map(a => ({ ...a, c }))).sort((x, y) => TONE_ORDER[x.tone] - TONE_ORDER[y.tone]);
  let rows = all.filter(c => (!F.kyoten || c.kyoten === F.kyoten) && (!F.tanto || c.tanto === F.tanto) && (!F.stage || stage(c).k === F.stage) && (!F.q || norm(caseName(c) + c.tanto).includes(norm(F.q))));
  rows.sort((a, b) => (a.flow.closed - b.flow.closed) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const kyos = C.kyotens.map(k => k.id);
  const attnHTML = attn.length ? `<section class="attn"><h2>対応が必要（${attn.length}件）</h2><ul>${attn.slice(0, 12).map(a => `<li><a href="#/case/${a.c.id}"><span class="sev ${a.tone}"></span><span class="nm">${esc(caseName(a.c))}</span><span class="msg">${esc(a.text)}</span><span class="go small muted">${esc(a.c.tanto || '')}</span></a></li>`).join('')}</ul>${attn.length > 12 ? `<p class="small muted">ほか${attn.length - 12}件</p>` : ''}</section>` : '';
  const st = c => { const s = stage(c); return chip(s.label, s.tone); };
  const pc = c => sum(postingsOf(c.id).filter(p => p.status !== '停止').map(p => +p.count || 0));
  const table = `<div class="scroll-x tbl-wide"><table class="list"><thead><tr><th>案件</th><th>段階</th><th>進捗</th><th>原価率</th><th>面接・進捗報告</th><th style="text-align:right">求人数</th><th style="text-align:right">応募 直近3ヶ月</th><th>更新</th></tr></thead><tbody>
    ${rows.map(c => { const g = gate(c); const s = statsFor(c); return `<tr class="click" data-href="#/case/${c.id}">
      <td><div class="cname"><a href="#/case/${c.id}">${esc(caseName(c))}</a>${S.kept[c.id] ? ' <span class="chip warn plain">未保存あり</span>' : ''}</div><div class="cmeta">${esc(c.kyoten || '拠点未設定')} ・ ${esc(c.tanto || '担当未設定')} ・ 受注 ${fmtD(c.juchuDate)}</div></td>
      <td>${st(c)}</td><td>${trkHTML(c)}</td><td>${gaugeHTML(g.max)}</td>
      <td>${c.flow.closed ? '' : interviewOK(c) ? chip('可', 'ok') : chip('停止（③未入力）', c.legacy ? '' : 'crit')}</td>
      <td class="n" style="text-align:right">${pc(c) || '<span class="muted">—</span>'}</td>
      <td class="n" style="text-align:right">${s.recent || '<span class="muted">—</span>'}</td>
      <td class="small muted">${fmtMD(c.updatedAt)} ${esc(c.updatedBy || '')}</td></tr>`; }).join('')}
  </tbody></table></div>`;
  const cards = `<div class="cards">${rows.map(c => { const g = gate(c); return `<a class="card" href="#/case/${c.id}"><div class="row"><span class="cname">${esc(caseName(c))}</span><span class="spacer"></span>${st(c)}</div><div class="cmeta">${esc(c.kyoten || '拠点未設定')} ・ ${esc(c.tanto || '')}</div><div class="row">${trkHTML(c)}<span class="spacer"></span>${gaugeHTML(g.max)}</div></a>`; }).join('')}</div>`;
  return `<div class="pagehead"><div><div class="eyebrow">CASES</div><h1>案件一覧</h1></div><span class="sub">${all.length}件 ・ 原価率しきい値 ${C.threshold}%</span><span class="spacer"></span><a class="btn primary" href="#/new">＋ 新規受注を登録</a></div>
  ${attnHTML}
  <div class="filters">
    <div class="seg-f" role="group" aria-label="拠点"><button data-act="fk" data-v="" aria-pressed="${!F.kyoten}">全拠点</button>${kyos.map(k => `<button data-act="fk" data-v="${esc(k)}" aria-pressed="${F.kyoten === k}">${esc(k)}</button>`).join('')}</div>
    <select data-filter="tanto" aria-label="担当"><option value="">担当：全員</option>${C.staff.map(s => `<option${F.tanto === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
    <select data-filter="stage" aria-label="段階"><option value="">段階：すべて</option>${STAGES.map(([k, l]) => `<option value="${k}"${F.stage === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <input type="search" data-filter="q" placeholder="企業名・担当で検索" value="${esc(F.q)}" aria-label="検索">
  </div>
  ${rows.length ? table + cards : `<div class="empty panel">該当する案件はありません。<br><a class="btn primary" href="#/new" style="margin-top:12px">＋ 新規受注を登録</a></div>`}`;
}

/* ===== 案件画面 ===== */
const TABS = [['a1', '① 簡易求人'], ['a2', '② 稟議'], ['a3', '③ 詳細・勤務説明'], ['kg', '現場実態'], ['log', '履歴・管理']];
function ensureDraft(r) {
  if (r.view === 'new') {
    if (S.draftId !== 'new') {
      const kept = S.kept.new;
      if (kept) { S.draft = kept.draft; S.base = null; S.dirty = true; }
      else {
        S.draft = newCase(); S.base = null; S.dirty = false;
        const q = new URLSearchParams((location.hash.split('?')[1]) || '');
        if (q.get('name')) { S.draft.company.name = q.get('name'); S.draft.aliases = [q.get('name')]; }
        if (q.get('kyoten')) S.draft.kyoten = q.get('kyoten');
        if (q.get('code')) S.draft.adCodes = q.get('code').split(',').filter(Boolean);
      }
      S.draftId = 'new';
    }
    return S.draft;
  }
  const c = S.cases[r.id]; if (!c) return null;
  if (S.draftId !== r.id) {
    const kept = S.kept[r.id];
    if (kept) { S.draft = kept.draft; S.base = kept.base; S.dirty = true; }
    else { S.draft = normalizeCase(clone(c)); S.base = normalizeCase(clone(c)); S.dirty = false; }
    S.draftId = r.id;
  } else if (!S.dirty && c.updatedAt !== (S.base && S.base.updatedAt)) {
    S.draft = normalizeCase(clone(c)); S.base = normalizeCase(clone(c));
  }
  return S.draft;
}
function viewCase(r) {
  const c = ensureDraft(r);
  if (!c) return `<div class="empty panel">この案件は見つかりません（削除された可能性があります）。<br><a href="#/cases">案件一覧へ</a></div>`;
  const isNew = r.view === 'new';
  const tab = TABS.some(t => t[0] === r.tab) ? r.tab : 'a1';
  const stored = isNew ? null : normalizeCase(S.cases[c.id]);
  const conflict = !isNew && S.dirty && stored.updatedAt !== S.base.updatedAt;
  const s = stage(stored || c);
  const k = kyotenOf(c.kyoten);
  const tabHref = t => isNew ? `#/new/_/${t}` : `#/case/${c.id}/${t}`;
  return `
  ${conflict ? `<div class="banner warn">${esc(stored.updatedBy)}さんがこの案件を更新しました（${fmtDT(stored.updatedAt)}）。保存すると、あなたが変えた項目だけが最新の内容に重ねて保存されます。</div>` : ''}
  <div class="casehead">
    <div style="min-width:0;flex:1">
      <div class="eyebrow">${isNew ? '新規受注' : esc(c.kyoten || '拠点未設定') + ' ・ ' + esc(k.corp) + ' ' + esc(k.office)}</div>
      <h1>${esc(c.company.name || '新規案件')}${c.company.plant ? `<small>${esc(c.company.plant)}</small>` : ''}</h1>
      <div class="row small muted" style="margin-top:4px">${isNew ? '' : chip(s.label, s.tone)}<span>営業担当 ${esc(c.tanto || '—')}</span><span>受注 ${fmtD(c.juchuDate)}</span>${c.legacy ? chip('導入前の既存案件') : ''}</div>
    </div>
    ${isNew ? '' : `<div class="row"><a class="btn" href="#/doc/${c.id}/ringi">帳票を見る</a><a class="btn" href="#/postings?case=${c.id}">求人管理</a></div>`}
  </div>
  <div class="casegrid">
    <aside class="flowcol" data-live="flow">${flowPanel(c, stored)}</aside>
    <div>
      <nav class="tabs" data-live="tabs">${tabsHTML(c, tab, tabHref)}</nav>
      <div class="formwrap" id="form">${tabBody(c, tab, isNew)}</div>
    </div>
  </div>`;
}
function tabsHTML(c, tab, tabHref) {
  const cnt = { a1: check(c, 'a1'), a2: check(c, 'a2'), a3: check(c, 'a3') };
  const kg = kengakuCount(c);
  return TABS.map(([t, l]) => {
    let badge = '';
    if (cnt[t]) badge = `<span class="cnt ${cnt[t].ok ? 'full' : ''}">${cnt[t].done}/${cnt[t].total}</span>`;
    if (t === 'kg') badge = `<span class="cnt ${kg >= REQ.a3.kengakuMin ? 'full' : ''}">${kg}/${KENGAKU.length}</span>`;
    return `<a href="${tabHref(t)}"${t === tab ? ' aria-current="page"' : ''}>${l}${badge}</a>`;
  }).join('');
}
function tabToolbar(c, tab) {
  const map = { a1: ['hearing', '新規受注時ヒアリングシートを出力'], a2: ['ringi', '契約稟議書を出力'], a3: ['setsumei', '勤務説明書を出力'] };
  if (!map[tab]) return '';
  const [kind, label] = map[tab];
  let extra = '';
  if (kind === 'hearing' && c.positions.length > 1) {
    extra = `<select class="inp" id="exppos" style="width:auto" aria-label="出力する職種">${c.positions.map((p, i) => `<option value="${i}">${esc(p.name || '職種' + (i + 1))}</option>`).join('')}</select>`;
  }
  if (kind === 'setsumei' && c.positions.length > 2) {
    extra = `<select class="inp" id="exppos" style="width:auto" aria-label="出力する職種">${c.positions.map((p, i) => i % 2 ? '' : `<option value="${i / 2}">職種${i + 1}${c.positions[i + 1] ? '・' + (i + 2) : ''}</option>`).join('')}</select>`;
  }
  return `<div class="row" style="padding:14px 0 0">${extra}<button class="btn" data-act="exp" data-kind="${kind}">${label}</button><span class="small muted">いただいた様式のExcelに、入力内容を入れて保存します</span></div>`;
}
function tabBody(c, tab, isNew) {
  MISS = new Set([...check(c, 'a1').miss, ...check(c, 'a2').miss, ...check(c, 'a3').miss]);
  const bar = tabToolbar(c, tab);
  switch (tab) {
    case 'a2': return bar + formA2(c);
    case 'a3': return bar + formA3(c);
    case 'kg': return formKG(c);
    case 'log': return isNew ? `<p class="muted" style="padding:20px 0">保存すると履歴が残ります。</p>` : formLog(c);
    default: return bar + formA1(c);
  }
}

/* ---- フロー欄 ---- */
function flowPanel(c, stored) {
  const C = cfg();
  if (!stored) {
    const g = gate(c);
    return `<div class="panel"><h3>進め方</h3><ol class="flowv">
      <li class="wait"><span class="dot">1</span><div><div class="t">① 簡易求人を入力</div><div class="d">拠点・就業先・職種・単価・勤務時間。原価率が${C.threshold}%以下なら、稟議の前にRDへ発注できます。</div></div></li>
      <li><span class="dot">2</span><div><div class="t">② 稟議を上申</div><div class="d">企業情報・契約内容・職業分類。</div></div></li>
      <li><span class="dot">3</span><div><div class="t">承認後 ③ 詳細を入力</div><div class="d">ヒアリング・勤務説明書・現場実態。③がないと面接・進捗報告は行いません。</div></div></li>
    </ol><div style="margin-top:8px">${gaugeHTML(g.max)}</div><p class="small muted" style="margin:8px 0 0">まず「保存」で受注登録されます。</p></div>`;
  }
  const f = stored.flow, g = gate(stored), rs = f.ringi.state, dirty = S.dirty;
  const a1 = check(stored, 'a1'), a2 = check(stored, 'a2'), a3 = check(stored, 'a3');
  const why = t => `<div class="why">${esc(t)}</div>`;
  const missTxt = r => '未入力：' + r.miss.slice(0, 4).join('、') + (r.miss.length > 4 ? ` ほか${r.miss.length - 4}件` : '');
  const st = steps(stored);
  const desc = [
    `${fmtD(stored.juchuDate)} ${esc(stored.tanto)}`,
    f.area1.done ? `${fmtMD(f.area1.at)} ${esc(f.area1.by)} がRDへ発注` : g.state === 'strict' ? `<span class="warn">原価率${pct(g.max)}（${C.threshold}%超）→ 稟議承認後に③と同時入力</span>` : g.state === 'fast' ? `原価率${pct(g.max)}：稟議前に発注できます` : '請求単価と時給で原価率を判定',
    rs === '未上申' ? (f.area1.done ? `<span class="${daysSince(f.area1.at) >= C.ringiDays ? 'crit' : 'warn'}">発注から${daysSince(f.area1.at)}日 未上申</span>` : '') : rs === '差戻し' ? '<span class="warn">差し戻されました</span>' : `${fmtMD(f.ringi.submittedAt)} 上申`,
    rs === '承認' ? `${fmtMD(f.ringi.decidedAt)} 承認` : rs === '上申中' ? `決裁待ち ${daysSince(f.ringi.submittedAt)}日目` : '',
    f.area3.done ? `${fmtMD(f.area3.at)} 入力完了・面接可` : rs === '承認' ? '<span class="crit">未入力：面接・進捗報告は停止中</span>' : '承認後に入力',
  ];
  const acts = [];
  if (dirty) acts.push(`<div class="banner info" style="margin:0">未保存の変更があります。先に保存してください。</div>`);
  if (!f.area1.done) {
    const can = g.state === 'fast' && a1.ok && !dirty;
    const reason = g.state === 'unknown' ? '請求単価と時給を入力すると判定します' : g.state === 'strict' ? `原価率が${C.threshold}%を超えるため、稟議承認後に③と同時に発注します` : !a1.ok ? missTxt(a1) : '';
    acts.push(`<button class="btn ${can ? 'primary' : ''}" data-act="order1" ${can ? '' : 'disabled'}>① 簡易求人をRDへ発注</button>${reason ? why(reason) : ''}`);
  }
  if (rs === '未上申' || rs === '差戻し') {
    const can = a1.ok && a2.ok && !dirty;
    acts.push(`<button class="btn ${can && (f.area1.done || g.state !== 'fast') ? 'primary' : ''}" data-act="submit" ${can ? '' : 'disabled'}>② 稟議を${rs === '差戻し' ? '再' : ''}上申</button>${!a1.ok ? why(missTxt(a1)) : !a2.ok ? why(missTxt(a2)) : ''}`);
  }
  if (rs === '承認' && !f.area3.done) {
    const can = a3.ok && a1.ok && !dirty;
    acts.push(`<button class="btn ${can ? 'primary' : ''}" data-act="done3" ${can ? '' : 'disabled'}>③ 入力完了（面接・進捗報告を開始）</button>${!a3.ok ? why(missTxt(a3)) : !f.area1.done ? why('①の簡易求人も同時にRDへ発注されます') : ''}`);
  }
  if (stored.pendingRd) acts.push(`<button class="btn" data-act="rdack" ${dirty ? 'disabled' : ''}>RD：変更内容を確認した</button>`);
  let appr = '';
  if (rs !== '未上申') {
    const ap = f.ringi.approvals || {};
    appr = `<div class="panel"><h3>稟議の決裁</h3><div class="stamps">${C.approvers.map(a => `<div class="stampbox"><span class="role">${esc(a.role)}</span>${stampHTML(ap[a.role])}<span class="small muted">${esc(a.name || '')}</span></div>`).join('')}</div>
    ${rs === '上申中' ? `<div style="margin-top:12px;display:grid;gap:8px"><textarea class="inp" id="apcomment" rows="2" placeholder="コメント（差戻しの場合は理由を必ず）"></textarea><div class="row">${C.approvers.filter(a => !(ap[a.role] && ap[a.role].ok)).map(a => `<button class="btn sm" data-act="approve" data-role="${esc(a.role)}">${esc(a.role)}として承認</button>`).join('')}<button class="btn sm danger" data-act="reject">差戻し</button></div><div class="small muted">入力者「${esc(S.me || '未選択')}」の名前で押印されます。</div></div>` : ''}
    ${Object.entries(ap).filter(([, v]) => v.comment).map(([r, v]) => `<div class="note"><div class="when">${esc(r)} ${esc(v.by)} ・ ${fmtDT(v.at)}</div>${escBr(v.comment)}</div>`).join('')}</div>`;
  }
  const notes = (stored.history || []).filter(h => h.type === 'note').slice(0, 5);
  return `<div class="panel"><h3>進捗</h3>
    <ol class="flowv">${st.map((x, i) => `<li class="${x.st}"><span class="dot">${x.st === 'done' ? '✓' : x.st === 'locked' ? '–' : i}</span><div><div class="t">${x.k}</div><div class="d">${desc[i] || ''}</div></div></li>`).join('')}</ol>
    <div style="margin:4px 0 12px">${gaugeHTML(g.max)}</div>
    <div class="row" style="margin-bottom:10px">${interviewOK(stored) ? chip('面接・進捗報告：可', 'ok') : chip('面接・進捗報告：停止（③未入力）', stored.legacy ? '' : 'crit')}</div>
    <div class="acts">${acts.join('')}</div></div>
    ${appr}
    <div class="panel"><h3>連絡メモ</h3><p class="small muted" style="margin:-4px 0 8px">LINEの代わりに、RD・所長への連絡はここに残します。</p>
      <textarea class="inp" id="notein" rows="2" placeholder="例：面接枠は火・木の午後で調整済み"></textarea>
      <div class="row" style="margin-top:6px"><span class="spacer"></span><button class="btn sm" data-act="note">メモを残す</button></div>
      <div class="notes">${notes.map(n => `<div class="note"><div class="when">${esc(n.by)} ・ ${fmtDT(n.at)}</div>${escBr(n.text)}</div>`).join('') || '<span class="small muted">まだありません</span>'}</div>
    </div>`;
}

/* ---- ① 簡易求人 ---- */
function timeSel(path, v, aria) {
  LABELS[path.replace(/\.\d+\./g, '.*.')] = LABELS[path.replace(/\.\d+\./g, '.*.')] || aria;
  const m = String(v || '').match(/^(\d{1,2}):(\d{2})/); const h = m ? +m[1] : null; const mi = m ? +m[2] : null;
  const mins = Array.from({ length: 12 }, (_, i) => i * 5); if (mi != null && !mins.includes(mi)) mins.push(mi);
  const opt = (val, sel, label) => `<option value="${val}"${sel ? ' selected' : ''}>${label}</option>`;
  return `<span class="tsel"><select data-tp="${path}" data-part="h" aria-label="${esc(aria)} 時">${opt('', h == null, '--')}${Array.from({ length: 24 }, (_, i) => opt(i, i === h, i)).join('')}</select><span>:</span><select data-tp="${path}" data-part="m" aria-label="${esc(aria)} 分">${opt('', mi == null, '--')}${mins.sort((a, b) => a - b).map(x => opt(x, x === mi, String(x).padStart(2, '0'))).join('')}</select></span>`;
}
function jobFields(i, p, detailed) {
  const len = `<span data-live="len:${i}">${detailLen(p)}字</span>`;
  return [
    fld(`positions.${i}.product`, '完成品・用途', 'text', { req: !detailed, miss: '完成品・用途', w: 'wf', ph: '例：戸建て住宅の窓になるアルミサッシの枠', hint: '完成品は何で、何に使われる部品か。イメージがつくように' }),
    fld(`positions.${i}.task`, '作業内容', 'textarea', { req: !detailed, miss: '作業内容', w: 'wf', rows: 3, ph: '例：工場内のライン横で、電動ドライバーを使って窓枠のネジ締めと目視検査。流れてくる枠を1日約200本', hint: 'どこで・何を使って・どんな作業をするのか' }),
    fld(`positions.${i}.detail`, detailed ? '仕事内容の補足' : '補足（任意）', 'textarea', detailed
      ? { req: `合計${REQ.a3.detailMin}字以上`, miss: `仕事内容${REQ.a3.detailMin}字以上`, w: 'wf', rows: 3, ph: '何人で担当するか／覚えるまでの期間／1日の流れ など', hint: `${len}（3項目の合計）・①と共通の項目です` }
      : { w: 'wf', rows: 2, ph: '入社後の流れ、何人で担当するか など', hint: `${len}（3項目の合計）・③と共通の項目です` }),
  ].join('');
}
function meritFields() {
  return fg(fld('merit.notes', '特記事項', 'textarea', { w: 'wf', rows: 4, ph: '例：お弁当の無料配布\n例：駐車場から工場まで徒歩3分\n例：夏は暑いがスポットクーラーあり\n例：重い物はクレーンで運ぶ', hint: '1行に1つ。求人原稿とヒアリングシートにそのまま載ります' }));
}
function shiftRows(i, p) {
  return `<div class="shifts"><div class="shift shift-head"><span>名称</span><span>開始</span><span class="sep"></span><span>終了</span><span>休憩(分)</span><span>休憩 開始</span><span class="sep"></span><span>休憩 終了</span><span>実働</span><span></span></div>
  ${p.shifts.map((s, j) => { const b = `positions.${i}.shifts.${j}`; ['label', 'start', 'end', 'breakMin', 'breakFrom', 'breakTo'].forEach((x, n) => LABELS[`positions.*.shifts.*.${x}`] = ['名称', '開始', '終了', '休憩(分)', '休憩開始', '休憩終了'][n]); return `<div class="shift">
    <input type="text" data-p="${b}.label" value="${esc(s.label)}" list="dl-shift" aria-label="勤務${j + 1} 名称">
    ${timeSel(`${b}.start`, s.start, `勤務${j + 1} 開始`)}<span class="sep">～</span>
    ${timeSel(`${b}.end`, s.end, `勤務${j + 1} 終了`)}
    <input type="number" data-p="${b}.breakMin" data-t="num" value="${esc(s.breakMin)}" step="5" min="0" aria-label="休憩分">
    ${timeSel(`${b}.breakFrom`, s.breakFrom, `勤務${j + 1} 休憩開始`)}<span class="sep">－</span>
    ${timeSel(`${b}.breakTo`, s.breakTo, `勤務${j + 1} 休憩終了`)}
    <span class="h" data-live="sh:${i}:${j}">${shiftH(s) != null ? fmtH(shiftH(s)) + 'H' : '—'}</span>
    <button class="x" data-act="delshift" data-i="${i}" data-j="${j}" title="この勤務時間を削除" aria-label="削除"${p.shifts.length < 2 ? ' disabled' : ''}>×</button></div>`; }).join('')}
  </div>${p.shifts.length < 4 ? `<button class="btn sm ghost" data-act="addshift" data-i="${i}" style="margin-top:6px">＋ 勤務時間を追加</button>` : ''}`;
}
function rateCalc(i) {
  const c = S.draft, p = c.positions[i]; const r = rate(p); const th = cfg().threshold;
  const msg = r == null ? '<span class="muted">請求単価と時給を入れると判定します</span>' : r * 100 <= th + 1e-9 ? `<span class="okc">${th}%以下：稟議前にRDへ発注できます</span>` : `<span class="ng">${th}%超：稟議承認後に③と同時入力</span>`;
  const margin = +p.bill && +p.pay ? `<span>粗利 <b>${yen(p.bill - p.pay)}</b>/時</span>` : '';
  return `${gaugeHTML(r)}${margin}${msg}`;
}
function formA1(c) {
  const C = cfg();
  const pos = c.positions.map((p, i) => `<div class="posbox"><header><b>職種 ${i + 1}</b><span class="spacer"></span>${c.positions.length > 1 ? `<button class="btn sm ghost" data-act="delpos" data-i="${i}">この職種を削除</button>` : ''}</header>
    ${fg(
      fld(`positions.${i}.name`, '職種・作業名', 'text', { req: true, miss: '職種', w: 'w2', ph: '例：床材の製造オペレーター' }),
      fld(`positions.${i}.shiftType`, '勤務形態', 'seg', { options: OPT.shiftType, w: 'w2' }),
      fld(`positions.${i}.headcount`, '募集人数', 'num', { unit: '名', req: true, miss: '募集人数', step: 5, min: 0 }),
      fld(`positions.${i}.sex`, '性別', 'seg', { options: OPT.sex }),
      fld(`positions.${i}.ageMin`, '年齢（下限）', 'num', { unit: '歳', step: 5, min: 0 }),
      fld(`positions.${i}.ageMax`, '年齢（上限）', 'num', { unit: '歳まで', step: 5, min: 0 }),
      fld(`positions.${i}.bill`, '請求単価', 'yen', { req: true, miss: '請求単価', step: 50, min: 0 }),
      fld(`positions.${i}.pay`, '時給（支払単価）', 'yen', { req: true, miss: '時給', step: 50, min: 0 }),
    )}
    <div class="calc" data-live="rate:${i}">${rateCalc(i)}</div>
    <div class="fg" style="margin-top:12px">${jobFields(i, p, false)}</div>
    <div class="f" style="margin-top:12px"><span class="lb">勤務時間<i class="req">必須</i></span><small>勤務形態を選ぶと欄の数がそろいます（日勤1・夜勤2・2交替3・3交替4。入社直後の日勤教育分を1つ含みます）</small>${shiftRows(i, p)}</div>
    <div class="fg" style="margin-top:12px">${fld(`positions.${i}.kotsuRule`, '交通費の支給方法', 'text', { w: 'w2', ph: '例：1km 10円' })}${fld(`positions.${i}.kotsuCap`, '交通費（上限）', 'yen', { ph: '13700' })}</div>
  </div>`).join('');
  return section('受注情報', fg(
    fld('kyoten', '拠点', 'select', { req: true, options: C.kyotens.map(k => [k.id, `${k.id}（${k.corp} ${k.office}）`]) }),
    fld('tanto', '営業担当', 'select', { req: true, options: [...new Set([...C.staff, c.tanto].filter(Boolean))] }),
    fld('juchuDate', '受注日', 'date'),
  )) + section('就業先', fg(
    fld('company.name', '取引先企業名', 'text', { req: true, w: 'w2', ph: '例：富双合成株式会社' }),
    fld('company.plant', '就業先事業所・工場名', 'text', { req: true, miss: '就業先事業所', ph: '例：久喜工場' }),
    fld('company.zip', '郵便番号', 'text', { ph: '287-0225' }),
    fld('company.address', '就業先住所', 'text', { req: true, w: 'w2' }),
    fld('company.pref', '地域（一般賃金の地域指数）', 'text', { list: 'dl-areas', ph: prefFromAddr(c.company.address) || '住所から自動', hint: '空欄なら住所の都道府県を使います' }),
    fld('company.access', '最寄り・アクセス', 'text', { w: 'w2', ph: '例：圏央道 久喜ICより車で5分' }),
  )) + section('職種と条件', pos + (c.positions.length < 4 ? `<button class="btn sm" data-act="addpos">＋ 職種を追加</button>` : ''), '1つの受注で職種や単価が複数ある場合は職種を追加します（最大4つ・稟議書の①〜④に対応）。')
    + section('勤務条件（共通）', fg(fld('work.holidays', '休日', 'text', { req: true, w: 'w3', ph: '例：土・日・祝（会社カレンダー）GW・夏季・年末年始' })))
    + section('ざっくりメリット・デメリット', meritFields(), '応募者が一番知りたい現場の実感を、箇条書きで書きます。暑さ・重さ・きれいさなどは、数字（何度・何キロ・築何年）まで書けると伝わります。')
    + section('RDへの発注内容', fg(
      fld('adOrder.note', '特記事項', 'textarea', { w: 'wf', rows: 4, ph: '例：全体で10名ぐらいの受注、11月末までに5名入れたい\n例：未経験OK・日勤スタートを強調したい\n例：60歳以上は不可', hint: '媒体はRDが決めるため、ここでは指定しません' }),
    ));
}

/* ---- ② 稟議 ---- */
function wageCalc(i) {
  const c = S.draft, p = c.positions[i]; const w = wageCheck(c, p);
  if (!p.jobCode) return '<span class="muted">職業分類（小分類コード）を選ぶと、一般賃金と比較します</span>';
  if (w.ok == null) return `<span>${esc(w.name || 'コード該当なし')}</span><span class="muted">地域「${esc(w.area || '未設定')}」の指数が見つかりません</span>`;
  return `<span>${esc(w.name)}</span><span>基準値(0年) <b>${yen(w.base)}</b> × ${esc(w.area)} ${w.idx}%</span><span>＝ <b>${yen(w.target)}</b></span><span class="${w.ok ? 'okc' : 'ng'}">時給との差 <b>${w.diff >= 0 ? '+' : ''}${Math.round(w.diff).toLocaleString()}円</b>${w.ok ? '' : '（一般賃金を下回っています）'}</span>`;
}
function formA2(c) {
  const pos = c.positions.map((p, i) => `<div class="posbox"><header><b>${i + 1}. ${esc(p.name || '（職種未入力）')}</b><span class="muted small">請求 ${yen(p.bill) || '—'} ／ 支払 ${yen(p.pay) || '—'}（①で編集）</span></header>
    ${fg(
      fld(`positions.${i}.jobCode`, '職業分類（小分類コード）', 'text', { req: true, miss: '職業分類', t: 'code', list: 'dl-jobs', ph: '例：3401 一般事務員', w: 'w2' }),
      fld(`positions.${i}.days`, '平均稼働日数', 'num', { unit: '日/月', req: true, miss: '平均稼働日数' }),
      fld(`positions.${i}.teate.0.name`, '手当① 名称', 'text'), fld(`positions.${i}.teate.0.pay`, '手当① 支給額', 'yen'), fld(`positions.${i}.teate.0.bill`, '手当① 請求額', 'yen'),
      fld(`positions.${i}.teate.1.name`, '手当② 名称', 'text'), fld(`positions.${i}.teate.1.pay`, '手当② 支給額', 'yen'), fld(`positions.${i}.teate.1.bill`, '手当② 請求額', 'yen'),
    )}
    <div class="calc" data-live="wage:${i}">${wageCalc(i)}</div></div>`).join('');
  return section('稟議の区分', fg(
    fld('ringi.torihiki', '取引状況', 'seg', { req: true, options: OPT.torihiki }),
    fld('ringi.shubetsu', '稟議種別', 'seg', { req: true, options: OPT.shubetsu, w: 'w2' }),
    fld('ringi.speed', '決済希望スピード', 'seg', { req: true, options: OPT.speed, w: 'w2', hint: '飛行機＞新幹線＞自動車の順に急ぎ' }),
    fld('ringi.keiyakuShubetsu', '契約の種別', 'seg', { req: true, options: OPT.keiyaku, w: 'w2' }),
    fld('ringi.henkei', '変形労働時間', 'seg', { options: ['有', '無'] }),
    fld('ringi.no', '稟議№', 'text'),
  )) + section('企業情報', fg(
    fld('company.tel', '電話番号', 'text', { req: true }), fld('company.fax', 'FAX', 'text'),
    fld('company.rep', '代表者名', 'text'),
    fld('company.contactDept', '窓口 部署', 'text'), fld('company.contactTitle', '窓口 役職', 'text'), fld('company.contactName', '窓口担当者', 'text', { req: true }),
    fld('company.capital', '資本金', 'text'), fld('company.listed', '区分', 'select', { options: OPT.listed }),
    fld('company.founded', '創業・設立', 'text', { ph: '例：1959年12月' }),
    fld('company.industry', '業種', 'select', { req: true, options: INDUSTRIES, w: 'w2' }),
    fld('company.products', '生産品目', 'text', { w: 'w2' }),
  )) + section('契約内容', fg(
    fld('ringi.busho', '契約部署', 'text'),
    fld('ringi.keiyakuDate', '契約（予定）日', 'date', { req: true, miss: '契約予定日' }),
    fld('ringi.kikanFrom', '契約期間（自）', 'date', { req: true }), fld('ringi.kikanTo', '契約期間（至）', 'date', { req: true }),
    fld('ringi.koshin', '契約更新', 'text', { ph: '例：2ヵ月' }),
    fld('ringi.billShime', '請求 締日', 'text', { req: true, miss: '請求締日', ph: '例：20日' }), fld('ringi.billNyukin', '入金日', 'text', { req: true, ph: '例：翌月20日' }), fld('ringi.billHitchaku', '請求必着日', 'text', { ph: '例：5営業日' }),
    fld('work.payShime', '給与 締日', 'text', { req: true, miss: '給与締日', ph: '例：末日' }), fld('work.payDay', '給与 支払日', 'text', { req: true, miss: '給与支払日', ph: '例：翌々月1日' }),
  )) + section('単価・職業分類（労使協定方式の一般賃金チェック）', pos, '一般賃金＝職業安定業務統計の基準値(0年)×地域指数。稟議書テンプレートの別添2・別添3と同じ表を使っています。')
    + section('割増率', fg(
      fld('ringi.warimashi.jikangai', '時間外', 'num', { unit: '%' }), fld('ringi.warimashi.shinya', '深夜', 'num', { unit: '%' }),
      fld('ringi.warimashi.hoteigai', '法定外休出', 'num', { unit: '%' }), fld('ringi.warimashi.hotei', '法定休出', 'num', { unit: '%' }),
      fld('ringi.warimashi.over60', '時間外60H超', 'num', { unit: '%' }),
    )) + section('所見', fg(
      fld('ringi.shoken', '現況及び起案者所見', 'textarea', { req: true, miss: '起案者所見', w: 'wf', rows: 3, ph: '例：事務女性1名の受注。求人依頼・掘起し対応いたします。' }),
      fld('ringi.biko', '備考', 'textarea', { w: 'wf', rows: 2 }),
    ));
}

/* ---- ③ 詳細・勤務説明 ---- */
function moneyCalc(i) {
  const p = S.draft.positions[i]; const m = monthly(p); const sg = suggestMonthH(p);
  return `<div class="money">${m.lines.map(l => `<span>${l.k}</span><span class="r">${yen(l.u)}</span><span class="r">× ${fmtH(l.h)}H</span><span class="r">${yen(l.amt)}</span>`).join('')}
    <span>交通費</span><span></span><span></span><span class="r">${yen(m.kotsu) || '0円'}</span>
    <span class="tot">月収例</span><span class="tot"></span><span class="tot"></span><span class="r tot">${yen(m.total)}</span></div>
    ${sg != null ? `<div class="small muted" style="margin-top:6px">稼働時間の目安：平均実働 ${fmtH(avgShiftH(p))}H × ${p.days}日 ＝ ${fmtH(sg)}H${filled(p.monthH) ? '（入力値を優先）' : '（自動）'}</div>` : ''}`;
}
function formA3(c) {
  const pos = c.positions.map((p, i) => `<div class="posbox"><header><b>${i + 1}. ${esc(p.name || '（職種未入力）')}</b><span class="muted small">時給 ${yen(p.pay) || '—'}</span></header>
    ${fg(
      fld(`positions.${i}.posture`, '作業姿勢', 'seg', { req: true, miss: '立ち・座り', options: OPT.posture, w: 'w2' }),
      fld(`positions.${i}.koyo`, '雇用期間', 'text', { ph: '長期／3ヶ月更新 など' }),
      fld(`positions.${i}.qualification`, '資格・経験', 'text', { req: true, miss: '資格・経験', w: 'w2', ph: '不要なら「不要」' }),
      jobFields(i, p, true),
      fld(`positions.${i}.shiftNote`, '勤務時間の備考', 'text', { w: 'wf', ph: '例：生産の動向により2交替・3交替が変わることがある' }),
    )}
    <div class="fs" style="padding-top:12px;border:0"><h3 style="font-size:12px">月の稼働と月収例</h3>${fg(
      fld(`positions.${i}.days`, '稼働日数', 'num', { unit: '日/月' }),
      fld(`positions.${i}.monthH`, '稼働時間', 'num', { unit: 'H/月', step: 0.5, ph: fmtH(suggestMonthH(p)) || '自動計算' }),
      fld(`positions.${i}.nightH`, '深夜時間', 'num', { unit: 'H/月', step: 0.5 }),
      fld(`positions.${i}.overtimeH`, '残業時間', 'num', { unit: 'H/月', step: 0.5 }),
      fld(`positions.${i}.normalOtH`, '通常残業', 'num', { unit: 'H/月', step: 0.5 }),
      fld(`positions.${i}.holidayH`, '休日出勤', 'num', { unit: 'H/月', step: 0.5 }),
      fld(`positions.${i}.kotsuMonthly`, '月収例に含める交通費', 'yen'),
    )}<div class="calc" data-live="money:${i}" style="display:block">${moneyCalc(i)}</div></div>
  </div>`).join('');
  return section('契約・休日', fg(
    fld('hearing.contract', '契約期間', 'seg', { options: OPT.contract }),
    fld('hearing.contractPeriod', '期間（短期の場合）', 'text'),
    fld('hearing.annualHolidays', '年間休日', 'num', { unit: '日', req: true }),
  )) + section('就業先の説明', fg(
    fld('company.description', '企業説明', 'textarea', { req: true, w: 'wf', rows: 2, ph: '例：床材・壁紙など内装材のメーカー' }),
    fld('company.access', 'アクセス', 'text', { req: true, w: 'w2', hint: '①と共通' }),
    fld('setsumei.officeTanto', '事業所担当（勤務説明書）', 'select', { options: cfg().staff, hint: '空欄なら営業担当' }),
  )) + section('職種ごとの勤務条件', pos)
    + section('福利厚生・設備', fg(
      fld('facilities.checks', 'あるもの', 'checks', { req: true, miss: '福利厚生・設備', options: OPT.facilities, w: 'wf' }),
      fld('facilities.shokudoNote', '食堂の詳細', 'text', { w: 'w2', ph: '例：1直＝440円 2直＝450円 3直＝持参' }),
      fld('facilities.otherNote', 'その他（駐車場・喫煙など）', 'text', { w: 'w2' }),
      fld('setsumei.uniform', '貸与品', 'checks', { options: OPT.uniform, w: 'wf' }),
      fld('setsumei.training', '教育訓練', 'text', { w: 'w2' }),
    )) + section('職場環境（応募率に影響大）', fg(
      fld('hearing.environment', '職場環境', 'textarea', { req: true, w: 'wf', rows: 3, ph: '例：冷暖房完備の綺麗な事務所' }),
      fld('hearing.appeal', 'アピールポイント・備考', 'textarea', { w: 'wf', rows: 2 }),
      fld('setsumei.notes', '勤務説明書に載せる注意事項', 'textarea', { w: 'wf', rows: 2, ph: '例：週払いあり（水曜午前申請→金曜振込、手数料660円）', hint: '定型の注意事項（設定画面）に加えて表示されます' }),
    ));
}

/* ---- 現場実態 ---- */
function formKG(c) {
  let cat = '';
  const rows = KENGAKU.map(([ct, k, q, h]) => {
    LABELS['kengaku.' + k] = q;
    const head = ct !== cat ? `<div class="cat">${esc(cat = ct)}</div>` : '';
    return `${head}<div class="q"><div class="ql">${esc(q)}${h ? `<small>${esc(h)}</small>` : ''}</div><input class="inp" type="text" data-p="kengaku.${k}" value="${esc(c.kengaku[k] || '')}" aria-label="${esc(q)}"><input class="inp" type="text" data-p="kengaku.${k}_n" value="${esc(c.kengaku[k + '_n'] || '')}" placeholder="補足・対策" aria-label="${esc(q)} 補足"></div>`;
  }).join('');
  return section(`現場見学・ヒアリングの記録<span class="muted" data-live="kgc">${kengakuCount(c)}/${KENGAKU.length}項目</span>`, `<div class="kg">${rows}</div>`, `③の完了には${REQ.a3.kengakuMin}項目以上が必要です。不明なら「不明」と書けば、次の見学で確認すべき点として残ります。`);
}

/* ---- 履歴・管理 ---- */
function formLog(c) {
  const hist = (c.history || []).filter(h => h.type !== 'note');
  return section('求人広告・応募シートとの紐づけ', fg(
    `<div class="f w2"><label for="adcodes">求人の案件番号（1行に1つ）</label><textarea id="adcodes" data-p-adcodes rows="3" class="inp" placeholder="698&#10;240">${esc((c.adCodes || []).join('\n'))}</textarea><small>Indeedの求人メモ先頭の番号、求人ボックスの勤務先名「plus-I-698」の番号。取り込んだ広告の求人数・表示・応募をこの案件に集計します。現在の一致：${esc(adGroupsFor(c).map(g => Object.keys(g.media)[0] + ' ' + g.name).slice(0, 6).join('、') || 'なし')}</small></div>`,
    `<div class="f w2"><label for="aliases">案件名の別名（応募シート・広告の名称、1行に1つ）</label><textarea id="aliases" data-p-aliases rows="3" class="inp" placeholder="${esc(c.company.name)}">${esc((c.aliases || []).join('\n'))}</textarea><small>拠点シートの「希望勤務先名」にこの語を含む応募を、この案件の実績として数えます。空欄なら企業名で照合。現在の一致：${statsFor(c).names.slice(0, 8).map(esc).join('、') || 'なし'}</small></div>`,
    `<div class="f wf"><span class="lb">導入前の既存案件</span><div class="checks"><label><input type="checkbox" data-p="legacy" data-bool${c.legacy ? ' checked' : ''}>旧運用（稟議・③は紙で実施済み）</label></div><small>チェックすると「稟議未上申」「③未入力」の警告を出しません。③を入力完了すると通常の案件に戻ります。</small></div>`,
  )) + section('案件の終了・削除', `<div class="row">${c.flow.closed ? `<button class="btn" data-act="reopen">募集を再開する</button>` : `<button class="btn" data-act="close">募集を終了する</button>`}<span class="spacer"></span><button class="btn danger" data-act="del">案件を削除</button></div>`)
    + section(`変更履歴<span class="muted">${hist.length}件</span>`, `<ul class="hist">${hist.map(h => `<li><div class="when">${fmtDT(h.at)} ・ ${esc(h.by)}</div><div>${h.type === 'edit' ? `<b>内容を変更</b>${h.reason ? `：${esc(h.reason)}` : ''}` : `<b>${esc(h.text)}</b>`}</div>${h.changes && h.changes.length ? `<table>${h.changes.map(x => `<tr><td>${esc(labelOf(x.p))}</td><td><del>${esc(x.from || '（空）')}</del> → <ins>${esc(x.to || '（空）')}</ins></td></tr>`).join('')}</table>` : ''}</li>`).join('') || '<li class="muted">まだありません</li>'}</ul>`);
}
