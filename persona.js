'use strict';
/* ペルソナ（2000件）の読み込みと、案件に合う人の見つけ方。
 *
 * もとは「求人作成ペルソナ一覧表カテゴリ分け済み2000.xlsx」。
 * personas.json は表から作ったものなので、手で編集しないこと。表を更新したら作り直す：
 *   node tools/make-personas.js <ペルソナ一覧表.xlsx> .
 *
 * 2000件を人が探すのは無理なので、やることは3つ。
 *   1. 案件データと「重視ポイント」を照らして、合う順に並べる
 *   2. プルダウン（タイプ・年代・家族区分・希望の働き方）で絞る
 *   3. 言葉で探す（人物像名・仕事選びの希望・不安・決め手から探す）
 * ファイルが重い（圧縮後で約200KB）ので、求人作成の画面を開いたときだけ読む。
 */

let PERSONAS = null;        /* 読み込んだデータ。{cols, opts, rows} */
let personaErr = '';        /* 読めなかったときの理由 */
let personaReq = null;      /* 二重に読みにいかないための約束 */
let PI = {};                /* 列の位置。cols の並びに合わせて引く */

function loadPersonas() {
  if (PERSONAS) return Promise.resolve(PERSONAS);
  if (personaReq) return personaReq;
  const v = typeof APP_VERSION === 'string' ? APP_VERSION : Date.now();
  personaReq = fetch('personas.json?v=' + v)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => {
      PERSONAS = j;
      PI = {};
      j.cols.forEach((k, i) => { PI[k] = i; });
      personaErr = '';
      return j;
    })
    .catch(e => { personaErr = String(e.message || e); PERSONAS = null; return null; })
    .then(x => { personaReq = null; rerender(); return x; });
  return personaReq;
}

const pval = (row, key) => row[PI[key]];

/* 案件データのうち、ペルソナの「重視ポイント」と照らせるものを取り出す。
   使う言葉は一覧表の重視ポイントとそろえてある。
   返すのは Map（ポイント名 → なぜそう言えるか）。
   理由を画面に出して、機械の判定を人が確かめられるようにしている */
/* 見学メモは「不明」「未確認」「ー」と書かれていることがある。
   中身が書かれていないので、満たしていることの根拠には使わない */
function kgYes(v) {
  const s = String(v || '').trim();
  if (!s) return false;
  return !/^(不明|未確認|未記入|未定|わからない|わかりません|なし|無|特になし|[-ー―—－?？])$/.test(s);
}

function caseFacts(c) {
  const F = new Map();
  const add = (k, why) => { if (!F.has(k)) F.set(k, why); };
  const ps = c.positions || [];
  const kg = c.kengaku || {};
  /* 自由記述はまとめて見る。どこに書かれていても拾えるように */
  const txt = [
    (c.merit || {}).notes,
    (c.facilities || {}).otherNote,
    (c.hearing || {}).environment,
    (c.adOrder || {}).note,
    ((c.facilities || {}).checks || []).join(' '),
    ps.map(p => [p.task, p.detail, p.qualification, p.product].join(' ')).join(' '),
  ].filter(Boolean).join(' ');

  /* 収入：一般賃金より高い、または時給1,400円以上 */
  for (const p of ps) {
    const w = typeof wageCheck === 'function' ? wageCheck(c, p) : null;
    if (w && w.ok != null && w.diff >= 0) { add('収入', '一般賃金より' + Math.round(w.diff) + '円高い'); break; }
    if (+p.pay >= 1400) { add('収入', '時給' + (+p.pay).toLocaleString() + '円'); break; }
  }
  if (ps.some(p => filled(p.overtimeH) && +p.overtimeH <= 10)) add('勤務時間・残業少なめ', '残業が月10時間以下');
  if (/土日/.test((c.work || {}).holidays || '')) add('土日休み・休日', '土日休み');
  if (+((c.hearing || {}).annualHolidays) >= 120) add('休みの取りやすさ', '年間休日' + c.hearing.annualHolidays + '日');
  if (/寮|社宅|住ま|家具|家電|借り上げ/.test(txt)) add('寮・住まい', '寮や住まいの案内がある');
  if (/送迎|駐車場|マイカー|自転車|バイク/.test(txt)) add('通勤のしやすさ', '送迎や駐車場がある');
  if (ps.some(p => p.posture === '座り作業') || /軽作業|軽い|手のひら|負担が少な/.test(txt)) add('軽作業・体への負担', '体の負担が軽い');
  if (ps.some(p => /不要|なし|未経験/.test(p.qualification || ''))) add('未経験・ブランク歓迎', '資格が要らない');
  if (/資格|取得|スキル|免許|講習/.test(txt)) add('資格・スキルアップ', '資格や講習がある');
  if (/外国籍|技能実習|特定技能|やさしい日本語|ベトナム|インドネシア|ネパール/.test(txt)) add('外国語・生活サポート', '外国籍の受け入れがある');
  if (/日払い|週払い|前払い|即日/.test(txt)) add('すぐ働ける・日払い', '日払い・週払いがある');
  /* 転籍の実績は見学メモのq36。「無」と書かれているときは数えない */
  const tenseki = String(kg.q36 || '');
  if (kgYes(tenseki) && !/^(無|なし)/.test(tenseki) && /有|あり|実績|名|人/.test(tenseki)) {
    add('長期安定・正社員登用', '転籍実績：' + tenseki.slice(0, 20));
  } else if (/転籍|正社員登用|直接雇用/.test(txt)) {
    add('長期安定・正社員登用', '転籍・直接雇用の記載がある');
  }
  /* 人間関係は見学メモのq23。悪く書かれているときは数えない */
  const ningen = String(kg.q23 || '');
  if (kgYes(ningen) && !/悪|きつ|厳し|冷た|殺伐/.test(ningen)) add('職場の雰囲気・人間関係', '見学メモ：' + ningen.slice(0, 20));
  /* 派遣なので社会保険は必ず入る */
  add('社会保険', '派遣の社会保険あり');
  return F;
}

