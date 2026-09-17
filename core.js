'use strict';
/* ===== 定数 ===== */
const DEFAULT_CONFIG = {
  kyotens: [
    { id: 'plus-i', corp: 'bring plus', office: '茨城', address: '', tel: '', fax: '' },
    { id: 'plus-c', corp: 'bring plus', office: '千葉', address: '', tel: '', fax: '' },
    { id: 'next', corp: 'bring next', office: '', address: '', tel: '', fax: '' },
    { id: 'up', corp: 'bring up', office: '', address: '', tel: '', fax: '' },
  ],
  staff: [],
  media: ['Airワーク', '求人BOX', 'ジョブタウン', 'ヒバライト', 'ハローワーク', 'その他'],
  approvers: [{ role: '所長', name: '' }, { role: '管理本部', name: '' }, { role: '経理', name: '' }, { role: '決済', name: '' }],
  threshold: 65, fixDays: 14, ringiDays: 3,
  fixed: {
    hitsuyo: '①免許証のコピー　②自動車の車検証のコピー　③給与振込予定の銀行通帳のコピー　④車の自賠責・任意保険証券のコピー　⑤マイナンバーのコピー（扶養者含む）　⑥雇用保険被保険者証のコピー　⑦扶養者がいる場合は、続柄が記載されている書類',
    hoken: '雇用保険は、週の所定労働時間が20時間以上あり、かつ31日以上の雇用見込みがある場合は加入とします。\n健康・厚生年金保険は、おおむね3/4（約30時間）以上の労働時間、又は雇用契約期間が2ヶ月を超える場合は加入するものとする。\n雇用契約期間が2ヶ月以内の場合、更新等2ヶ月を越えて雇用されることが確定した時点で加入します。',
    gaiyo: '株式会社bringの会社概要は、会社パンフレットに記載されているものを参照とする。',
    seido: '会社パンフレットに記載されているものを参照とする。',
    notes: [
      '無断にて遅刻、欠勤、早退がある場合は採用をお断りすることもあります。',
      '１ヶ月以内の自己都合退職の場合、作業服の返却及び諸経費として相当額を給与から差し引きます。',
      '万一、退職を希望する場合は、退職の1ヵ月前までに事業所担当者に退職願を提出して下さい。',
      '事前工場見学の際はスカートやサンダル・つけづめ・ピアス・香水などはご遠慮下さい。',
      '入社が内定した段階でキャンセルした場合作業服を買い取っていただく場合があります。',
      '連絡が取れず出勤しなくなってしまった場合、一時的に備品返却などを目的として給与を止めさせて頂く場合がございます。',
    ],
  },
};
const OPT = {
  torihiki: ['有', '無'],
  shubetsu: ['再新規', '新規', '既存', '再契約'],
  speed: ['飛行機', '新幹線', '自動車'],
  keiyaku: ['人材派遣', '有料職業紹介', '特定技能', '請負'],
  listed: ['プライム', 'スタンダード', 'グロース', '上場子会社', '未上場'],
  shiftType: ['日勤', '夜勤', '2交替', '3交替', '変則'],
  sex: ['男性', '女性', '不問'],
  posture: ['立ち作業', '座り作業', '両方'],
  contract: ['長期', '短期'],
  facilities: ['更衣室', '食堂', '休憩室', 'ロッカー', '自動販売機', '電子レンジ', '冷蔵庫', 'ポット', '駐車場', '喫煙所'],
  uniform: ['作業服上', '作業服下', '作業帽子', 'ヘルメット', '安全靴', '保護具'],
  rd: ['未着手', '作成中', '掲載中', '修正中', '停止'],
};
// 勤務形態ごとの勤務時間欄。入社直後は日勤で教育することが多いので、日勤以外は＋1欄
const SHIFT_PRESET = { '日勤': ['日勤'], '夜勤': ['日勤（教育）', '夜勤'], '2交替': ['日勤（教育）', '1直', '2直'], '3交替': ['日勤（教育）', '1直', '2直', '3直'], '変則': ['日勤（教育）', 'シフト①', 'シフト②', 'シフト③'] };
// 現場実態ヒアリング（プロテリアル金属の見学メモ様式）。作業内容・立ち座り・完成品は職種欄、暑さ・重さ・きれいさは「ざっくりメリット・デメリット」で入力するため除外
const KENGAKU = [
  ['職場の周辺環境', 'q01', '職場の周辺環境', ''],
  ['職場の周辺環境', 'q02', '工場の見た目（企業規模）', ''],
  ['職場の周辺環境', 'q04', '職場の入り方', '守衛の有無、駐車場は指定か、歩いて何分か'],
  ['職場の環境', 'q07', '一ヵ所で動かないのか、動きはあるのか', ''],
  ['職場の環境', 'q09', '教育期間、習熟期間', ''],
  ['職場の環境', 'q10', '誰に教わるのか', ''],
  ['職場の環境', 'q11', 'マンツーマンで教わるのか、少し教えて放置か', ''],
  ['職場の環境', 'q12', 'bringメンバーの人数', ''],
  ['職場の環境', 'q14', '綺麗か、汚いか（作業場）', ''],
  ['職場の環境', 'q15', '音', ''],
  ['職場の環境', 'q16', '臭い', ''],
  ['職場の環境', 'q17', '見た目', ''],
  ['職場の環境', 'q18', '男女比', ''],
  ['職場の環境', 'q19', '男女で仕事が違うのか', ''],
  ['職場の環境', 'q20', 'ライン作業かどうか', ''],
  ['職場の環境', 'q21', '早いか遅いか', ''],
  ['職場の環境', 'q23', '人間関係', ''],
  ['職場の環境', 'q24', '教育の方法', ''],
  ['職場の環境', 'q25', '交替に入るまでの日勤の期間', ''],
  ['職場の環境', 'q26', '特有の難しさ', ''],
  ['職場の環境', 'q27', '特徴', '顕微鏡酔いなど'],
  ['食堂・休憩・喫煙', 'q28', '食堂', '作っているか／支払い方法（現金・月末清算・プリカ）'],
  ['食堂・休憩・喫煙', 'q29', '食堂の込み具合、対策', ''],
  ['食堂・休憩・喫煙', 'q30', '休憩はみんなどうしているか', ''],
  ['食堂・休憩・喫煙', 'q31', '喫煙所・休憩室までの距離', ''],
  ['食堂・休憩・喫煙', 'q32', 'どのように休憩しているか', ''],
  ['食堂・休憩・喫煙', 'q33', '昼休憩は外に出られるか', ''],
  ['食堂・休憩・喫煙', 'q34', '喫煙場所（外・中）、短休憩でも喫煙できるか', ''],
  ['定着・転籍', 'q35', 'どんな理由で退職するのか', ''],
  ['定着・転籍', 'q36', '転籍実績はあるのか', ''],
  ['定着・転籍', 'q37', 'どんな人が転籍するのか', ''],
  ['定着・転籍', 'q38', '転籍者の年齢・性別', ''],
  ['制服', 'q39', '支給か（企業と同じかどうか）', ''],
  ['制服', 'q40', '長袖か半袖か、厚手か薄手か', ''],
  ['制服', 'q41', '安全靴は鉄芯かプラか', ''],
  ['制服', 'q42', 'クリーンルームの場合の服装', ''],
  ['制服', 'q43', 'クリーニングの頻度', ''],
  ['制服', 'q44', '自分で洗うのか、業者か、費用は', ''],
];
const JOB_MAP = Object.fromEntries(JOB_STATS.map(([c, n, v]) => [c, [n, v]]));
const AREA_MAP = Object.fromEntries(AREA_INDEX);

