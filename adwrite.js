/* 求人作成（プロンプトを組み立てる画面）
 *
 * 普段やっていること：ペルソナと方向性を決める → AIに投げる → 出た原稿をエアワークに貼る。
 * このうち「AIに投げる文章を書く」ところを自動にする。
 *
 * 案件には、手で打ち直していた情報がすでに入っている。
 * 条件・勤務時間・仕事内容だけでなく、見学メモ・エリア相場・過去の広告実績・課題まで。
 * これを全部プロンプトに入れるので、ゼロから書くより材料が濃い。
 *
 * AIに直接つなぐ作りにはしていない。画面からAIを呼ぶにはAPIキーを置いたサーバーが要るうえ、
 * どのAIを使うかは現場で変わるため。ここではプロンプトを作ってコピーするところまでやる。
 */

const PERSONA_AGES = ['10代', '20代', '30代', '40代', '50代', '60代以上', '年代は問わない'];
const PERSONA_SEX = ['男性', '女性', '男女問わず'];
const PERSONA_ATTR = ['独身', '既婚', '問わない'];

/* 方向性ごとに、AIへの指示を変える。ここが原稿の性格を決める */
const AIMS = {
  ctr: {
    label: 'クリック率を上げたい',
    hint: '一覧で目に留まることを優先します',
    order: `タイトルとキャッチコピーに全力を注いでください。
- タイトルは検索結果の一覧で他社と並びます。最初の15文字で「自分向けだ」と思わせること
- 時給・勤務時間・休日のうち、この案件でいちばん強い数字をタイトルに入れる
- 抽象的な褒め言葉（アットホーム、やりがい）は使わない。数字と事実で引く
- キャッチコピーは本文を読む理由を作る。タイトルの繰り返しにしない`,
  },
  apply: {
    label: '応募数を増やしたい',
    hint: 'クリックしたあと離脱させないことを優先します',
    order: `クリックした人を離脱させないことを優先してください。
- 応募をためらう理由（未経験、ブランク、体力、年齢）を先回りして消す
- 仕事内容は1日の流れが想像できるように。覚えることの少なさ、教えてもらえる体制を具体的に
- 見学メモにある現場の事実を使う。「誰に教わるか」「習熟期間」は特に効く
- 悪い条件を隠さない。隠すと面接で辞退になる。ただし必ず対策とセットで書く`,
  },
  match: {
    label: 'ミスマッチを減らしたい',
    hint: '合わない応募を減らすことを優先します',
    order: `合わない人が応募してこないようにしてください。
- 年齢・性別・体力・資格の条件は、ぼかさずはっきり書く
- きつい点（立ち仕事、重量物、夜勤、繁忙期の残業）を最初のほうに正直に書く
- そのうえで、それでも続いている人がいる理由を事実で添える
- 応募数が減ってもかまいません。面接に来る人の質を上げることが目的です`,
  },
  repost: {
    label: '新着化（書き直し）',
    hint: '同じ求人を別の切り口で書き直します',
    order: `同じ仕事を、前回とは別の切り口で書き直してください。
- 前回の原稿（下に添付）と、同じ言い回し・同じ構成にしないこと
- 推す条件を変える。前回が時給中心なら、今回は休日や職場の人間関係など
- 嘘にならない範囲で、光を当てる場所を変えるのが目的です
- タイトルの書き出しは前回と必ず変える`,
  },
};

/* 媒体ごとの決まりごと。字数はエアワーク／求人ボックスの入力欄に合わせる */
const MEDIA = {
  'Airワーク': { titleMax: 30, catchMax: 30,
    note: '- タイトルは【派遣社員】で始める' },
  '求人BOX': { titleMax: 40, catchMax: 30,
    note: '- 検索で使われる言葉（職種名・地名・こだわり条件）をタイトルに入れる' },
};

/* 実際に編集するのはこの5つだけ。給与や勤務時間は媒体側の入力欄で設定するので原稿には書かせない */
const AW_FIELDS = [
  { key: 'title', label: 'タイトル', max: m => m.titleMax },
  { key: 'catch', label: '求人キャッチコピー', max: m => m.catchMax },
  { key: 'body', label: '求人内容', max: () => 0, len: o => o.lenBody },
  { key: 'want', label: '求める人材', max: () => 0, len: o => o.lenWant },
  { key: 'env', label: '職場環境', max: () => 0 },
];

