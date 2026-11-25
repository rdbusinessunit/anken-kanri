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

/* 同じ案件から、押す軸を変えて何本も作るためのスイッチ。
   ねらい（AIMS）が「何を増やしたいか」なのに対して、こちらは「何で引くか」。
   軸ごとに、見学メモのどの項目を使うかまで指定する。
   項目名を書いておかないと、AIは案件データの頭のほうだけ拾って一般論を書く。 */
const ANGLES = {
  none: { label: '指定しない', hint: '案件のいちばん強いところで書きます', order: '' },
  life: {
    label: 'プライベート重視', hint: '休日・終業時間・残業の少なさで引きます',
    memo: ['q33', 'q30', 'q28'],
    order: `仕事が終わったあとと、休みの日の暮らしが浮かぶように書いてください。
- 休日、年間休日、終業時間、残業時間を前に出す
- 「何時に帰れるから何ができるか」まで書く。時刻を書くだけで終わらせない
- 見学メモの「昼休憩は外に出られるか」「休憩はみんなどうしているか」「食堂」も使う
- 残業が多い案件で「残業なし」と書かない。多いなら、その分の月収で引くこと`,
  },
  work: {
    label: '仕事内容重視', hint: '作業の中身そのもので引きます',
    memo: ['q20', 'q21', 'q07'],
    order: `何を作っていて、1日何をするのかを具体的に書いてください。
- 案件データの「完成品・用途」「作業内容」を必ず使う。自分が作るものが分かると応募が増える
- 見学メモの「ライン作業かどうか」「早いか遅いか」「一ヵ所で動かないのか、動きはあるのか」
  「作業姿勢」「音」「臭い」を使って、作業中の体感が分かるように書く
- 「カンタンな軽作業」で済ませないこと。何がどうカンタンなのかを書く`,
  },
  career: {
    label: 'キャリアアップ重視', hint: '転籍・資格・交替入りで引きます',
    memo: ['q36', 'q37', 'q25'],
    order: `この仕事がどこにつながるのかを書いてください。
- 見学メモの「転籍実績はあるのか」「どんな人が転籍するのか」「転籍者の年齢・性別」を使う
- 「交替に入るまでの日勤の期間」があれば、日勤から交替に上がって収入が増える道筋として書く
- 必要な資格、身につく作業、任される範囲の広がりを具体的に書く
- 転籍実績が「無」の案件では、正社員登用を匂わせないこと。
  その場合は身につく技術と任される範囲で書く`,
  },
  train: {
    label: '研修重視', hint: '未経験でも覚えられることで引きます',
    memo: ['q09', 'q10', 'q11', 'q24'],
    order: `未経験の人が「これなら覚えられる」と思えるように書いてください。
- 見学メモの「教育期間、習熟期間」「誰に教わるのか」「マンツーマンで教わるのか、少し教えて放置か」
  「教育の方法」を必ず使う。ここが研修重視の原稿の中身です
- 「bringメンバーの人数」があれば、一人で放り込まれるわけではないことの裏づけに使う
- 「人間関係」「男女比」も、聞きやすい雰囲気かどうかの材料として使う
- 「未経験歓迎」とだけ書かないこと。誰が何日かけてどう教えるのかを書く`,
  },
};

/* 軸（ANGLES）とは別に、どの軸と組み合わせても足せる説明。
   軸は1つしか選べないが、こちらは必要なものだけONにできる。
   キーは状態のキーそのもの。チェックボックスの id を aw-<キー> にすると、
   共通の change ハンドラがそのまま拾ってくれる */