/* 案件の勤務形態から、どの働き方なら合うかを決める */
function caseWork(c) {
  const t = (c.positions || []).map(p => p.shiftType).filter(Boolean);
  if (!t.length) return { dayOnly: false, night: false };
  return { dayOnly: t.every(x => x === '日勤'), night: t.some(x => x !== '日勤') };
}

/* 年齢が案件の条件から外れている人は、はじめから外す */
function ageOK(c, age) {
  const ps = (c.positions || []).filter(p => filled(p.ageMin) || filled(p.ageMax));
  if (!ps.length || !age) return true;
  return ps.some(p => (!filled(p.ageMin) || age >= +p.ageMin) && (!filled(p.ageMax) || age <= +p.ageMax));
}

/* 1人ぶんの点数。合う重視ポイント1つにつき2点、働き方が合えば3点、ちがえば-4点。
   点のつけ方そのものより、「なぜその順なのか」が画面で見えることを優先している */
function scorePersona(row, facts, work) {
  const pts = pval(row, 'pts') || [];
  const hit = pts.filter(x => facts.has(x));
  const miss = pts.filter(x => !facts.has(x));
  const w = pval(row, 'work');
  let fit = '', bonus = 0;
  if (w === '日勤フルタイム・安定重視') {
    if (work.dayOnly) { fit = '合う'; bonus = 3; } else if (work.night) { fit = '合わない'; bonus = -4; }
  } else if (w === '夜勤・残業でしっかり稼ぐ') {
    if (work.night) { fit = '合う'; bonus = 3; } else if (work.dayOnly) { fit = '合わない'; bonus = -4; }
  } else if (w === '短時間・週2〜4日・扶養内' || w === '期間限定・短期集中') {
    /* フルタイムの製造案件とは合いにくい。ただし断定はできないので軽めに引く */
    fit = '要確認'; bonus = -2;
  }
  return { score: hit.length * 2 + bonus, hit, miss, fit };
}