/* ===== utils ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escBr = s => esc(s).replace(/\n/g, '<br>');
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const get = (o, p) => p.split('.').reduce((a, k) => a == null ? undefined : a[k], o);
function setp(o, p, v) {
  const ks = p.split('.'); let a = o;
  for (let i = 0; i < ks.length - 1; i++) {
    if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    a = a[ks[i]];
  }
  a[ks[ks.length - 1]] = v;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowISO = () => new Date().toISOString();
const today = () => new Date().toLocaleDateString('sv-SE');
const filled = v => Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== '';
const sum = a => a.reduce((x, y) => x + (+y || 0), 0);
const yen = n => filled(n) && !isNaN(+n) ? Math.round(+n).toLocaleString('ja-JP') + '円' : '';
const num = n => filled(n) && !isNaN(+n) ? (+n).toLocaleString('ja-JP') : '';
const pct = r => r == null ? '—' : (r * 100).toFixed(1) + '%';
function dateOf(s) { if (!s) return null; const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s); return isNaN(d) ? null : d; }
function fmtD(s) { const d = dateOf(s); return d ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : ''; }
function fmtJP(s) { const d = dateOf(s); return d ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : ''; }
function fmtMD(s) { const d = dateOf(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ''; }
function fmtDT(s) { const d = dateOf(s); return d ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; }
function dayDiff(a, b) { return Math.round((dateOf(b).setHours(0, 0, 0, 0) - dateOf(a).setHours(0, 0, 0, 0)) / 864e5); }
const daysSince = s => s ? dayDiff(s, today()) : 0;
const daysUntil = s => s ? dayDiff(today(), s) : 0;
function addDays(s, n) { const d = dateOf(s) || new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }
const surname = n => String(n || '').trim().split(/[\s　]/)[0].slice(0, 3);
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
function toast(msg, tone = '') {
  const el = document.createElement('div'); el.textContent = msg; if (tone) el.className = tone;
  $('#toast').appendChild(el); setTimeout(() => el.remove(), 3200);
}
const norm = s => String(s || '').normalize('NFKC').replace(/株式会社|有限会社|\(株\)|\(有\)|[\s　]/g, '').replace(/ケ/g, 'ヶ').toLowerCase();

/* ===== 状態 ===== */
const S = {
  cases: {}, postings: {}, ads: {}, config: clone(DEFAULT_CONFIG), stats: null,
  me: lsGet('bring-me') || '',
  loaded: false, mode: 'init', error: '',
  draft: null, draftId: null, base: null, dirty: false, kept: {}, reason: '',
  filters: { kyoten: '', tanto: '', stage: '', q: '' }, pk: '', open: null,
  pendingRender: false, ai: {},
};
const cfg = () => S.config;
const kyotenOf = id => cfg().kyotens.find(k => k.id === id) || { id, corp: '', office: '', address: '', tel: '', fax: '' };