const EXTRAS = {
  exProduct: {
    label: '製造品の説明を入れる', hint: '何を作っている工場なのかを必ず書かせます',
    data: [
      ['完成品・用途', c => c.positions.some(p => filled(p.product))],
      ['生産品目', c => filled(c.company.products)],
      ['企業の説明', c => filled(c.company.description)],
    ],
    order: `【製造品の説明】その工場が何を作っているのかを、読む人が思い浮かべられるように書いてください。
- 案件データの「企業の説明」「業種」「生産品目」と、職種の「完成品・用途」を必ず使う
- 部品なら、それが最後に何になるのかまで書く（例：この部品は、家の窓枠になります）
- 身近で目にするもの、名前を知っている製品につながるなら、それを出す。
  自分の作ったものがどこにあるか分かることは、工場で働く理由になります
- 大きさ・重さ・1日に何個つくるかなど、数字で手ざわりが分かるように書く
- 案件データに書いていない事業・取引先・納入先を、推測で足さないこと`,
  },
  exProcess: {
    label: '工程の説明を入れる', hint: '担当する工程と1日の流れを必ず書かせます',
    memo: ['q20', 'q21', 'q07'],
    data: [['作業内容', c => c.positions.some(p => filled(p.task))]],
    order: `【工程の説明】募集している工程が、ものづくりのどこにあたるのかを書いてください。
- 職種の「作業内容」を起点に、前の工程から何が流れてきて、自分が何をして、
  次にどこへ渡すのかを順に書く
- 見学メモの「ライン作業かどうか」「早いか遅いか」「一ヵ所で動かないのか、動きはあるのか」を使い、
  ラインの速さで進むのか、自分のペースで進むのかをはっきりさせる
- 1日の流れ（始業→午前→休憩→午後→終業）が分かるように書く。
  ただし案件データから分かる範囲までにして、工程を想像で足さないこと
- 「特有の難しさ」があれば隠さずに書く。そのうえで、どう慣れていくのかを続けて書く`,
  },
};

/* オプションを2つONにしたとき、プロンプトの中で1行あけて並べるための区切り */
const EX_SEP = '\n\n';

/* 媒体ごとの決まりごと。字数はエアワーク／求人ボックスの入力欄に合わせる */
const MEDIA = {
  'Airワーク': { titleMax: 30, catchMax: 30,
    note: '- タイトルに雇用形態（派遣社員など）は入れない。職種と、いちばん強い条件で書く',
    symbols: `上の「使ってよい記号」が最優先です。そのうえで、次のことを守ってください。

- **半角のバックスラッシュは絶対に書かないでください。**
  日本語環境では ￥ として表示されるため、原稿のあちこちが円マークに化けます。
  キャッチの「＼〇〇♪／」は全角の＼なので、こちらは使ってかまいません
- **改行は、実際に改行して書いてください。**
  改行を表す文字（エヌの前に半角バックスラッシュを付けたもの）や <br> を書かないこと。
  それを書くと、貼り付けたときに ￥n という文字として残ります
- 出力を \`\`\` で囲んだり、JSONや表の形にしたりしないでください。そのまま貼れる文章で出すこと
- 絵文字（🎶 😊 ❤ ⁉ ❕ 🔰 🚗 など）は使わないこと。掲載されないか、文字化けします
- ㈱ ㊀ ⑴ ⒈ ℃ ㎏ のような組文字・環境依存文字は使えません` },
  '求人BOX': { titleMax: 40, catchMax: 30,
    note: '- 検索で使われる言葉（職種名・地名・こだわり条件）をタイトルに入れる' },
};

/* タイトルとキャッチは何案出させるか。短くて効きが大きいので、選べるようにする */
const AW_VARIANTS = 5;

/* キャッチの字数。媒体の上限は30字だが、型のほうが短いのでこちらを使う */
const KATA_CATCH_MAX = 25;

/* プロンプトの出しかた。同じAIの会話を使いまわすなら、型は最初の1回で足りる */
const MODES = {
  full: { label: '毎回まるごと', hint: '型も見本も入った1本。どのAIにもそのまま貼れます' },
  learn: { label: '型を覚えさせる', hint: '最初に1回だけ型を貼り、2回目からは案件データだけ' },
};

/* 実際に編集するのはこの5つだけ。給与や勤務時間は媒体側の入力欄で設定するので原稿には書かせない。
   multi が付いた項目は複数案を出させて、1案ずつコピーできるようにする */
const AW_FIELDS = [
  { key: 'title', label: 'タイトル', max: m => m.titleMax, multi: true },
  { key: 'catch', label: '求人キャッチコピー', max: m => m.catchMax, multi: true },
  { key: 'body', label: '求人内容', max: () => 0, len: o => o.lenBody },
  { key: 'want', label: '求める人材', max: () => 0, len: o => o.lenWant },
  { key: 'env', label: '職場環境', max: () => 0 },
];