/* 絞り込みと並び替え。画面にそのまま出せる形で返す */
function personaList(c, f, sortByFit) {
  if (!PERSONAS) return { rows: [], total: 0, hidden: 0, facts: new Map() };
  /* 「保育園 送り」のように空白で区切って複数指定できる。全部に当てはまる人だけ残す */
  const qs = String(f.q || '').toLowerCase().split(/[\s　]+/).filter(Boolean);
  const SEARCH = ['name', 'hope', 'fear', 'win', 'job', 'home', 'hobby'];
  const facts = c ? caseFacts(c) : new Map();
  const work = c ? caseWork(c) : { dayOnly: false, night: false };
  let rows = PERSONAS.rows.filter(r =>
    (!f.type || pval(r, 'type') === f.type || pval(r, 'sub') === f.type) &&
    (!f.gen || pval(r, 'gen') === f.gen) &&
    (!f.fam || pval(r, 'fam') === f.fam) &&
    (!f.work || pval(r, 'work') === f.work) &&
    (!qs.length || (x => qs.every(w => x.includes(w)))(SEARCH.map(k => String(pval(r, k))).join(' ').toLowerCase())));
  const total = rows.length;
  /* 年齢が合わない人は、案件を選んでいるときだけ外す */
  if (c) rows = rows.filter(r => ageOK(c, +pval(r, 'age')));
  const scored = rows.map(r => ({ row: r, ...(c ? scorePersona(r, facts, work) : { score: 0, hit: [], miss: [], fit: '' }) }));
  if (c && sortByFit) scored.sort((a, b) => b.score - a.score || String(pval(a.row, 'id')).localeCompare(String(pval(b.row, 'id'))));
  return { rows: scored, total, hidden: total - rows.length, facts };
}

const personaById = id => (PERSONAS ? PERSONAS.rows.find(r => pval(r, 'id') === id) : null);

/* プロンプトに入れる「誰に向けて書くか」。
   いちばん効くのは「応募前の不安」と「応募の決め手」なので、そこは指示の形で書く */
function personaPrompt(row, note) {
  if (!row) {
    return '特定の層にしぼらない' + (note ? '\n' + note : '') + '\n'
      + '読む人が検索しているときの気持ち、迷う理由、決め手になるものを想像して書いてください。';
  }
  const g = k => pval(row, k) || '';
  const line = (label, v) => (v ? '- ' + label + '：' + v : '');
  const body = [
    line('いまの状況', [g('job'), g('stat')].filter(Boolean).join('／')),
    line('家族', [g('fam'), g('home')].filter(Boolean).join('／')),
    line('子ども', g('child') === 'なし' ? '' : g('child')),
    line('国籍', g('nat') === '日本' ? '' : g('nat')),
    line('趣味', g('hobby')),
    line('希望の働き方', g('work')),
    line('応募を考えたきっかけ', g('trig')),
    line('仕事選びの希望', g('hope')),
    line('応募前の不安', g('fear')),
    line('応募の決め手', g('win')),
    line('重視すること', (g('pts') || []).join('、')),
  ].filter(Boolean).join('\n');
  return g('id') + ' ' + g('name') + '（' + g('age') + '歳・' + g('sex') + '・' + g('gen') + '）\n'
    + body + (note ? '\n- 補足：' + note : '') + '\n\n'
    + 'この人ひとりに向けて書いてください。たくさんの人に当てはまる書き方にしないこと。\n'
    + '- 「応募前の不安」は、原稿の中で先回りして消すこと。不安をあおる書き方はしない\n'
    + '- 「応募の決め手」にあたることが案件データにあるなら、必ず原稿に入れること\n'
    + '- 「仕事選びの希望」に直接こたえる一文を、求人内容のはじめのほうに置くこと';
}

/* ===== 画面 ===== */

const PERSONA_SHOW = 12;   /* 一度に出す候補の数 */

/* 選んだ人の中身。これを見て「この人で書く」と決められるだけの情報を出す */
function personaDetail(row, L) {
  const g = k => pval(row, k) || '';
  const pts = g('pts') || [];
  const hit = pts.filter(x => L.facts.has(x));
  const miss = pts.filter(x => !L.facts.has(x));
  const li = (label, v) => (v ? `<div><b>${esc(label)}</b>　${esc(v)}</div>` : '');
  return `<div style="border:2px solid var(--accent);border-radius:10px;padding:14px 16px;margin-bottom:14px;background:var(--accent-soft)">
    <div class="row" style="margin-bottom:8px"><b style="font-size:16px">${esc(g('id'))}　${esc(g('name'))}</b>
      <span class="spacer"></span><button class="btn sm ghost" data-act="awpclear">選び直す</button></div>
    <div style="font-size:14px;line-height:1.9">
      ${li('', [g('age') + '歳', g('sex'), g('fam'), g('child') === 'なし' ? '' : '末子' + g('child'), g('nat') === '日本' ? '' : g('nat')].filter(Boolean).join('／'))}
      ${li('いま', [g('job'), g('home')].filter(Boolean).join('／'))}
      ${li('希望', g('hope'))}
      ${li('不安', g('fear'))}
      ${li('決め手', g('win'))}
      ${hit.length ? `<div><b>この案件で満たせる</b>　${hit.map(x => esc(x + '（' + L.facts.get(x) + '）')).join('、')}</div>` : ''}
      ${miss.length ? `<div style="color:var(--warn)"><b>満たせない</b>　${miss.map(esc).join('、')}　※案件データに無いだけの場合もあります</div>` : ''}
    </div>
  </div>`;
}