/* ===== ストア（Supabase の anken_docs テーブル。1行＝1ドキュメント） ===== */
function describeError(e) {
  const msg = String((e && e.message) || e);
  if (/Failed to fetch|NetworkError|ERR_NAME_NOT_RESOLVED|Load failed/i.test(msg)) {
    return 'Supabaseに接続できません。プロジェクトが一時停止している可能性があります（無料プランは一定期間アクセスがないと自動で停止します）。Supabaseのダッシュボードで再開ボタン（日本語表示では「履歴書プロジェクト」と誤訳されています）を押し、数分後に「再接続」を押してください。';
  }
  const m = msg.match(/Supabase error (\d{3})/);
  if (m) {
    const code = m[1];
    if (code === '401' || code === '403') return `Supabaseに接続を拒否されました（${code}）。config.js のキーか setup.sql のポリシーを確認してください。`;
    if (code === '404') return 'anken_docsテーブルが見つかりません（404）。Supabaseの SQL Editor で setup.sql を実行してください。';
    if (code === '413') return '一度に送るデータが大きすぎます（413）。';
    if (code.charAt(0) === '5') return `Supabase側でエラーが起きています（${code}）。少し待ってからやり直してください。`;
    return `Supabaseがエラーを返しました（${code}）。`;
  }
  return msg;
}
const Store = {
  ver: {},
  async req(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Supabase error ${res.status}: ${t}`); }
    if (res.status === 204) return null;
    const t = await res.text(); return t ? JSON.parse(t) : null;
  },
  async start() {
    if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL || typeof SUPABASE_KEY === 'undefined' || !SUPABASE_KEY) {
      S.mode = 'off'; S.error = 'config.js にSupabaseの接続先が設定されていません。'; S.loaded = true; onData(); return;
    }
    try { await this.pull(); S.mode = 'db'; S.error = ''; } catch (e) { console.error(e); S.mode = 'off'; S.error = describeError(e); }
    S.loaded = true; onData();
    setInterval(() => { if (!document.hidden) this.refresh(); }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
  },
  // 他の人の変更を取り込む。失敗したら画面上部に理由を出す
  async refresh() {
    try {
      const changed = await this.pull();
      if (S.mode !== 'db') { S.mode = 'db'; S.error = ''; onData(); } else if (changed) onData();
    } catch (e) { console.error(e); if (S.mode !== 'off' || S.error !== describeError(e)) { S.mode = 'off'; S.error = describeError(e); onData(); } }
  },
  async listVersions() {
    const PAGE = 1000, rows = [];
    for (let from = 0; ; from += PAGE) {
      let page;
      try { page = await this.req('anken_docs?select=coll,id,updated_at&order=coll,id', { headers: { 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` } }); }
      catch (e) { if (String(e.message).includes('416')) break; throw e; }
      rows.push(...(page || [])); if (!page || page.length < PAGE) break;
    }
    return rows;
  },
  // 更新日時が変わった行だけ本文を読み直す。変化があれば true
  async pull() {
    const list = await this.listVersions();
    const seen = new Set(); const need = {};
    list.forEach(r => { const k = r.coll + '/' + r.id; seen.add(k); if (this.ver[k] !== r.updated_at) (need[r.coll] = need[r.coll] || []).push(r.id); });
    const gone = Object.keys(this.ver).filter(k => !seen.has(k));
    for (const [coll, ids] of Object.entries(need)) {
      for (let i = 0; i < ids.length; i += 50) {
        const part = ids.slice(i, i + 50).map(x => '"' + String(x).replace(/"/g, '\\"') + '"').join(',');
        const rows = await this.req(`anken_docs?select=coll,id,data,updated_at&coll=eq.${encodeURIComponent(coll)}&id=in.(${encodeURIComponent(part)})`);
        (rows || []).forEach(r => { this.apply(r.coll, r.id, r.data); this.ver[r.coll + '/' + r.id] = r.updated_at; });
      }
    }
    gone.forEach(k => { const [coll, ...rest] = k.split('/'); this.remove(coll, rest.join('/')); delete this.ver[k]; });
    return Object.keys(need).length > 0 || gone.length > 0;
  },
  apply(coll, id, data) {
    if (coll === 'config') { if (id === 'main') S.config = mergeConfig(data); }
    else if (coll === 'stats') { if (id === 'applicants') S.stats = data; }
    else if (S[coll]) S[coll][id] = data;
  },
  remove(coll, id) {
    if (coll === 'config') { if (id === 'main') S.config = mergeConfig(null); }
    else if (coll === 'stats') { if (id === 'applicants') S.stats = null; }
    else if (S[coll]) delete S[coll][id];
  },
  async put(coll, id, data) {
    const at = new Date().toISOString();
    try {
      const rows = await this.req('anken_docs?on_conflict=coll,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify([{ coll, id, data, updated_at: at, updated_by: S.me || null }]) });
      const r = (rows || [])[0];
      this.apply(coll, id, data); this.ver[coll + '/' + id] = r ? r.updated_at : at;
      if (S.mode !== 'db') { S.mode = 'db'; S.error = ''; }
      onData();
    } catch (e) { console.error(e); toast('保存できませんでした：' + describeError(e), 'warn'); throw e; }
  },
  async del(coll, id) {
    try {
      await this.req(`anken_docs?coll=eq.${encodeURIComponent(coll)}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      this.remove(coll, id); delete this.ver[coll + '/' + id]; onData();
    } catch (e) { console.error(e); toast('削除できませんでした：' + describeError(e), 'warn'); throw e; }
  },
};
// ブラウザ標準のダウンロード
function saveFile(filename, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function mergeConfig(c) {
  const d = clone(DEFAULT_CONFIG);
  if (!c) return d;
  return { ...d, ...clone(c), fixed: { ...d.fixed, ...(c.fixed || {}) } };
}

/* ===== 案件モデル ===== */
function newShift(label = '日勤') { return { label, start: '', end: '', breakMin: 60, breakFrom: '', breakTo: '', noteOn: false, note: '' }; }
function newPosition() {
  return {
    name: '', shiftType: '日勤', headcount: 1, sex: '不問', ageMin: 18, ageMax: '', bill: '', pay: '', product: '', task: '', detail: '',
    qualification: '', posture: '', koyo: '長期', jobCode: '',
    teate: [{ name: '', pay: '', bill: '' }, { name: '', pay: '', bill: '' }],
    kotsuRule: '', kotsuCap: 13700, kotsuMonthly: '',
    days: '', monthH: '', nightH: '', overtimeH: '', normalOtH: '', holidayH: '', shiftNote: '',
    shifts: [newShift()],
  };
}
function newCase() {
  return {
    id: uid(), createdAt: '', updatedAt: '', createdBy: '', updatedBy: '',
    kyoten: '', tanto: S.me, juchuDate: today(), legacy: false,
    company: { name: '', plant: '', zip: '', address: '', pref: '', access: '', tel: '', fax: '', rep: '', contactDept: '', contactTitle: '', contactName: '', capital: '', listed: '', founded: '', industry: '', products: '', description: '' },
    positions: [newPosition()],
    work: { holidays: '', payShime: '', payDay: '' },
    adOrder: { media: [], note: '' },
    ringi: { torihiki: '', shubetsu: '', speed: '', keiyakuShubetsu: '人材派遣', henkei: '無', no: '', applicant: '', busho: '', keiyakuDate: '', kikanFrom: '', kikanTo: '', koshin: '', billShime: '', billNyukin: '', billHitchaku: '', warimashi: { jikangai: 125, shinya: 125, hoteigai: 125, hotei: 135, over60: 150 }, shoken: '', biko: '' },
    hearing: { contract: '長期', contractPeriod: '', annualHolidays: '', environment: '', appeal: '' },
    facilities: { checks: [], shokudoNote: '', otherNote: '' },
    setsumei: { officeTanto: '', uniform: [], training: 'キャリア形成支援に基づくe-ラーニング制度', notes: '' },
    kengaku: {},
    merit: { notes: '' },
    aliases: [], adCodes: [],
    market: { wage: '', note: '' },
    flow: { area1: { done: false, at: '', by: '' }, ringi: { state: '未上申', submittedAt: '', decidedAt: '', approvals: {}, changedAfterApproval: false }, area3: { done: false, at: '', by: '' }, rd: { state: '未着手', tanto: '' }, closed: false },
    jobAd: { text: '', at: '', by: '' },
    aiReview: null, pendingRd: false, history: [],
  };
}
// 古い・欠けたデータを現在の形に揃える
function normalizeCase(c) {
  const d = newCase(); const out = { ...d, ...c };
  for (const k of ['company', 'work', 'adOrder', 'ringi', 'hearing', 'facilities', 'setsumei', 'market', 'jobAd']) out[k] = { ...d[k], ...(c[k] || {}) };
  out.ringi.warimashi = { ...d.ringi.warimashi, ...((c.ringi || {}).warimashi || {}) };
  out.flow = { ...d.flow, ...(c.flow || {}) };
  for (const k of ['area1', 'ringi', 'area3', 'rd']) out.flow[k] = { ...d.flow[k], ...((c.flow || {})[k] || {}) };
  out.positions = (c.positions && c.positions.length ? c.positions : [newPosition()]).map(p => {
    const np = { ...newPosition(), ...p };
    np.shifts = (p.shifts && p.shifts.length ? p.shifts : [newShift()]).map(s => ({ ...newShift(), ...s }));
    np.teate = [0, 1].map(i => ({ name: '', pay: '', bill: '', ...((p.teate || [])[i] || {}) }));
    return np;
  });
  out.kengaku = { ...(c.kengaku || {}) };
  const om = c.merit || {}; const kg = out.kengaku;
  out.merit = { notes: om.notes || '' };
  if (!c.merit && kg.q05 && out.positions.every(p => !p.product)) out.positions.forEach(p => { p.product = kg.q05; });
  if (!out.merit.notes) {
    // 旧データ（暑さ・重さ・きれいさ・お弁当・駐車場・現場実態の該当項目）を特記事項にまとめる
    const j = k => [kg[k], kg[k + '_n']].filter(Boolean).join('／');
    const un = (v, pre, post) => filled(v) ? `${pre}${v}${post}` : '';
    out.merit.notes = [
      [om.temp, un(om.tempC, '（約', '℃）'), om.tempNote || j('q13')].filter(Boolean).join(''),
      [om.weight, un(om.weightKg, '（約', 'kg）'), om.weightNote || j('q22')].filter(Boolean).join(''),
      [om.clean, un(om.age, '（築', '年）'), om.cleanNote || j('q03')].filter(Boolean).join(''),
      om.bento === '無料配布あり' ? 'お弁当の無料配布あり' : '',
      om.parking ? `駐車場から工場まで${om.parking}${un(om.parkingMin, '（約', '分）')}${om.parkingNote || ''}` : '',
    ].filter(Boolean).join('\n');
  }
  out.aliases = c.aliases || []; out.adCodes = c.adCodes || []; out.history = c.history || [];
  return out;
}
const caseName = c => [c.company.name, c.company.plant].filter(Boolean).join(' ') || '（名称未入力）';
// 仕事内容＝完成品・用途＋作業内容＋補足
function detailText(p) {
  const parts = [p.product && `【完成品・用途】${p.product}`, p.task && `【作業内容】${p.task}`, p.detail].filter(x => String(x || '').trim());
  return parts.length === 1 && !p.product && !p.task ? String(p.detail) : parts.join('\n');
}
const detailLen = p => [p.product, p.task, p.detail].map(x => String(x || '').trim()).join('').length;
function shiftNotes(p) {
  return (p.shifts || []).filter(s => s.note && String(s.note).trim()).map(s => `${s.label ? s.label + '：' : ''}${String(s.note).trim()}`);
}
function allShiftNotes(p) { return [p.shiftNote, ...shiftNotes(p)].filter(x => x && String(x).trim()).join('　'); }
function meritLines(c) {
  return String((c.merit || {}).notes || '').split('\n').map(x => x.trim()).filter(Boolean);
}
// 勤務形態に合わせて勤務時間欄の数と名称をそろえる（入力済みの欄は消さない）
function syncShifts(p) {
  const want = SHIFT_PRESET[p.shiftType]; if (!want) return;
  const empty = s => !s.start && !s.end;
  while (p.shifts.length < want.length) p.shifts.push(newShift(want[p.shifts.length]));
  while (p.shifts.length > want.length && empty(p.shifts[p.shifts.length - 1])) p.shifts.pop();
  p.shifts.forEach((s, i) => { if (empty(s) && want[i]) s.label = want[i]; });
}

/* ===== 計算 ===== */
function tm(s) { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
const fmtTime = s => { const v = tm(s); return v == null ? '' : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
function shiftH(s) { const a = tm(s.start), b = tm(s.end); if (a == null || b == null) return null; let d = b - a; if (d <= 0) d += 1440; return Math.max(0, d - (+s.breakMin || 0)) / 60; }
const fmtH = h => h == null ? '' : (Math.round(h * 100) / 100).toString();
function avgShiftH(p) { const hs = p.shifts.map(shiftH).filter(x => x != null); return hs.length ? sum(hs) / hs.length : null; }
function suggestMonthH(p) { const a = avgShiftH(p); return a != null && +p.days ? Math.round(a * p.days * 100) / 100 : null; }
function monthHours(p) { return filled(p.monthH) ? +p.monthH : suggestMonthH(p); }
function monthly(p) {
  const pay = +p.pay || 0, H = monthHours(p) || 0;
  const lines = [['基本給', pay, H], ['通常残業', pay, +p.normalOtH || 0], ['深夜割増', pay * 0.25, +p.nightH || 0], ['残業', pay * 1.25, +p.overtimeH || 0], ['休日出勤', pay * 1.25, +p.holidayH || 0]]
    .map(([k, u, h]) => ({ k, u, h, amt: Math.round(u * h) }));
  const kotsu = +p.kotsuMonthly || 0;
  return { lines, kotsu, total: sum(lines.map(l => l.amt)) + kotsu };
}
const rate = p => (+p.bill > 0 && +p.pay > 0) ? (+p.pay) / (+p.bill) : null;
function gate(c) {
  const rs = c.positions.map(rate);
  if (rs.some(r => r == null)) return { state: 'unknown', max: null };
  const max = Math.max(...rs);
  return { state: max * 100 <= cfg().threshold + 1e-9 ? 'fast' : 'strict', max };
}
function prefFromAddr(a) {
  const m = String(a || '').replace(/^〒?\s*\d{3}-?\d{4}\s*/, '').match(/^(北海道|東京都|京都府|大阪府|.{2,3}?県)/);
  if (!m) return ''; return m[1] === '北海道' ? m[1] : m[1].replace(/[都府県]$/, '');
}
function wageCheck(c, p) {
  const j = JOB_MAP[p.jobCode]; const area = c.company.pref || prefFromAddr(c.company.address); const idx = AREA_MAP[area];
  if (!j || idx == null) return { name: j ? j[0] : '', area, ok: null };
  const target = j[1] * idx / 100;
  return { name: j[0], base: j[1], idx, area, target, diff: (+p.pay || 0) - target, ok: (+p.pay || 0) >= Math.round(target) };
}
const kengakuCount = c => KENGAKU.filter(q => filled(c.kengaku[q[1]])).length;

/* ===== 入力チェック（エリア別） ===== */
const REQ = {
  a1: {
    title: '① 簡易求人',
    c: [['kyoten', '拠点'], ['tanto', '営業担当'], ['company.name', '取引先企業名'], ['company.plant', '就業先事業所'], ['company.address', '就業先住所'], ['work.holidays', '休日']],
    p: [['name', '職種'], ['headcount', '募集人数'], ['bill', '請求単価'], ['pay', '時給'], ['product', '完成品・用途'], ['task', '作業内容']], shifts: true,
  },
  a2: {
    title: '② 稟議',
    c: [['ringi.torihiki', '取引状況'], ['ringi.shubetsu', '稟議種別'], ['ringi.speed', '決済希望スピード'], ['ringi.keiyakuShubetsu', '契約の種別'], ['company.tel', '電話番号'], ['company.contactName', '窓口担当者'], ['company.industry', '業種'], ['ringi.keiyakuDate', '契約予定日'], ['ringi.kikanFrom', '契約期間（自）'], ['ringi.kikanTo', '契約期間（至）'], ['ringi.billShime', '請求締日'], ['ringi.billNyukin', '入金日'], ['work.payShime', '給与締日'], ['work.payDay', '給与支払日'], ['ringi.shoken', '起案者所見']],
    p: [['jobCode', '職業分類'], ['shiftType', '勤務形態'], ['days', '平均稼働日数']],
  },
  a3: {
    title: '③ 詳細',
    c: [['hearing.annualHolidays', '年間休日'], ['company.description', '企業説明'], ['company.access', 'アクセス'], ['hearing.environment', '職場環境'], ['facilities.checks', '福利厚生・設備']],
    p: [['posture', '立ち・座り'], ['qualification', '資格・経験'], ['monthH', '月間稼働時間', p => monthHours(p) != null]],
    detailMin: 40, kengakuMin: 10,
  },
};
function check(c, a) {
  const r = REQ[a]; const miss = []; let total = 0;
  r.c.forEach(([p, l]) => { total++; if (!filled(get(c, p))) miss.push(l); });
  c.positions.forEach((pos, i) => {
    const tag = c.positions.length > 1 ? `（職種${i + 1}）` : '';
    r.p.forEach(([p, l, fn]) => { total++; if (fn ? !fn(pos) : !filled(pos[p])) miss.push(l + tag); });
    if (r.shifts) { total++; if (!pos.shifts.some(s => s.start && s.end)) miss.push('勤務時間' + tag); }
    if (r.detailMin) { total++; if (detailLen(pos) < r.detailMin) miss.push(`仕事内容${r.detailMin}字以上` + tag); }
  });
  if (r.kengakuMin) { total++; const n = kengakuCount(c); if (n < r.kengakuMin) miss.push(`現場実態${r.kengakuMin}項目以上（${n}）`); }
  return { total, done: total - miss.length, miss, ok: miss.length === 0 };
}
const missSet = (c, a) => new Set(check(c, a).miss);

/* ===== 進捗・アラート ===== */
function steps(c) {
  const f = c.flow, g = gate(c), rs = f.ringi.state;
  return [
    { k: '受注', st: 'done' },
    { k: '① 簡易求人', st: f.area1.done ? 'done' : (g.state === 'strict' && rs !== '承認') ? 'locked' : 'todo' },
    { k: '② 稟議上申', st: rs === '未上申' ? 'todo' : rs === '差戻し' ? 'back' : 'done' },
    { k: '承認', st: rs === '承認' ? 'done' : rs === '上申中' ? 'wait' : 'todo' },
    { k: '③ 詳細', st: f.area3.done ? 'done' : rs === '承認' ? 'todo' : 'locked' },
  ];
}
function stage(c) {
  const f = c.flow, rs = f.ringi.state;
  if (f.closed) return { k: 'closed', label: '終了', tone: '' };
  if (c.legacy && !(rs === '承認' && f.area3.done)) return { k: 'legacy', label: '導入前の既存案件', tone: '' };
  if (rs === '承認' && f.area3.done) return { k: 'open', label: '募集中', tone: 'ok' };
  if (rs === '承認') return { k: 'need3', label: '③入力待ち', tone: 'crit' };
  if (rs === '上申中') return { k: 'review', label: f.area1.done ? '決裁待ち（募集先行）' : '決裁待ち', tone: 'info' };
  if (rs === '差戻し') return { k: 'back', label: '稟議差戻し', tone: 'warn' };
  if (f.area1.done) return { k: 'pre', label: '募集先行・稟議未上申', tone: 'warn' };
  return { k: 'new', label: '受注登録', tone: '' };
}
const STAGES = [['new', '受注登録'], ['pre', '募集先行・稟議未上申'], ['review', '決裁待ち'], ['back', '稟議差戻し'], ['need3', '③入力待ち'], ['open', '募集中'], ['legacy', '導入前の既存案件'], ['closed', '終了']];
const interviewOK = c => c.flow.area3.done;
const postingsOf = id => Object.values(S.postings).filter(p => p.caseId === id);
function alertsFor(c) {
  const a = [], f = c.flow, C = cfg();
  if (f.closed) return a;
  if (!c.legacy) {
    if (f.area1.done && f.ringi.state === '未上申') { const d = daysSince(f.area1.at); a.push({ tone: d >= C.ringiDays ? 'crit' : 'warn', text: `簡易求人の発注から${d}日、稟議が未上申` }); }
    if (f.ringi.state === '差戻し') a.push({ tone: 'warn', text: '稟議が差し戻されています。修正して再上申してください' });
    if (f.ringi.state === '上申中') { const d = daysSince(f.ringi.submittedAt); if (d >= C.ringiDays) a.push({ tone: 'warn', text: `上申から${d}日、決裁が止まっています` }); }
    if (f.ringi.state === '承認' && !f.area3.done) a.push({ tone: 'crit', text: '③詳細が未入力のため、面接・進捗報告は停止中' });
  }
  if (f.ringi.changedAfterApproval) a.push({ tone: 'warn', text: '承認後に単価・条件が変更されています（再稟議を検討）' });
  if (c.pendingRd) a.push({ tone: 'info', text: 'RDが未確認の変更があります' });
  postingsOf(c.id).forEach(p => {
    if (p.status === '停止' || !p.nextFix) return;
    const d = daysUntil(p.nextFix);
    if (d < 0) a.push({ tone: 'warn', text: `${p.media}の求人修正日を${-d}日超過` });
    else if (d <= 3) a.push({ tone: 'info', text: `${p.media}の求人修正日まであと${d}日` });
  });
  return a;
}
const TONE_ORDER = { crit: 0, warn: 1, info: 2, '': 3 };

/* ===== 応募実績（応募シート集計との突合） ===== */
function aliasesOf(c) { return (c.aliases && c.aliases.length ? c.aliases : [c.company.name]).map(norm).filter(Boolean); }
function recentMonths(n = 3) { const m = (S.stats && S.stats.months) || []; return m.slice(-n); }
function statsFor(c) {
  const out = { total: 0, recent: 0, ageNG: 0, interviewed: 0, proposed: 0, kengaku: 0, nyusha: 0, byMedia: {}, byMonth: {}, names: [] };
  if (!S.stats) return out;
  const al = aliasesOf(c); if (!al.length) return out;
  const rec = new Set(recentMonths());
  for (const [name, e] of Object.entries(S.stats.byName || {})) {
    if (!al.some(x => norm(name).includes(x))) continue;
    out.names.push(name);
    for (const k of ['total', 'ageNG', 'interviewed', 'proposed', 'kengaku', 'nyusha']) out[k] += e[k] || 0;
    for (const [m, v] of Object.entries(e.byMedia || {})) out.byMedia[m] = (out.byMedia[m] || 0) + v;
    for (const [m, v] of Object.entries(e.byMonth || {})) { out.byMonth[m] = (out.byMonth[m] || 0) + v; if (rec.has(m)) out.recent += v; }
  }
  return out;
}
function unregisteredNames() {
  if (!S.stats) return [];
  const all = Object.values(S.cases).flatMap(aliasesOf);
  const rec = new Set(recentMonths());
  return Object.entries(S.stats.byName || {})
    .filter(([n]) => !all.some(x => norm(n).includes(x)))
    .map(([n, e]) => ({ name: n, kyoten: e.kyoten, total: e.total, recent: sum(Object.entries(e.byMonth || {}).filter(([m]) => rec.has(m)).map(([, v]) => v)), nyusha: e.nyusha }))
    .filter(x => x.recent > 0).sort((a, b) => b.recent - a.recent);
}

/* ===== 変更差分（履歴・RD通知用） ===== */
const META_KEYS = ['history', 'flow', 'updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'aiReview', 'pendingRd', 'jobAd', 'id'];
function flat(o, pre = '', out = {}) {
  if (Array.isArray(o)) {
    if (o.length && typeof o[0] === 'object') o.forEach((x, i) => flat(x, pre + '.' + i, out));
    else out[pre] = o.join('、');
  } else if (o && typeof o === 'object') { for (const k in o) flat(o[k], pre ? pre + '.' + k : k, out); }
  else out[pre] = o ?? '';
  return out;
}
function diffCase(a, b) {
  const strip = o => { const x = { ...o }; META_KEYS.forEach(k => delete x[k]); return x; };
  const fa = flat(strip(a)), fb = flat(strip(b)); const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]); const ch = [];
  keys.forEach(k => { if (String(fa[k] ?? '') !== String(fb[k] ?? '')) ch.push({ p: k, from: String(fa[k] ?? ''), to: String(fb[k] ?? '') }); });
  return ch;
}
const LABELS = {};
function labelOf(p) {
  let pre = '';
  const q = p.replace(/^positions\.(\d+)\./, (m, i) => { pre = `職種${+i + 1} `; return 'positions.*.'; })
    .replace(/shifts\.(\d+)\./, (m, i) => { pre += `勤務時間${+i + 1} `; return 'shifts.*.'; })
    .replace(/teate\.(\d+)\./, (m, i) => { pre += `手当${+i + 1} `; return 'teate.*.'; });
  const kg = p.match(/^kengaku\.(q\d+)(_n)?$/); if (kg) { const q2 = KENGAKU.find(x => x[1] === kg[1]); return '現場実態：' + (q2 ? q2[2] : kg[1]) + (kg[2] ? '（補足）' : ''); }
  return pre + (LABELS[q] || p);
}
const isRingiRel = p => /^positions\.\d+\.(bill|pay|teate)/.test(p) || /^ringi\./.test(p);
const isRdRel = p => !/^(ringi\.|company\.(tel|fax|rep|contact|capital|listed|founded|industry)|aliases|adCodes|market|legacy|kyoten|tanto|juchuDate)/.test(p) && !/\.(bill|jobCode|teate)/.test(p);
// 自分が変えたフィールドだけを最新データに重ねる（同時編集の上書き防止）
function mergeChanges(latest, base, draft) {
  const next = clone(latest); const changes = diffCase(base, draft); const done = new Set();
  for (const ch of changes) {
    const segs = ch.p.split('.'); const ai = segs.findIndex((s, i) => /^\d+$/.test(s) && i > 0);
    const path = ai > 0 ? segs.slice(0, ai).join('.') : ch.p;
    if (done.has(path)) continue; done.add(path);
    setp(next, path, clone(get(draft, path)));
  }
  return { next, changes };
}