/* 同じ拠点で実際にクリック率が高かったタイトル。成績の裏づけがある手本として渡す */
function topTitles(c, n = 6) {
  const rows = adDocs().filter(d => d.media === 'Indeed' && d.kyoten === c.kyoten)
    .flatMap(d => d.groups || [])
    .filter(g => g.title && g.imp >= 80)
    .map(g => ({ title: g.title, imp: g.imp, ctr: g.click / g.imp }))
    .sort((a, b) => b.ctr - a.ctr);
  const seen = new Set();
  /* 過去の原稿は頭に【派遣社員】が付いている。今は付けない方針なので手本からは外す。
     ここで外しておくと、同じ型の重複を弾く判定も効くようになる。
     実績データは「職種名/キャッチ」がつながっているので、/ の前だけを手本にする */
  return rows.map(r => ({ ...r, title: r.title.replace(/^【[^】]*】/, '').split('/')[0].trim() }))
    .filter(r => r.title && !seen.has(r.title.slice(0, 20)) && seen.add(r.title.slice(0, 20))).slice(0, n);
}

const awState = () => (S.aw = S.aw || {
  kyoten: '', caseId: '', age: '', sex: '', attr: '', note: '', aim: 'ctr', angle: 'none',
  media: 'Airワーク', draft: '',
  exProduct: false, exProcess: false,
  mode: 'full', lenOn: false, lenBody: 700, lenWant: 300,
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
  /* 「製造品の説明」の軸で使う。何を作っている会社なのかが分からないと書けない */
  put('業種', c.company.industry);
  put('生産品目', c.company.products);

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

/* 型と見本のかたまり。まるごとモードでは毎回、学習モードでは最初の1回だけ入る */
function kataBlock() {
  return `# 書き方の型（社内で応募が多く入っている書き方です。ここが最優先）

## 全項目に共通すること
${KATA_RULES}

## 項目ごとの書き方
${KATA_FIELDS}

## 使ってよい記号
${KATA_MARKS}

## 見本（書き方・言葉づかい・リズムだけをまねる。内容はまねない）
${KATA_SAMPLES}`;
}

/* 「型を覚えさせる」モードで、最初に1回だけ貼る文章。
   同じ会話を使いまわすあいだ、2回目からは案件データだけで済む */
function buildLearn() {
  return `これから、当社の求人原稿の「書き方の型」を覚えてもらいます。
この会話では、以後ずっとこの型で求人原稿を書いてください。

# 前提
- 当社：株式会社bring plus（茨城・千葉の製造業向け人材派遣）
- 媒体：エアワーク（Indeed・求人ボックスに配信）
- 読み手：工場で働いたことがない人、ブランクがある人、主婦の方など、幅広い求職者
- 目的：スマホで読んで「自分にもできそう」と思い、応募してもらうこと

${kataBlock()}

# 最初にやってほしいこと
まだ原稿は書かないでください。
1. 見本から読み取った書き方の特徴を、10個以内の箇条書きで返してください
2. 上の型と見本でずれている点や、わかりにくい点があれば質問してください
3. 私が「OK」と言ったら覚えたことにしてください。
   そのあと案件データを渡すので、そこからはこの型で原稿を書いてください`;
}

function buildPrompt(c, o) {
  const aim = AIMS[o.aim] || AIMS.ctr;
  const ang = ANGLES[o.angle] || ANGLES.none;
  /* ONにされたオプション。軸と違って何個でも足せる */
  const exOn = Object.entries(EXTRAS).filter(([k]) => o[k]).map(([, v]) => v);
  const persona = [o.age, o.sex, o.attr].filter(x => x && x !== '年代は問わない' && x !== '男女問わず' && x !== '問わない');
  const prev = o.aim === 'repost' && c.jobAd && c.jobAd.text ? c.jobAd.text : '';
  const M = MEDIA[o.media] || MEDIA['Airワーク'];
  const tops = topTitles(c);
  /* 学習モードでは、型と見本はもう相手が覚えている。ここでは繰り返さない */
  const learned = o.mode === 'learn';
  /* キャッチは型のほうが短い。媒体の上限より型を優先する */
  const catchMax = Math.min(M.catchMax, KATA_CATCH_MAX);
  return `${learned
    ? `さきほど覚えてもらった「書き方の型」と見本のとおりに、
いちばん下の案件データから求人原稿を1件作ってください。型は変えないでください。`
    : `あなたは、茨城・千葉の製造業向け人材派遣会社「株式会社bring plus」の求人原稿ライターです。
エアワーク（Indeed・求人ボックスに配信）に載せる派遣社員の求人原稿を書きます。
下の「書き方の型」と見本のとおりに、いちばん下の案件データから原稿を1件作ってください。`}

# 誰に向けて書くか
${persona.length ? persona.join('・') : '特定の層にしぼらない'}${o.note ? `\n${o.note}` : ''}
この人が検索しているときの気持ち、迷う理由、決め手になるものを想像して書いてください。

# 今回のねらい
${aim.label}

${aim.order}
${ang.order ? `
# 押す軸：${ang.label}
原稿全体をこの軸で通してください。タイトルもキャッチも本文も、ここを中心にします。

${ang.order}
` : ''}${exOn.length ? `
# 必ず入れる説明
押す軸とは別に、次の説明を【求人内容】のなかに必ず入れてください。

${exOn.map(x => x.order).join(EX_SEP)}
` : ''}${learned ? '' : `
${kataBlock()}
`}
# 出力の形（ここが大事です）
次の5つだけを、この見出しのまま、この順で出力してください。ほかの項目は書かないでください。

【タイトル】
（全角${M.titleMax}字以内。${AW_VARIANTS}案を「1. 」から始まる番号つきで1行ずつ）

【求人キャッチコピー】
（全角${catchMax}字以内。${AW_VARIANTS}案を「1. 」から始まる番号つきで1行ずつ）

【求人内容】
${o.lenOn ? `（全角${o.lenBody}字ちょうどを目指す。前後20字までのずれは可）` : ''}
【求める人材】
${o.lenOn ? `（全角${o.lenWant}字程度）` : ''}
【職場環境】

給与・給与例・勤務時間・休日休暇・アクセス・社会保険・選考プロセス・問い合わせ先は、
エアワークの入力欄で別に設定します。**見出しとしては書かないでください。**
ただし求人内容を書くときの材料としては使ってください。

# 守ること
${M.note}
- 案件データにない条件（時給・手当・休日・寮・送迎・研修・設備）は絶対に作らないこと。
  分からないところは【要確認】と書いてください
- 時給・月収例・勤務時間・交替の有無・寮費は、どの項目でも同じ値にすること
- 月収例を書くときは「時給×時間×日数」の式で計算し、検算してから書くこと
- 「アットホームな職場」「やりがい」のような、どの求人にも書ける言葉は使わない
- 見本の書き方はまねる。見本の内容（仕事・条件・設備）は使わない。ほかの求人の文章も混ぜない
- 字数は必ず守ること。超えたら削って収める
- タイトルとキャッチの${AW_VARIANTS}案は、言い回しを変えただけのものにしないこと。
  ${ang.order
    ? `${AW_VARIANTS}案とも「${ang.label}」の軸は外さず、その中で切り口をずらしてください。
  軸は同じでも、推す事実を変える・語りかける相手を変える・言い切り方を変える、で別物にできます`
    : '押す条件を変える（時給・勤務時間・休日・職場の人・未経験可など）、切り口をずらす。'}
  選ぶ側が迷えるように、別の方向から${AW_VARIANTS}案ください
- ${AW_VARIANTS}案は番号つきの${AW_VARIANTS}行だけにしてください。
  「（1=時給、2=未経験…）」のような、どの案が何を狙ったかの説明は書かないこと。
  前置き・まとめ・感想も不要です。見出しと中身だけを出してください
${M.symbols ? `
# 貼り付けで事故らないために（媒体の決まり）
${M.symbols}` : ''}
${prev ? `
# 前回の原稿（これと重ならないように）
${prev}
` : ''}
${tops.length ? `
# 同じ拠点で実際にクリック率が高かったタイトル（参考）
数字は実績です。どこを押すと反応があるかの参考にしてください。真似ではなく傾向をつかむこと。
書き方そのものは、上の型と見本のほうが優先です。
${tops.map(x => `・${x.title}（CTR ${pct(x.ctr)}・表示${x.imp.toLocaleString()}）`).join('\n')}
` : ''}
# 案件データ
${briefText(c)}`;
}
/* 案件は数百件あるので、拠点で絞ってから選ぶ。拠点ごとの件数も出す */
function awCaseList(kyoten) {
  return Object.values(S.cases).map(normalizeCase)
    .filter(x => !kyoten || x.kyoten === kyoten)
    .sort((a, b) => caseName(a).localeCompare(caseName(b), 'ja'));
}
const awLabel = x => `${caseName(x)}｜${x.kyoten || '拠点未設定'}`;

function viewAdWrite() {
  const A = awState();
  const all = Object.values(S.cases).map(normalizeCase);
  const kyoN = id => all.filter(x => (x.kyoten || '') === id).length;
  const kyoOpts = cfg().kyotens.map(k => k.id).filter(k => kyoN(k))
    .map(k => `${k}（${kyoN(k)}件）`);
  if (kyoN('')) kyoOpts.push(`拠点未設定（${kyoN('')}件）`);
  const kyoVal = A.kyoten ? kyoOpts.find(o => o.startsWith(A.kyoten + '（')) || '' : '';
  const list = A.kyoten ? awCaseList(A.kyoten === '拠点未設定' ? '' : A.kyoten) : [];
  const c = A.caseId && S.cases[A.caseId] ? normalizeCase(S.cases[A.caseId]) : null;

  const sel = (id, opts, cur, blank) => `<select class="inp" id="${id}">${blank ? `<option value="">${blank}</option>` : ''}${
    opts.map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

  const aimBtns = Object.entries(AIMS).map(([k, v]) =>
    `<label class="aim${A.aim === k ? ' on' : ''}"><input type="radio" name="aw-aim" value="${k}"${A.aim === k ? ' checked' : ''}>
      <b>${esc(v.label)}</b><span>${esc(v.hint)}</span></label>`).join('');

  const angBtns = Object.entries(ANGLES).map(([k, v]) =>
    `<label class="aim${A.angle === k ? ' on' : ''}"><input type="radio" name="aw-angle" value="${k}"${A.angle === k ? ' checked' : ''}>
      <b>${esc(v.label)}</b><span>${esc(v.hint)}</span></label>`).join('');

  const modeBtns = Object.entries(MODES).map(([k, v]) =>
    `<label class="aim${A.mode === k ? ' on' : ''}"><input type="radio" name="aw-mode" value="${k}"${A.mode === k ? ' checked' : ''}>
      <b>${esc(v.label)}</b><span>${esc(v.hint)}</span></label>`).join('');
  const prompt = c ? buildPrompt(c, A) : '';
  /* 学習モードのときだけ、最初に1回貼る文章も作る */
  const learn = c && A.mode === 'learn' ? buildLearn() : '';
  const M = MEDIA[A.media] || MEDIA['Airワーク'];
  const fields = A.fields || null;
  const missing = c ? [
    !c.positions.some(p => p.pay) && '時給',
    !c.positions.some(p => detailText(p)) && '仕事内容',
    !c.work.holidays && '休日',
    !KENGAKU.some(q => filled(c.kengaku[q[1]])) && '見学メモ（現場実態）',
  ].filter(Boolean) : [];

  return `<div class="awpage">
  <div class="pagehead"><div><div class="eyebrow">AD WRITING</div><h1>求人作成</h1></div>
    <span class="sub">案件の情報からAIへの指示文を組み立てます</span></div>
    ${jobSubnav('write')}

  <div class="panel">
    <h3>1. どの案件の求人を作りますか</h3>
    <div class="fg">
      <div class="f"><label for="aw-kyoten">拠点</label>
        ${sel('aw-kyoten', kyoOpts, kyoVal, '選んでください')}
        <small>先に拠点を選ぶと、その拠点の案件だけが下に出ます</small></div>
      <div class="f"><label for="aw-case">案件</label>
        ${A.kyoten
          ? sel('aw-case', list.map(awLabel), c ? awLabel(c) : '', `選んでください（${list.length}件）`)
          : '<select class="inp" id="aw-case" disabled><option>先に拠点を選んでください</option></select>'}
        ${A.kyoten ? `<small>${esc(A.kyoten)} の案件 ${list.length}件</small>` : ''}</div>
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
    <h3>4. 求人のバリエーション</h3>
    <p>同じ案件でも、押す軸を変えると別の求人になります。1案件から何本も出したいときに切り替えてください。</p>
    <div class="aims">${angBtns}</div>
    <p style="margin:18px 0 8px;font-size:14px;color:var(--ink-2)"><b>どの軸にも足せる説明</b>　軸とは別に、必要なものだけONにしてください</p>
    ${Object.entries(EXTRAS).map(([k, v]) => `<label class="awopt"><input type="checkbox" id="aw-${k}"${A[k] ? ' checked' : ''}>
      <span><b>${esc(v.label)}</b>${esc(v.hint)}</span></label>`).join('')}
    ${c ? (() => {
      /* 軸とオプションに使う材料が空だと、書きようがない。先に言う。
         見学メモ（memo）だけでなく、案件データ側の項目（data）も見る */
      const srcs = [ANGLES[A.angle] || {}, ...Object.entries(EXTRAS).filter(([k]) => A[k]).map(([, v]) => v)];
      const miss = [...new Set(srcs.flatMap(s => [
        ...(s.memo || []).filter(q => !filled(c.kengaku[q]))
          .map(q => (KENGAKU.find(x => x[1] === q) || [])[2]),
        ...(s.data || []).filter(([, ok]) => !ok(c)).map(([label]) => label),
      ]))].filter(Boolean);
      return miss.length
        ? `<div class="banner warn" style="margin-top:12px">ここで使う <b>${miss.map(esc).join('・')}</b> が未入力です。
             その分、原稿は薄くなります。</div>`
        : '';
    })() : ''}
  </div>

  <div class="panel">
    <h3>5. 書き方</h3>
    <p>書き方は、社内で応募が多く入っている型に固定してあります。
      職種名は「売り｜やさしい言葉の仕事内容｜条件」、キャッチは「＼〇〇♪／＋一言」、
      求人内容は心の声 → 3ステップ → 時間・休日 → 研修 → 待遇 → 締めの問いかけ、の順です。</p>
    <p class="small muted">本文で使う記号は <b>♪ ◎ ！ ＼ ／ ◆ ★ ● ① ② ③ ━</b> だけ。絵文字は使いません。
      タイトルはエアワークの「職種名」欄なので記号がさらに厳しく、<b>｜ と ・</b> だけにしています。
      型と見本を直したいときは kata.js を編集してください。</p>
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
    <h3>6. この文章をAIに貼ってください</h3>
    <p>ジェンスパーク・Claude・ChatGPTなど、お使いのAIの入力欄に貼り付けてください。</p>
    <div class="aims" style="margin-bottom:14px">${modeBtns}</div>
    ${!c ? '<p class="small muted">上で案件を選ぶと、ここに貼り付ける文章が出ます。</p>'
      : A.mode === 'learn' ? `
      <div class="row"><b>① 最初に1回だけ貼る（型を覚えさせる）</b><span class="spacer"></span>
        <button class="btn" data-act="awcopy" data-k="aw-learn">①をコピー</button></div>
      <p class="small muted">AIが「覚えました」と答えるのを待ってから、②を貼ってください。
        同じ会話を使いつづけるあいだ、①はもう貼らなくて大丈夫です。</p>
      <pre class="prompt" id="aw-learn">${esc(learn)}</pre>
      <p class="small muted">${learn.length.toLocaleString()}文字</p>
      <div class="row" style="margin-top:20px"><b>② 案件ごとに貼る</b><span class="spacer"></span>
        <button class="btn primary" data-act="awcopy" data-k="aw-prompt">②をコピー</button></div>
      <pre class="prompt" id="aw-prompt">${esc(prompt)}</pre>
      <p class="small muted">${prompt.length.toLocaleString()}文字</p>`
      : `
      <div class="row"><span class="spacer"></span>
        <button class="btn primary" data-act="awcopy" data-k="aw-prompt">プロンプトをコピー</button></div>
      <pre class="prompt" id="aw-prompt">${esc(prompt)}</pre>
      <p class="small muted">${prompt.length.toLocaleString()}文字</p>`}
  </div>

  ${c ? `<div class="panel">
    <h3>7. AIの答えを貼る</h3>
    <p>AIが出した文章をまるごとここに貼ってください。下の${AW_FIELDS.length}項目に振り分けます。</p>
    <textarea id="aw-draft" rows="8" placeholder="AIが出した文章をまるごと貼り付け">${esc(A.draft || (c.jobAd || {}).text || '')}</textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary" data-act="awsplit">${AW_FIELDS.length}つに振り分ける</button>
      <button class="btn" data-act="awsave">この原稿を案件に保存</button>
      ${(c.jobAd || {}).at ? `<span class="small muted">前回保存：${fmtDT(c.jobAd.at)} ${esc(c.jobAd.by || '')}</span>` : ''}
      <span class="spacer"></span><a class="btn ghost" href="#/doc/${esc(c.id)}/ad">簡易求人票を見る</a></div>
  </div>

  ${fields ? `<div class="panel">
    <h3>8. 1項目ずつコピーしてエアワークに貼る</h3>
    <p>上限を超えている項目は赤くなります。</p>
    ${AW_FIELDS.map(fd => fieldBoxHTML(fd, fields[fd.key] || '', M)).join('')}
  </div>` : ''}` : ''}
  </div>`;
}

/* 複数案の行から、先頭の番号（1. ／1）／①／・）を外す */
const NUMBERED = /^\s*(?:[0-9０-９]{1,2}\s*[.．)）:：、]|[①-⑩]|[-・*])\s*/;
const stripNo = s => String(s).replace(NUMBERED, '').trim();

/* 5案だけを取り出す。AIは案のあとに「（1=時給／2=未経験…）」のような
   説明行を足してくることがあり、それを案として数えてしまうため。
   番号つきの行があれば、それだけを案とみなす。 */
function awVariants(v) {
  const lines = String(v).split('\n').map(x => x.trim()).filter(Boolean);
  const numbered = lines.filter(x => NUMBERED.test(x));
  const src = numbered.length ? numbered : lines.filter(x => !/^[（(].*[）)]$/.test(x));
  return src.map(stripNo).filter(Boolean);
}

/* 項目ごとの箱。テンプレートが入れ子になりすぎるので関数に出した */
function fieldBoxHTML(fd, v, M) {
  const max = fd.max(M);
  /* タイトルとキャッチは複数案。1案ずつコピーできないと貼れないので行ごとに分ける */
  if (fd.multi) {
    const opts = awVariants(v);
    const rows = opts.map((o, i) => {
      const len = [...o].length;
      const over = max && len > max;
      return `<div class="awopt-row${over ? ' over' : ''}">
        <span class="no">${i + 1}</span>
        <span class="txt">${esc(o)}</span>
        <span class="small ${over ? 'ngc' : 'muted'}">${len}${max ? `/${max}` : ''}字</span>
        <button class="btn sm" data-act="awcopyv" data-k="${fd.key}" data-i="${i}">コピー</button>
      </div>`;
    }).join('');
    return `<div class="awf">
      <div class="row"><b>${esc(fd.label)}</b>
        <span class="small muted">${opts.length}案${max ? `　上限 ${max}字` : ''}</span></div>
      ${opts.length ? rows : '<p class="small muted" style="margin:6px 0 0">見つかりませんでした。下の欄に手で入れてください。</p>'}
      <textarea data-awf="${fd.key}" rows="${Math.max(2, opts.length)}">${esc(v)}</textarea>
    </div>`;
  }
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

/* AIの答えを項目ごとに切り分ける。見出しの表記ゆれ（全角カッコ・■・#）も拾う */
/* AIの答えをそのまま貼ると、改行が「半角バックスラッシュ＋n」の2文字のまま残ることがある。
   半角バックスラッシュは日本語環境で ￥ として表示されるので、貼った先で ￥n に化けて見える。
   振り分ける前にここで直す。
   全角の＼（＼〇〇♪／ の飾り）は社内の型で使うものなので、消さずに残す。 */
/* 正規表現の中では \ 自身を2つ重ねる。1つだと次の文字をエスケープしてしまう */
const BS1 = String.fromCharCode(0x5C), BS2 = BS1 + BS1;
const BSLASH = new RegExp(BS2, 'g');
/* 消さずに、数えて知らせるだけの文字。エアワークの公式一覧には載っていないが、
   社内の型では使っている。掲載されない事故が起きたときの手がかりにする */
const AW_WATCH = [['全角の＼', /＼/g], ['丸囲み数字', /[\u2460-\u2473]/g], ['横線の━', /━/g]];
function awClean(text) {
  let s = String(text).replace(/\r\n?/g, '\n');
  const fixed = [];
  if (/```/.test(s)) { s = s.replace(/```[a-zA-Z]*\n?/g, ''); fixed.push('コードの囲み'); }
  if (/<br\s*\/?>/i.test(s)) { s = s.replace(/<br\s*\/?>/gi, '\n'); fixed.push('<br>'); }
  const escSeq = new RegExp(BS2 + '[nt]', 'g');
  if (escSeq.test(s)) { s = s.replace(escSeq, m => (m[1] === 'n' ? '\n' : ' ')); fixed.push('文字のままの改行'); }
  BSLASH.lastIndex = 0;
  if (BSLASH.test(s)) { s = s.replace(BSLASH, ''); fixed.push('￥に化ける半角記号'); }
  const watch = AW_WATCH.map(([label, re]) => [label, (s.match(re) || []).length]).filter(([, n]) => n > 0);
  return { text: s, fixed, watch };
}

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

async function awCopy(id) {
  const el = $('#' + (id || 'aw-prompt')); if (!el) return;
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
  if (el.id === 'aw-kyoten') {
    /* 画面には「plus-i（187件）」と出しているので、件数を外して拠点だけにする */
    A.kyoten = el.value.replace(/（\d+件）$/, '');
    A.caseId = ''; A.draft = ''; A.fields = null;
  } else if (el.id === 'aw-case') {
    const hit = awCaseList(A.kyoten === '拠点未設定' ? '' : A.kyoten).find(x => awLabel(x) === el.value);
    A.caseId = hit ? hit.id : '';
    A.draft = ''; A.fields = null;
  } else if (el.id === 'aw-draft') { A.draft = el.value; return; }
  else if (el.type === 'checkbox') A[el.id.slice(3)] = el.checked;
  else if (el.type === 'number') A[el.id.slice(3)] = Math.max(1, +el.value || 0);
  else A[el.id.slice(3)] = el.value;
  rerender();
}
/* ねらいのラジオは name で拾う（id を付けていないため） */
document.addEventListener('change', (e) => {
  if (e.target.name === 'aw-aim') { awState().aim = e.target.value; rerender(); }
  if (e.target.name === 'aw-angle') { awState().angle = e.target.value; rerender(); }
  if (e.target.name === 'aw-mode') { awState().mode = e.target.value; rerender(); }
});

/* 貼られた文章を項目ごとに振り分ける */
function awDoSplit() {
  const A = awState(); const text = ($('#aw-draft') || {}).value || '';
  if (!text.trim()) { toast('先にAIの答えを貼ってください', 'warn'); return; }
  const cleaned = awClean(text);
  A.draft = cleaned.text;
  const f = awSplit(cleaned.text);
  if (!f) { toast('見出し（【タイトル】など）が見つからず振り分けられませんでした。手で分けてください', 'warn'); return; }
  A.fields = f;
  const miss = AW_FIELDS.filter(x => !f[x.key]).map(x => x.label);
  rerender();
  if (cleaned.fixed.length) toast(`${cleaned.fixed.join('・')}を直しました`, 'warn');
  /* 消してはいないが、エアワークの公式一覧に無い文字。掲載されないときの手がかりに出す */
  if (cleaned.watch.length) toast(`${cleaned.watch.map(([k, n]) => `${k}${n}個`).join('・')}（そのままにしてあります）`);
  toast(miss.length ? `振り分けました。${miss.join('・')}が見つかりません` : `${AW_FIELDS.length}項目に振り分けました`);
}

/* 項目ごとのコピー */
async function awCopyField(key) {
  const el = document.querySelector(`[data-awf="${key}"]`); if (!el) return;
  const label = (AW_FIELDS.find(x => x.key === key) || {}).label || '';
  try { await navigator.clipboard.writeText(el.value); toast(`${label}をコピーしました`); }
  catch (e) { el.select(); toast('自動コピーができませんでした。Ctrl+C を押してください', 'warn'); }
}

/* 複数案のうち1案だけコピーする */
async function awCopyVariant(key, i) {
  const el = document.querySelector(`[data-awf="${key}"]`); if (!el) return;
  const opts = awVariants(el.value);
  const v = opts[+i]; if (!v) return;
  const label = (AW_FIELDS.find(x => x.key === key) || {}).label || '';
  try { await navigator.clipboard.writeText(v); toast(`${label}の${+i + 1}案目をコピーしました`); }
  catch (e) { toast('自動コピーができませんでした。文字を選んで Ctrl+C を押してください', 'warn'); }
}
