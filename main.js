'use strict';
/* ===== ルーティング・描画 ===== */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  const [view, id, tab] = h.split('/');
  return { view: view || 'cases', id: id ? decodeURIComponent(id) : '', tab: tab || '' };
}
function isCaseRoute(r) { return r.view === 'case' || r.view === 'new'; }
function keepDraftIfLeaving(r) {
  if (!S.draftId) return;
  const same = (r.view === 'new' && S.draftId === 'new') || (r.view === 'case' && r.id === S.draftId);
  if (same) return;
  if (S.dirty) S.kept[S.draftId] = { draft: S.draft, base: S.base };
  S.draftId = null; S.draft = null; S.base = null; S.dirty = false; S.reason = '';
}
function render() {
  const r = parseRoute(); keepDraftIfLeaving(r);
  const nav = r.view === 'case' || r.view === 'doc' ? 'cases' : r.view === 'ads' ? 'postings' : r.view;
  $$('[data-nav]').forEach(a => a.dataset.nav === nav ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  const v = $('#view');
  if (!S.loaded) { v.innerHTML = '<div class="empty">データを読み込んでいます…</div>'; return; }
  const y = window.scrollY;
  let html;
  switch (r.view) {
    case 'case': case 'new': html = viewCase(r); break;
    case 'doc': html = viewDoc(r); break;
    case 'postings': html = viewPostings(); break;
    case 'ads': html = viewAds(); break;
    case 'settings': html = viewSettings(); break;
    default: html = viewList();
  }
  v.innerHTML = html;
  const cb = $('#connbar'); if (cb) { cb.hidden = S.mode !== 'off'; cb.innerHTML = S.mode === 'off' ? `<span>${esc(S.error)}</span><button class="btn sm" data-act="retry">再接続</button>` : ''; }
  if (S._keepScroll) { window.scrollTo(0, y); S._keepScroll = false; }
  renderSavebar(); renderMe();
}
function rerender() { S._keepScroll = true; render(); }
function isTyping() { const a = document.activeElement; return a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName); }
function onData() {
  $('#sync').className = 'sync ' + (S.mode === 'db' ? 'on' : S.mode === 'off' ? 'local' : '');
  $('#sync').textContent = S.mode === 'db' ? '共有中' : S.mode === 'off' ? '接続できません' : '接続中';
  const cb = $('#connbar'); if (cb) { cb.hidden = S.mode !== 'off'; cb.innerHTML = S.mode === 'off' ? `<span>${esc(S.error)}</span><button class="btn sm" data-act="retry">再接続</button>` : ''; }
  fillLists();
  const r = parseRoute();
  if (isCaseRoute(r) && S.dirty) { refreshFlow(); return; }
  if (isTyping()) { S.pendingRender = true; return; }
  rerender();
}
document.addEventListener('focusout', () => setTimeout(() => { if (S.pendingRender && !isTyping()) { S.pendingRender = false; rerender(); } }, 150));
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

let _lists = '';
function fillLists() {
  if (_lists) return; _lists = '1';
  $('#dl-areas').innerHTML = AREA_INDEX.map(([n]) => `<option value="${esc(n)}">`).join('');
  $('#dl-jobs').innerHTML = JOB_STATS.map(([c, n]) => `<option value="${c} ${esc(n)}">`).join('');
}
function renderMe() {
  const sel = $('#me'); const opts = [...new Set([...cfg().staff, S.me].filter(Boolean))];
  const html = `<option value="">選択…</option>${opts.map(s => `<option${s === S.me ? ' selected' : ''}>${esc(s)}</option>`).join('')}<option value="__other">その他（名前を入力）</option>`;
  if (sel.innerHTML !== html) sel.innerHTML = html;
}