/* 書き方のオプション。媒体やペルソナでは決まらない「見た目の好み」をここで選ぶ */
const DECOS = {
  none: { label: '指定しない', hint: 'AIにまかせます', order: '' },
  emoji: {
    label: '絵文字を中心に', hint: 'スマホの一覧で目を引きます',
    order: `- 絵文字を積極的に使ってください。見出しや箇条書きの先頭に置きます
- ただし1行に2つまで。並べすぎると読みにくくなります
- 仕事内容・条件に関係する絵文字を選ぶこと（意味のない飾りは入れない）`,
  },
  mark: {
    label: '記号を中心に', hint: '固くなりすぎず、読みやすく整います',
    order: `- 絵文字は使わないでください
- 代わりに記号（■ ◆ ▼ ／ ｜ ★）で区切り、項目の頭に置いて整理します
- 箇条書きは「・」でそろえること`,
  },
};

/* 同じ拠点で実際にクリック率が高かったタイトル。成績の裏づけがある手本として渡す */
function topTitles(c, n = 6) {
  const rows = adDocs().filter(d => d.media === 'Indeed' && d.kyoten === c.kyoten)
    .flatMap(d => d.groups || [])
    .filter(g => g.title && g.imp >= 80)
    .map(g => ({ title: g.title, imp: g.imp, ctr: g.click / g.imp }))
    .sort((a, b) => b.ctr - a.ctr);
  const seen = new Set();
  return rows.filter(r => { const k = r.title.slice(0, 20); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, n);
}

const awState = () => (S.aw = S.aw || {
  caseId: '', age: '', sex: '', attr: '', note: '', aim: 'ctr', media: 'Airワーク', draft: '',
  deco: 'none', narrow: false, lenOn: false, lenBody: 700, lenWant: 300,
});

/* プロンプトに入れる案件情報。JSONのままだと人が確認できないので、読める日本語にする */
function briefText(c) {
  const L = [];
  const put = (k, v) => { if (v !== '' && v != null && !(Array.isArray(v) && !v.length)) L.push(`${k}：${v}`); };
  put('案件名', caseName(c));
  put('拠点', c.kyoten);
  put('就業先の住所', c.company.address);
  put('アクセス', c.company.access);
  put('企業の説明', c.company.description);

  c.positions.forEach((p, i) => {
    const n = c.positions.length > 1 ? `（${i + 1}）` : '';
    L.push('');
    L.push(`■ 職種${n}`);
    put('  職種', p.name);
    put('  勤務形態', p.shiftType);
    put('  時給', p.pay ? `${(+p.pay).toLocaleString()}円` : '');
    const w = wageCheck(c, p);
    if (w && w.ok != null) put('  一般賃金との差', `${Math.round(w.diff) >= 0 ? '+' : ''}${Math.round(w.diff)}円`);
    const m = monthly(p);
    put('  月収例', m.total ? `${m.total.toLocaleString()}円` : '');
    put('  勤務時間', p.shifts.filter(s => s.start).map(s => `${s.label} ${shiftText(s)}（休憩${s.breakMin}分）`).join(' / '));
    put('  残業', p.overtimeH ? `月${p.overtimeH}時間ほど` : '');
    put('  仕事内容', detailText(p));
    put('  作業姿勢', p.posture);
    put('  必要な資格', p.qualification);
    put('  年齢', (p.ageMin || p.ageMax) ? `${p.ageMin || ''}〜${p.ageMax || '上限なし'}` : '');
    put('  募集人数', p.headcount);
  });

  L.push('');
  L.push('■ 休日・環境');
  put('  休日', c.work.holidays);
  put('  年間休日', c.hearing.annualHolidays);
  put('  職場環境', c.hearing.environment);
  put('  設備', (c.facilities.checks || []).join('、'));
  const merits = meritLines(c);
  if (merits.length) { L.push('  職場の特徴：'); merits.forEach(x => L.push(`    ・${x}`)); }

  const kg = KENGAKU.filter(q => filled(c.kengaku[q[1]]));
  if (kg.length) {
    L.push('');
    L.push('■ 見学で確認した現場の実態');
    kg.forEach(q => L.push(`  ${q[2]}：${c.kengaku[q[1]]}${c.kengaku[q[1] + '_n'] ? `（${c.kengaku[q[1] + '_n']}）` : ''}`));
  }

  if (c.market.wage || c.market.note) {
    L.push('');
    L.push('■ エリアの相場');
    put('  相場時給', c.market.wage);
    put('  メモ', c.market.note);
  }

  /* ここが他では出てこない情報。前回どう出して、どうだったか */
  const ads = adGroupsFor(c);
  if (ads.length) {
    L.push('');
    L.push('■ これまでの広告の成績');
    ads.slice(0, 10).forEach(g => {
      const media = Object.keys(g.media)[0], x = Object.values(g.media)[0];
      L.push(`  ${media} ${g.name}：表示${(x.imp || 0).toLocaleString()} クリック${x.click || 0}`
        + `${x.imp ? `（CTR ${pct(x.click / x.imp)}）` : ''} 応募${x.apply || 0}${x.cost ? ` 費用${yen(x.cost)}` : ''}`);
    });
  }

  const st = statsFor(c);
  if (st.total) {
    L.push('');
    L.push('■ 応募してきた人の実績');
    L.push(`  応募${st.total}人 → 面接${st.interviewed}人 → 入社${st.nyusha}人`
      + `${st.ageNG ? `（うち年齢が合わなかった人 ${st.ageNG}人）` : ''}`);
  }

  const iss = (c.issues || []).filter(i => i.state !== 'done');
  if (iss.length) {
    L.push('');
    L.push('■ いま分かっている課題');
    iss.forEach(i => L.push(`  ［${i.area || 'その他'}］${i.text}`));
  }

  return L.join('\n');
}

function buildPrompt(c, o) {
  const aim = AIMS[o.aim] || AIMS.ctr;
  const persona = [o.age, o.sex, o.attr].filter(x => x && x !== '年代は問わない' && x !== '男女問わず' && x !== '問わない');
  const prev = o.aim === 'repost' && c.jobAd && c.jobAd.text ? c.jobAd.text : '';
  const M = MEDIA[o.media] || MEDIA['Airワーク'];
  const tops = topTitles(c);
  const deco = DECOS[o.deco] || DECOS.none;
  return `あなたは製造業・工場系の人材派遣会社で、求人広告を書くプロです。
下の案件データをもとに、求人原稿を日本語で作ってください。

# 誰に向けて書くか
${persona.length ? persona.join('・') : '特定の層にしぼらない'}${o.note ? `\n${o.note}` : ''}
この人が検索しているときの気持ち、迷う理由、決め手になるものを想像して書いてください。

# 今回のねらい
${aim.label}

${aim.order}

# 出力の形（ここが大事です）
次の5つだけを、この見出しのまま、この順で出力してください。ほかの項目は書かないでください。

【タイトル】
（全角${M.titleMax}字以内）

【求人キャッチコピー】
（全角${M.catchMax}字以内）

【求人内容】
${o.lenOn ? `（全角${o.lenBody}字ちょうどを目指す。前後20字までのずれは可）` : ''}
【求める人材】
${o.lenOn ? `（全角${o.lenWant}字程度）` : ''}
【職場環境】

給与・勤務時間・休日・勤務地・待遇・応募資格は、媒体の入力欄で別に設定します。
**見出しとしては書かないでください。** ただし求人内容を書くときの材料としては使ってください。

# 守ること
${M.note}
- 案件データにない条件（時給・手当・休日・待遇）は絶対に作らないこと
- 「アットホームな職場」「やりがい」のような、どの求人にも書ける言葉は使わない
- 字数は必ず守ること。超えたら削って収める
${deco.order ? `
# 書き方
${deco.order}` : ''}${o.narrow ? `

# スマホで読むことを前提にする
- 1行は全角20字以内で改行してください
- 長い文は途中で切って2行にする。読点のあとで改行すると読みやすくなります
- スマホの画面では1行が長いと読み飛ばされます` : ''}
${prev ? `
# 前回の原稿（これと重ならないように）
${prev}
` : ''}
${tops.length ? `
# 同じ拠点で実際にクリック率が高かったタイトル（手本）
数字は実績です。言い回しの型と、どこを押すと反応があるかの参考にしてください。真似ではなく傾向をつかむこと。
${tops.map(x => `・${x.title}（CTR ${pct(x.ctr)}・表示${x.imp.toLocaleString()}）`).join('\n')}
` : ''}
# 案件データ
${briefText(c)}`;
}

function viewAdWrite() {
  const A = awState();
  const list = Object.values(S.cases).map(normalizeCase)
    .sort((a, b) => (b.juchuDate || '').localeCompare(a.juchuDate || ''));
  const c = A.caseId && S.cases[A.caseId] ? normalizeCase(S.cases[A.caseId]) : null;

  const sel = (id, opts, cur, blank) => `<select class="inp" id="${id}">${blank ? `<option value="">${blank}</option>` : ''}${
    opts.map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

  const aimBtns = Object.entries(AIMS).map(([k, v]) =>
    `<label class="aim${A.aim === k ? ' on' : ''}"><input type="radio" name="aw-aim" value="${k}"${A.aim === k ? ' checked' : ''}>
      <b>${esc(v.label)}</b><span>${esc(v.hint)}</span></label>`).join('');

  const decoBtns = Object.entries(DECOS).map(([k, v]) =>
    `<label class="aim${A.deco === k ? ' on' : ''}"><input type="radio" name="aw-deco" value="${k}"${A.deco === k ? ' checked' : ''}>
      <b>${esc(v.label)}</b><span>${esc(v.hint)}</span></label>`).join('');
  const prompt = c ? buildPrompt(c, A) : '';
  const M = MEDIA[A.media] || MEDIA['Airワーク'];
  const fields = A.fields || null;
  const missing = c ? [
    !c.positions.some(p => p.pay) && '時給',
    !c.positions.some(p => detailText(p)) && '仕事内容',
    !c.work.holidays && '休日',
    !KENGAKU.some(q => filled(c.kengaku[q[1]])) && '見学メモ（現場実態）',
  ].filter(Boolean) : [];

  return `<div class="pagehead"><div><div class="eyebrow">AD WRITING</div><h1>求人作成</h1></div>
    <span class="sub">案件の情報からAIへの指示文を組み立てます</span></div>

  <div class="panel">
    <h3>1. どの案件の求人を作りますか</h3>
    <div class="fg"><div class="f"><label for="aw-case">案件</label>
      ${sel('aw-case', list.map(x => `${caseName(x)}｜${x.kyoten || '拠点未設定'}`), c ? `${caseName(c)}｜${c.kyoten || '拠点未設定'}` : '', '選んでください')}</div>
      <div class="f"><label for="aw-media">媒体</label>${sel('aw-media', Object.keys(MEDIA), A.media)}</div></div>
    ${missing.length ? `<div class="banner warn" style="margin-top:10px">この案件は <b>${missing.map(esc).join('・')}</b> が未入力です。その分、原稿が薄くなります。先に入力しておくと精度が上がります。</div>` : ''}
  </div>

  <div class="panel">
    <h3>2. 誰に向けた求人ですか</h3>
    <p>この人が検索しているときの気持ちを想像して書くよう、AIに指示します。</p>
    <div class="fg">
      <div class="f"><label for="aw-age">年代</label>${sel('aw-age', PERSONA_AGES, A.age, '選ぶ')}</div>
      <div class="f"><label for="aw-sex">性別</label>${sel('aw-sex', PERSONA_SEX, A.sex, '選ぶ')}</div>
      <div class="f"><label for="aw-attr">属性</label>${sel('aw-attr', PERSONA_ATTR, A.attr, '選ぶ')}</div>
    </div>
    <div class="f" style="margin-top:8px"><label for="aw-note">補足（任意）</label>
      <input class="inp" id="aw-note" value="${esc(A.note)}" placeholder="例：子どもの送迎があるので9時すぎ出勤を探している">
      <small>ペルソナの事情を一言書いておくと、原稿の説得力が変わります</small></div>
  </div>

  <div class="panel">
    <h3>3. 今回のねらい</h3>
    <div class="aims">${aimBtns}</div>
  </div>

  <div class="panel">
    <h3>4. 書き方（任意）</h3>
    <p>決めなくても作れます。見た目の好みや、媒体の都合に合わせたいときだけ使ってください。</p>
    <div class="aims" style="margin-bottom:14px">${decoBtns}</div>
    <label class="awopt"><input type="checkbox" id="aw-narrow"${A.narrow ? ' checked' : ''}>
      <span><b>スマホ向けに1行を短くする</b>1行あたり全角20字以内で改行させます</span></label>
    <label class="awopt"><input type="checkbox" id="aw-lenOn"${A.lenOn ? ' checked' : ''}>
      <span><b>文字数の目安を指定する</b>長さがばらつくときに使います</span></label>
    ${A.lenOn ? `<div class="fg" style="margin-top:4px">
      <div class="f"><label for="aw-lenBody">求人内容</label>
        <div class="suffix"><input class="inp" id="aw-lenBody" type="number" step="50" min="100" value="${A.lenBody}"><span>字</span></div>
        <small>この字数ちょうどを目指させます</small></div>
      <div class="f"><label for="aw-lenWant">求める人材</label>
        <div class="suffix"><input class="inp" id="aw-lenWant" type="number" step="50" min="50" value="${A.lenWant}"><span>字</span></div>
        <small>おおよその目安として伝えます</small></div></div>` : ''}
  </div>

  <div class="panel">
    <div class="row"><h3 style="margin:0">5. この文章をAIに貼ってください</h3><span class="spacer"></span>
      <button class="btn primary" data-act="awcopy"${c ? '' : ' disabled'}>プロンプトをコピー</button></div>
    ${c ? `<p>ジェンスパーク・Claude・ChatGPTなど、お使いのAIの入力欄に貼り付けてください。</p>
      <pre class="prompt" id="aw-prompt">${esc(prompt)}</pre>
      <p class="small muted">${prompt.length.toLocaleString()}文字</p>`
      : '<p class="small muted">上で案件を選ぶと、ここに貼り付ける文章が出ます。</p>'}
  </div>

  ${c ? `<div class="panel">
    <h3>6. AIの答えを貼る</h3>
    <p>AIが出した文章をまるごとここに貼ってください。下の4項目に振り分けます。</p>
    <textarea id="aw-draft" rows="8" placeholder="AIが出した文章をまるごと貼り付け">${esc(A.draft || (c.jobAd || {}).text || '')}</textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary" data-act="awsplit">4つに振り分ける</button>
      <button class="btn" data-act="awsave">この原稿を案件に保存</button>
      ${(c.jobAd || {}).at ? `<span class="small muted">前回保存：${fmtDT(c.jobAd.at)} ${esc(c.jobAd.by || '')}</span>` : ''}
      <span class="spacer"></span><a class="btn ghost" href="#/doc/${esc(c.id)}/ad">簡易求人票を見る</a></div>
  </div>

  ${fields ? `<div class="panel">
    <h3>7. 1項目ずつコピーしてエアワークに貼る</h3>
    <p>上限を超えている項目は赤くなります。</p>
    ${AW_FIELDS.map(fd => fieldBoxHTML(fd, fields[fd.key] || '', M)).join('')}
  </div>` : ''}` : ''}`;
}

/* 項目ごとの箱。テンプレートが入れ子になりすぎるので関数に出した */
function fieldBoxHTML(fd, v, M) {
  const max = fd.max(M);
  const len = [...v].length;
  const over = max && len > max;
  const rows = fd.key === 'body' ? 10 : fd.key === 'want' ? 5 : 2;
  return `<div class="awf${over ? ' over' : ''}">
    <div class="row"><b>${esc(fd.label)}</b>
      <span class="small ${over ? 'ngc' : 'muted'}">${len}${max ? ` / ${max}字` : '字'}${over ? '　超えています' : ''}</span>
      <span class="spacer"></span>
      <button class="btn sm" data-act="awcopyf" data-k="${fd.key}"${v ? '' : ' disabled'}>コピー</button></div>
    <textarea data-awf="${fd.key}" rows="${rows}">${esc(v)}</textarea>
  </div>`;
}

/* AIの答えを4項目に切り分ける。見出しの表記ゆれ（全角カッコ・■・#）も拾う */
function awSplit(text) {
  const names = { 'タイトル': 'title', '求人キャッチコピー': 'catch', 'キャッチコピー': 'catch', 'キャッチ': 'catch', '求人内容': 'body', '仕事内容': 'body', '求める人材': 'want', '求める人物像': 'want', '職場環境': 'env', '職場の雰囲気': 'env', '職場の環境': 'env' };
  const out = {}; let cur = null, buf = [];
  const flush = () => { if (cur && buf.length) out[cur] = (out[cur] ? out[cur] + '\n' : '') + buf.join('\n').trim(); buf = []; };
  for (const raw of String(text).split('\n')) {
    const head = raw.trim().replace(/^[#＃■●・\s]*[【\[]?\s*/, '').replace(/\s*[】\]]?\s*[:：]?\s*$/, '');
    if (names[head] !== undefined && raw.trim().length <= head.length + 6) { flush(); cur = names[head]; continue; }
    if (cur) buf.push(raw);
  }
  flush();
  return Object.keys(out).length ? out : null;
}

/* 画面で選んだ内容を控える。選ぶたびに作り直すので保存ボタンは要らない */
function awSet(k, v) { awState()[k] = v; rerender(); }

async function awCopy() {
  const el = $('#aw-prompt'); if (!el) return;
  try {
    await navigator.clipboard.writeText(el.textContent);
    toast('コピーしました。AIの入力欄に貼り付けてください');
  } catch (e) {
    /* 社内のブラウザ設定でコピーが禁止されていることがあるので、選択状態にして逃がす */
    const r = document.createRange(); r.selectNodeContents(el);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    toast('自動コピーができませんでした。選択したので Ctrl+C を押してください', 'warn');
  }
}

async function awSave() {
  if (needMe()) return;
  const A = awState(); const text = ($('#aw-draft') || {}).value || '';
  if (!text.trim()) { toast('原稿が空です', 'warn'); return; }
  await mutate(A.caseId, x => { x.jobAd = { text, at: nowISO(), by: S.me }; }, '求人原稿を保存', true);
  A.draft = text;
  toast('保存しました。簡易求人票にも出ます');
}

/* 画面の入力をまとめて受ける。案件名は「名前｜拠点」で表示しているので、選ばれた位置から探す */
function awChange(el) {
  const A = awState();
  if (el.id === 'aw-case') {
    const list = Object.values(S.cases).map(normalizeCase)
      .sort((a, b) => (b.juchuDate || '').localeCompare(a.juchuDate || ''));
    const hit = list.find(x => `${caseName(x)}｜${x.kyoten || '拠点未設定'}` === el.value);
    A.caseId = hit ? hit.id : '';
    A.draft = '';
  } else if (el.id === 'aw-draft') { A.draft = el.value; return; }
  else if (el.type === 'checkbox') A[el.id.slice(3)] = el.checked;
  else if (el.type === 'number') A[el.id.slice(3)] = Math.max(1, +el.value || 0);
  else A[el.id.slice(3)] = el.value;
  rerender();
}
/* ねらいのラジオは name で拾う（id を付けていないため） */
document.addEventListener('change', (e) => {
  if (e.target.name === 'aw-aim') { awState().aim = e.target.value; rerender(); }
  if (e.target.name === 'aw-deco') { awState().deco = e.target.value; rerender(); }
});

/* 貼られた文章を4項目に振り分ける */
function awDoSplit() {
  const A = awState(); const text = ($('#aw-draft') || {}).value || '';
  if (!text.trim()) { toast('先にAIの答えを貼ってください', 'warn'); return; }
  A.draft = text;
  const f = awSplit(text);
  if (!f) { toast('見出し（【タイトル】など）が見つからず振り分けられませんでした。手で分けてください', 'warn'); return; }
  A.fields = f;
  const miss = AW_FIELDS.filter(x => !f[x.key]).map(x => x.label);
  rerender();
  toast(miss.length ? `振り分けました。${miss.join('・')}が見つかりません` : '4項目に振り分けました');
}

/* 項目ごとのコピー */
async function awCopyField(key) {
  const el = document.querySelector(`[data-awf="${key}"]`); if (!el) return;
  const label = (AW_FIELDS.find(x => x.key === key) || {}).label || '';
  try { await navigator.clipboard.writeText(el.value); toast(`${label}をコピーしました`); }
  catch (e) { el.select(); toast('自動コピーができませんでした。Ctrl+C を押してください', 'warn'); }
}