/* 2番のパネルの中身。選択中の人・絞り込み・候補の一覧 */
function personaPanel(c, A) {
  if (!PERSONAS) {
    return personaErr
      ? `<div class="banner warn">ペルソナ一覧を読み込めませんでした（${esc(personaErr)}）。選ばなくても原稿は作れます。</div>`
      : '<p class="small muted">ペルソナ一覧を読み込んでいます…</p>';
  }
  const f = A.pf || (A.pf = { type: '', gen: '', fam: '', work: '', q: '' });
  const byFit = !!c && A.psort !== 'id';
  const L = personaList(c, f, byFit);
  const cur = A.pid ? personaById(A.pid) : null;
  const O = PERSONAS.opts;
  const sel = (key, label, opts) => `<div class="f"><label for="aw-pf-${key}">${esc(label)}</label>
    <select class="inp" id="aw-pf-${key}"><option value="">すべて</option>${opts.map(o =>
      `<option value="${esc(o)}"${f[key] === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;

  const show = A.pshow || PERSONA_SHOW;
  const cards = L.rows.slice(0, show).map(x => {
    const r = x.row, id = pval(r, 'id');
    const why = [x.hit.length ? '合う：' + x.hit.join('・') : '', x.fit ? '働き方：' + x.fit : ''].filter(Boolean).join('　');
    return `<label class="aim${A.pid === id ? ' on' : ''}"><input type="radio" name="aw-pid" value="${esc(id)}"${A.pid === id ? ' checked' : ''}>
      <b>${esc(pval(r, 'name'))}</b>
      <span>${esc([pval(r, 'age') + '歳', pval(r, 'sex'), pval(r, 'fam'), pval(r, 'type')].join('／'))}</span>
      ${why ? `<span style="color:var(--ink-2)">${esc(why)}</span>` : ''}</label>`;
  }).join('');

  return `${cur ? personaDetail(cur, L) : ''}
    <div class="fg">
      ${sel('type', 'ペルソナタイプ', O.type)}
      ${sel('gen', '年代', O.gen)}
      ${sel('fam', '家族区分', O.fam)}
      ${sel('work', '希望の働き方', O.work)}
    </div>
    <div class="f" style="margin:8px 0 12px"><label for="aw-pf-q">言葉で探す</label>
      <input class="inp" id="aw-pf-q" data-pq value="${esc(f.q || '')}" placeholder="例：送迎　保育園　寮　ブランク">
      <small>人物像名・仕事選びの希望・不安・決め手・いまの職種から探します</small></div>
    <div class="row" style="margin-bottom:10px">
      <span class="small muted">候補 ${L.rows.length.toLocaleString()}人${L.hidden ? `（年齢が条件に合わない${L.hidden}人を除いた）` : ''}</span>
      <span class="spacer"></span>
      ${c ? `<button class="btn sm${byFit ? ' primary' : ''}" data-act="awpsort" data-v="fit">この案件に合う順</button>
        <button class="btn sm${byFit ? '' : ' primary'}" data-act="awpsort" data-v="id">番号順</button>` : '<span class="small muted">案件を選ぶと、合う順に並びます</span>'}
    </div>
    ${L.rows.length ? `<div class="aims">${cards}</div>` : '<p class="small muted">条件に合う人がいません。絞り込みをゆるめてください。</p>'}
    ${L.rows.length > show ? `<button class="btn sm ghost" style="margin-top:10px" data-act="awpmore">あと${Math.min(24, L.rows.length - show)}人を見る（残り${(L.rows.length - show).toLocaleString()}人）</button>` : ''}`;
}