/* ===== 入力中の即時反映 ===== */
function refreshFlow() {
  const r = parseRoute(); if (!isCaseRoute(r) || !S.draft) return;
  const stored = r.view === 'new' ? null : S.cases[S.draft.id] ? normalizeCase(S.cases[S.draft.id]) : null;
  const fl = $('[data-live="flow"]'); if (fl) fl.innerHTML = flowPanel(S.draft, stored);
  const isNew = r.view === 'new'; const tab = TABS.some(t => t[0] === r.tab) ? r.tab : 'a1';
  const tb = $('[data-live="tabs"]'); if (tb) tb.innerHTML = tabsHTML(S.draft, tab, t => isNew ? `#/new/_/${t}` : `#/case/${S.draft.id}/${t}`);
}
function refreshLive() {
  $$('[data-live]').forEach(el => {
    const [k, a, b] = el.dataset.live.split(':');
    if (k === 'rate') el.innerHTML = rateCalc(+a);
    else if (k === 'wage') el.innerHTML = wageCalc(+a);
    else if (k === 'money') el.innerHTML = moneyCalc(+a);
    else if (k === 'sh') { const s = S.draft.positions[+a].shifts[+b]; el.textContent = s && shiftH(s) != null ? fmtH(shiftH(s)) + 'H' : '—'; }
    else if (k === 'len') el.textContent = detailLen(S.draft.positions[+a]) + '字';
    else if (k === 'kgc') el.textContent = `${kengakuCount(S.draft)}/${KENGAKU.length}項目`;
  });
  refreshFlow(); renderSavebar();
  const h1 = $('.casehead h1'); if (h1 && parseRoute().view === 'new') h1.innerHTML = `${esc(S.draft.company.name || '新しい案件')}${S.draft.company.plant ? `<small>${esc(S.draft.company.plant)}</small>` : ''}`;
}
function needsReason() {
  if (!S.draftId || S.draftId === 'new') return false;
  const c = S.cases[S.draftId]; if (!c) return false; const f = normalizeCase(c).flow;
  return f.area1.done || f.ringi.state !== '未上申';
}
function renderSavebar() {
  const bar = $('#savebar'); const r = parseRoute();
  if (!isCaseRoute(r) || !S.dirty) { bar.hidden = true; return; }
  const nr = needsReason();
  if (bar.hidden || bar.dataset.nr !== String(nr)) {
    bar.dataset.nr = String(nr);
    bar.innerHTML = `<span>${S.draftId === 'new' ? '新しい案件は未保存です' : '未保存の変更があります'}</span>${nr ? `<input type="text" id="reason" placeholder="変更理由（既存案件の変更は必須）" value="${esc(S.reason)}" aria-label="変更理由">` : ''}<button class="btn sm" data-act="discard">取り消す</button><button class="btn sm primary" data-act="save">${S.draftId === 'new' ? '受注登録する' : '保存する'}</button>`;
  }
  bar.hidden = false;
}
function markDirty() { S.dirty = true; }

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'reason') { S.reason = t.value; return; }
  if (t.dataset.adf === 'q') { S.adf.q = t.value; clearTimeout(S._aq); S._aq = setTimeout(() => { rerender(); const q = $('[data-adf="q"]'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); return; }
  if (t.dataset.filter === 'q') { S.filters.q = t.value; clearTimeout(S._qt); S._qt = setTimeout(() => { rerender(); const q = $('[data-filter="q"]'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); return; }
  if (t.dataset.p !== undefined && S.draft && t.type !== 'checkbox' && t.type !== 'radio' && t.tagName !== 'SELECT') applyInput(t);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'me') {
    let v = t.value;
    if (v === '__other') { const box = document.createElement('input'); box.className = 'inp'; box.placeholder = '名前'; box.style.width = '110px'; t.replaceWith(box); box.focus(); box.addEventListener('change', () => { S.me = box.value.trim(); lsSet('bring-me', S.me); box.replaceWith(t); renderMe(); rerender(); }); return; }
    S.me = v; lsSet('bring-me', v); rerender(); return;
  }
  if (t.dataset.filter && t.dataset.filter !== 'q') { S.filters[t.dataset.filter] = t.value; rerender(); return; }
  if (t.id === 'adsin' && t.files.length) { loadAdFiles([...t.files]).catch(e => { console.error(e); impState().busy = ''; toast('読み込めませんでした', 'warn'); rerender(); }); return; }
  if (t.dataset.impk !== undefined) { const I = impState(); I.files[+t.dataset.impk].kyoten = t.value; I.v++; rerender(); return; }
  if (t.hasAttribute('data-p-adcodes') && S.draft) { S.draft.adCodes = t.value.split(/[\n,、\s]+/).map(codeNorm).filter(Boolean); markDirty(); refreshLive(); return; }
  if (t.closest('tr[data-gk]')) return;
  if (t.id === 'csvin' && t.files[0]) { importCsv(t.files[0]).catch(() => toast('取り込めませんでした', 'warn')); return; }
  if (t.hasAttribute('data-p-aliases') && S.draft) { S.draft.aliases = t.value.split('\n').map(s => s.trim()).filter(Boolean); markDirty(); refreshLive(); return; }
  if (t.dataset.tp && S.draft) {
    const box = t.closest('.tsel'); const hs = box.querySelector('[data-part="h"]'), ms = box.querySelector('[data-part="m"]');
    let v = '';
    if (hs.value !== '') { if (ms.value === '') ms.value = '0'; v = `${String(hs.value).padStart(2, '0')}:${String(ms.value).padStart(2, '0')}`; }
    setp(S.draft, t.dataset.tp, v); markDirty(); refreshLive(); return;
  }
  if (t.dataset.p !== undefined && S.draft && (t.type === 'checkbox' || t.type === 'radio' || t.tagName === 'SELECT')) { applyInput(t); return; }
  if (t.dataset.p !== undefined && S.draft) { applyInput(t); return; }
  const tr = t.closest('tr[data-post]'); if (tr && t.dataset.k) { updatePosting(tr.dataset.post, t.dataset.k, t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value); return; }
  if (t.dataset.case && t.dataset.ck) { const v = t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value; mutate(t.dataset.case, c => setp(c, t.dataset.ck, v), null, true); }
});
function applyInput(t) {
  const p = t.dataset.p; let v;
  if (t.type === 'checkbox' && t.hasAttribute('data-bool')) v = t.checked;
  else if (t.type === 'checkbox') v = $$(`input[data-p="${p}"]:checked`).map(x => x.value);
  else if (t.type === 'radio') { if (!t.checked) return; v = t.value; }
  else v = t.value;
  if (t.dataset.t === 'num') v = v === '' ? '' : Number(v);
  if (t.dataset.t === 'code') { const m = String(v).match(/^\s*(\d{3,4})/); v = m ? m[1] : String(v).trim(); }
  setp(S.draft, p, v);
  markDirty();
  const st = p.match(/^positions\.(\d+)\.shiftType$/);
  if (st) { syncShifts(S.draft.positions[+st[1]]); rerender(); return; }
  refreshLive();
  const f = t.closest('.f'); if (f && f.classList.contains('miss') && filled(v)) f.classList.remove('miss');
}

/* ===== 操作 ===== */
function needMe() { if (!S.me) { toast('右上の「入力者」で自分の名前を選んでください', 'warn'); $('#me').focus(); return true; } return false; }
async function mutate(id, fn, text, silent) {
  if (!silent && needMe()) return;
  await Store.pull().catch(() => { });
  const c = normalizeCase(clone(S.cases[id])); fn(c);
  c.updatedAt = nowISO(); c.updatedBy = S.me || c.updatedBy;
  if (text) c.history = [{ at: c.updatedAt, by: S.me, type: 'action', text }, ...(c.history || [])].slice(0, 120);
  await Store.put('cases', id, c);
  if (S.draftId === id && !S.dirty) { S.draft = normalizeCase(clone(c)); S.base = normalizeCase(clone(c)); }
}
async function saveDraft() {
  if (needMe()) return;
  const isNew = S.draftId === 'new'; const d = S.draft;
  if (!isNew) await Store.pull().catch(() => { });
  if (!isNew && needsReason() && !S.reason.trim()) { toast('既存案件の変更です。変更理由を入力してください', 'warn'); const r = $('#reason'); if (r) r.focus(); return; }
  let next, changes = [];
  if (isNew) {
    next = clone(d); next.createdAt = next.updatedAt = nowISO(); next.createdBy = next.updatedBy = S.me;
    next.history = [{ at: next.createdAt, by: S.me, type: 'action', text: '受注登録' }];
    if (!next.ringi.applicant) next.ringi.applicant = next.tanto;
  } else {
    const latest = normalizeCase(S.cases[d.id]);
    ({ next, changes } = mergeChanges(latest, S.base, d));
    if (!changes.length) { S.dirty = false; delete S.kept[d.id]; rerender(); return; }
    next.updatedAt = nowISO(); next.updatedBy = S.me;
    if (latest.flow.area1.done && changes.some(ch => isRdRel(ch.p))) next.pendingRd = true;
    if (latest.flow.ringi.state === '承認' && changes.some(ch => isRingiRel(ch.p))) next.flow.ringi.changedAfterApproval = true;
    next.history = [{ at: next.updatedAt, by: S.me, type: 'edit', reason: S.reason.trim(), changes: changes.slice(0, 40) }, ...(latest.history || [])].slice(0, 120);
  }
  try { await Store.put('cases', next.id, next); } catch { return; }
  delete S.kept[isNew ? 'new' : next.id];
  S.dirty = false; S.reason = ''; S.draft = normalizeCase(clone(next)); S.base = normalizeCase(clone(next)); S.draftId = next.id;
  $('#savebar').hidden = true;
  toast(isNew ? '受注登録しました' : '保存しました');
  if (isNew) location.hash = `#/case/${next.id}/${parseRoute().tab || 'a1'}`; else rerender();
}
const curId = () => parseRoute().id;
const ACT = {
  save: saveDraft,
  discard() { const id = S.draftId; delete S.kept[id]; S.dirty = false; S.reason = ''; S.draftId = null; if (id === 'new') { location.hash = '#/cases'; return; } rerender(); toast('変更を取り消しました'); },
  fk(b) { S.filters.kyoten = b.dataset.v; rerender(); },
  pk(b) { S.pk = b.dataset.v; rerender(); },
  addpos() { S.draft.positions.push(newPosition()); markDirty(); rerender(); },
  delpos(b) { S.draft.positions.splice(+b.dataset.i, 1); markDirty(); rerender(); },
  addshift(b) { const p = S.draft.positions[+b.dataset.i]; p.shifts.push(newShift(['日勤', '夜勤', '1直', '2直', '3直'][p.shifts.length] || '')); markDirty(); rerender(); },
  delshift(b) { S.draft.positions[+b.dataset.i].shifts.splice(+b.dataset.j, 1); markDirty(); rerender(); },
  async order1() { const id = curId(); await mutate(id, c => { c.flow.area1 = { done: true, at: nowISO(), by: S.me }; }, '①簡易求人をRDへ発注（稟議前・原価率' + pct(gate(normalizeCase(S.cases[id])).max) + '）'); toast('RDへ発注しました'); rerender(); },
  async submit() { const id = curId(); const re = normalizeCase(S.cases[id]).flow.ringi.state === '差戻し'; await mutate(id, c => { c.flow.ringi = { ...c.flow.ringi, state: '上申中', submittedAt: nowISO(), approvals: {}, changedAfterApproval: false }; if (!c.ringi.applicant) c.ringi.applicant = S.me; }, re ? '②稟議を再上申' : '②稟議を上申'); toast('稟議を上申しました'); rerender(); },
  async approve(b) {
    const id = curId(); const role = b.dataset.role; const comment = ($('#apcomment') || {}).value || '';
    await mutate(id, c => {
      c.flow.ringi.approvals[role] = { ok: true, by: S.me, at: nowISO(), comment };
      if (cfg().approvers.every(a => c.flow.ringi.approvals[a.role] && c.flow.ringi.approvals[a.role].ok)) { c.flow.ringi.state = '承認'; c.flow.ringi.decidedAt = nowISO(); }
    }, `${role}が承認`);
    toast(`${role}として承認しました`); rerender();
  },
  async reject() {
    const id = curId(); const comment = (($('#apcomment') || {}).value || '').trim();
    if (!comment) { toast('差戻しの理由をコメントに書いてください', 'warn'); $('#apcomment').focus(); return; }
    const role = cfg().approvers.find(a => a.name && a.name === S.me)?.role || '承認者';
    await mutate(id, c => { c.flow.ringi.approvals[role] = { ok: false, by: S.me, at: nowISO(), comment }; c.flow.ringi.state = '差戻し'; }, `稟議を差戻し：${comment}`);
    toast('差し戻しました'); rerender();
  },
  async done3() { const id = curId(); await mutate(id, c => { const t = nowISO(); c.flow.area3 = { done: true, at: t, by: S.me }; if (!c.flow.area1.done) c.flow.area1 = { done: true, at: t, by: S.me }; c.legacy = false; }, '③詳細を入力完了（面接・進捗報告を開始）'); toast('③を完了しました。面接・進捗報告を始められます'); rerender(); },
  async rdack(b) { const id = b.dataset.id || curId(); await mutate(id, c => { c.pendingRd = false; }, 'RDが変更内容を確認'); rerender(); },
  async note() { const t = ($('#notein').value || '').trim(); if (!t) return; const id = curId(); if (needMe()) return; await mutate(id, c => { c.history = [{ at: nowISO(), by: S.me, type: 'note', text: t }, ...(c.history || [])].slice(0, 120); }, null); rerender(); },
  async close() { await mutate(curId(), c => { c.flow.closed = true; }, '募集を終了'); rerender(); },
  async reopen() { await mutate(curId(), c => { c.flow.closed = false; }, '募集を再開'); rerender(); },
  async del(b) {
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'もう一度押すと削除します（掲載も削除）'; setTimeout(() => { if (b.isConnected) { b.dataset.confirm = ''; b.textContent = '案件を削除'; } }, 5000); return; }
    const id = curId(); for (const p of postingsOf(id)) await Store.del('postings', p.id);
    await Store.del('cases', id); S.dirty = false; S.draftId = null; delete S.kept[id]; toast('削除しました'); location.hash = '#/cases';
  },
  doctype(b) { location.hash = `#/doc/${curId()}/${b.dataset.v}`; },
  print() { try { window.print(); } catch { toast('この表示では印刷できません。Excelで保存してから印刷してください', 'warn'); } },
  xlsx() { exportXlsx(normalizeCase(S.cases[curId()]), parseRoute().tab || 'ringi'); },
  aiad() { if (!needMe()) aiJobAd(curId()); },
  openp(b, e) { if (e.target.closest('a,button,input,select')) return; S.open = S.open === b.dataset.id ? null : b.dataset.id; rerender(); },
  async addpost(b) { const id = uid(); await Store.put('postings', id, { id, caseId: b.dataset.id, media: cfg().media[0] || '', count: 1, url: '', start: today(), nextFix: addDays(today(), cfg().fixDays), lastFix: today(), status: '掲載中', imp: '', click: '', apply: '', updatedAt: nowISO(), updatedBy: S.me }); },
  async fixed(b) { const p = S.postings[b.dataset.id]; await Store.put('postings', p.id, { ...p, lastFix: today(), nextFix: addDays(today(), cfg().fixDays), updatedAt: nowISO(), updatedBy: S.me }); toast(`次回修正日を${fmtMD(addDays(today(), cfg().fixDays))}にしました`); },
  async delpost(b) { await Store.del('postings', b.dataset.id); },
  aireview(b) { if (!needMe()) aiReview(b.dataset.id); },
  savecfg: saveConfig, backup,
  async retry(b) { b.disabled = true; b.textContent = '接続しています…'; await Store.refresh(); rerender(); },
  impdrop(b) { const I = impState(); I.files.splice(+b.dataset.i, 1); I.v++; rerender(); },
  impsave: () => impSave(),
  kbnamesave: () => kbNameSave(),
  kbai() { if (!needMe()) kbAI(); },
  adsort(b) { S.adf.sort = b.dataset.v; rerender(); },
  adm(b) {
    const v = b.dataset.v; const inTable = !!b.closest('.seg-f');
    if (!inTable && !AD_MEDIA.includes(v)) { toast(`${v}は手入力の掲載です。下の「台帳の案件」で案件ごとの件数を見られます`); return; }
    S.adf.media = inTable ? v : (S.adf.media === v ? '' : v); rerender();
    if (!inTable) { const el = $('#sites'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); }
  },
};
async function updatePosting(id, k, v) { const p = S.postings[id]; if (!p) return; await Store.put('postings', id, { ...p, [k]: v, updatedAt: nowISO(), updatedBy: S.me }); }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) { const fn = ACT[b.dataset.act]; if (fn) { Promise.resolve(fn(b, e)).catch(err => { console.error(err); }); } return; }
  const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a')) location.hash = tr.dataset.href;
});

/* ===== 起動 ===== */
renderMe(); render(); Store.start();
