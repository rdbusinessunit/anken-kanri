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

/* 媒体ごとの決まりごと */
const MEDIA_RULE = {
  'Airワーク': `- 媒体はAirワーク（Indeed連携）です
- タイトルは全角30字以内。【派遣社員】で始める
- キャッチコピーは全角50字以内
- 絵文字は使いすぎない（多くて3つまで）`,
  '求人BOX': `- 媒体は求人ボックスです
- タイトルは全角40字以内
- 検索で使われる言葉（職種名・地名・こだわり条件）をタイトルに入れる`,
};

const awState = () => (S.aw = S.aw || { caseId: '', age: '', sex: '', attr: '', note: '', aim: 'ctr', media: 'Airワーク', draft: '' });

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
  return `あなたは製造業・工場系の人材派遣会社で、求人広告を書くプロです。
下の案件データをもとに、求人原稿を日本語で作ってください。

# 誰に向けて書くか
${persona.length ? persona.join('・') : '特定の層にしぼらない'}${o.note ? `\n${o.note}` : ''}
この人が検索しているときの気持ち、迷う理由、決め手になるものを想像して書いてください。

# 今回のねらい
${aim.label}

${aim.order}

# 守ること
${MEDIA_RULE[o.media] || ''}
- 案件データにない条件（時給・手当・休日・待遇）は絶対に作らないこと。書けない項目は省く
- 「アットホームな職場」「やりがい」のような、どの求人にも書ける言葉は使わない
- 見出しは【タイトル】【キャッチコピー】【仕事内容】【給与】【勤務時間】【休日】【勤務地・アクセス】【応募資格】【待遇・福利厚生】【職場の雰囲気】の順
${prev ? `
# 前回の原稿（これと重ならないように）
${prev}
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

  const prompt = c ? buildPrompt(c, A) : '';
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
      <div class="f"><label for="aw-media">媒体</label>${sel('aw-media', Object.keys(MEDIA_RULE), A.media)}</div></div>
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
    <div class="row"><h3 style="margin:0">4. この文章をAIに貼ってください</h3><span class="spacer"></span>
      <button class="btn primary" data-act="awcopy"${c ? '' : ' disabled'}>プロンプトをコピー</button></div>
    ${c ? `<p>ジェンスパーク・Claude・ChatGPTなど、お使いのAIの入力欄に貼り付けてください。</p>
      <pre class="prompt" id="aw-prompt">${esc(prompt)}</pre>
      <p class="small muted">${prompt.length.toLocaleString()}文字</p>`
      : '<p class="small muted">上で案件を選ぶと、ここに貼り付ける文章が出ます。</p>'}
  </div>

  ${c ? `<div class="panel">
    <h3>5. できた原稿を戻す（任意）</h3>
    <p>AIが作った原稿をここに貼って保存すると、案件に残り、簡易求人票にも印刷されます。</p>
    <textarea id="aw-draft" rows="10" placeholder="AIが作った原稿を貼り付け">${esc(A.draft || (c.jobAd || {}).text || '')}</textarea>
    <div class="row" style="margin-top:8px"><button class="btn" data-act="awsave">この原稿を案件に保存</button>
      ${(c.jobAd || {}).at ? `<span class="small muted">前回保存：${fmtDT(c.jobAd.at)} ${esc(c.jobAd.by || '')}</span>` : ''}
      <span class="spacer"></span><a class="btn ghost" href="#/doc/${esc(c.id)}/ad">簡易求人票を見る</a></div>
  </div>` : ''}`;
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
  else A[el.id.slice(3)] = el.value;
  rerender();
}
/* ねらいのラジオは name で拾う（id を付けていないため） */
document.addEventListener('change', (e) => {
  if (e.target.name === 'aw-aim') { awState().aim = e.target.value; rerender(); }
});
