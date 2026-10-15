/* 案件管理システムのマニュアルを2冊つくる（管理者用・担当者用）。
   PCが苦手な人が読む前提なので、文字は大きめ、1手順に1枚の画面写真を付ける。 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, PageBreak,
  TableOfContents, LevelFormat, PageOrientation,
} = require('docx');

const SHOTS = path.join(__dirname, 'shots');
/* 出力先。Wordで開いたままだと上書きできないので、別の場所に出せるようにしておく。
   使い方:  node build-manual.js [出力先フォルダ] */
const OUT = process.argv[2] || __dirname;

const FONT = 'Meiryo';
/* 絵文字はMeiryoに入っていないので、その部分だけフォントを分ける。
   分けないとWordで白黒の□になり、色の説明が成り立たなくなる。 */
const EFONT = 'Segoe UI Emoji';
const NAVY = '1D3B36';
const INK = '1D2B2A';
const GRAY = '5C6660';
const CRIT = 'B03028';
const WARN = '9A6B06';
const OKC = '1F7A52';

/* 画面で使っている色。マニュアルの中でも同じ色を使う */
const TONE = {
  crit: { bg: 'C0392B', label: '至急' },
  warn: { bg: 'B8860B', label: '注意' },
  info: { bg: '50606B', label: 'お知らせ' },
};

const EMOJI = /([\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2460}-\u{24FF}\u{25A0}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]+)/u;

/* 絵文字のところだけ別フォントにして返す */
function runs(text, o = {}) {
  return String(text).split(EMOJI).filter(s => s !== '').map(part => new TextRun({
    text: part,
    font: EMOJI.test(part) ? EFONT : FONT,
    size: o.size ?? 23,
    bold: o.bold,
    color: o.color ?? INK,
  }));
}

/* A4・左右2cm → 本文の幅は約17cm。画像はこれに収まる大きさにする */
const IMG_W = 620;

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/* 画面写真。枠線を付けて、本文と区別がつくようにする */
function shot(name, caption, maxW = IMG_W) {
  const file = path.join(SHOTS, name + '.png');
  const { w, h } = pngSize(file);
  const width = Math.min(maxW, w);
  const height = Math.round(h * width / w);
  const out = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 140, after: caption ? 60 : 200 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: 'C9D2CE' },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9D2CE' },
        left: { style: BorderStyle.SINGLE, size: 6, color: 'C9D2CE' },
        right: { style: BorderStyle.SINGLE, size: 6, color: 'C9D2CE' },
      },
      children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width, height } })],
    }),
  ];
  if (caption) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [new TextRun({ text: '▲ ' + caption, font: FONT, size: 19, color: GRAY })],
    }));
  }
  return out;
}

const P = (text, opt = {}) => new Paragraph({
  spacing: { before: opt.before ?? 60, after: opt.after ?? 120, line: 320 },
  indent: opt.indent,
  alignment: opt.align,
  children: [new TextRun({ text, font: FONT, size: opt.size ?? 23, color: opt.color ?? INK, bold: opt.bold })],
});

/* 太字を混ぜた段落。['ふつう', ['太字', true]] の形で渡す */
const RP = (parts, opt = {}) => new Paragraph({
  spacing: { before: opt.before ?? 60, after: opt.after ?? 120, line: 320 },
  indent: opt.indent,
  children: parts.map(p => Array.isArray(p)
    ? new TextRun({ text: p[0], font: FONT, size: opt.size ?? 23, bold: true, color: p[1] || INK })
    : new TextRun({ text: p, font: FONT, size: opt.size ?? 23, color: INK })),
});

const H1 = text => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 0, after: 240 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 8 } },
  children: [new TextRun({ text, font: FONT, size: 36, bold: true, color: NAVY })],
});

const H2 = text => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 360, after: 160 },
  children: [new TextRun({ text, font: FONT, size: 28, bold: true, color: NAVY })],
});

const H3 = text => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 260, after: 120 },
  children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: INK })],
});

/* 色付きの囲み。注意・ヒント・禁止を見分けやすくする */
function box(kind, title, lines) {
  const color = kind === 'warn' ? CRIT : kind === 'tip' ? OKC : NAVY;
  const bg = kind === 'warn' ? 'FBECEA' : kind === 'tip' ? 'EAF4EE' : 'EDF1F5';
  const kids = [new Paragraph({
    spacing: { before: 40, after: lines.length ? 80 : 40 },
    children: [new TextRun({ text: title, font: FONT, size: 23, bold: true, color })],
  })];
  lines.forEach((t, i) => kids.push(new Paragraph({
    spacing: { before: 0, after: i === lines.length - 1 ? 40 : 60, line: 320 },
    children: [new TextRun({ text: t, font: FONT, size: 22, color: INK })],
  })));
  return new Table({
    width: { size: 9638, type: WidthType.DXA },
    columnWidths: [9638],
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
      left: { style: BorderStyle.SINGLE, size: 24, color },
    },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: 9638, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: bg },
        margins: { top: 120, bottom: 120, left: 200, right: 200 },
        children: kids,
      })],
    })],
  });
}

/* 画面に出る文字をそのまま見せる箱（LINEの通知など） */
function mono(lines) {
  return new Table({
    width: { size: 9638, type: WidthType.DXA },
    columnWidths: [9638],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: 'C9D2CE' },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9D2CE' },
      left: { style: BorderStyle.SINGLE, size: 6, color: 'C9D2CE' },
      right: { style: BorderStyle.SINGLE, size: 6, color: 'C9D2CE' },
    },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: 9638, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: 'F7F9F8' },
        margins: { top: 160, bottom: 160, left: 220, right: 220 },
        children: lines.map(t => new Paragraph({
          spacing: { before: 0, after: 40, line: 300 },
          children: runs(t, { size: 21 }),
        })),
      })],
    })],
  });
}

/* 表。1行目は見出し */
function table(head, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (t, i, isHead) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: isHead ? 'E8EDEA' : 'FFFFFF' },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: String(t).split('\n').map(line => new Paragraph({
      spacing: { before: 0, after: 0, line: 300 },
      children: runs(line, { size: 21, bold: isHead }),
    })),
  });
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'C9D2CE' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9D2CE' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'C9D2CE' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'C9D2CE' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'DCE3DF' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'DCE3DF' },
    },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((t, i) => cell(t, i, true)) }),
      ...rows.map(r => new TableRow({ children: r.map((t, i) => cell(t, i, false)) })),
    ],
  });
}

/* 色そのものを紙の上に出す表。「赤い」と書くより、赤い四角を見せた方が早い。
   rows は [塗る色, 見本に入れる文字, 文字の色, 意味, 対応] の配列 */
function colorTable(head, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const head1 = (t, i) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: 'E8EDEA' },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: runs(t, { size: 21, bold: true }) })],
  });
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'C9D2CE' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9D2CE' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'C9D2CE' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'C9D2CE' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'DCE3DF' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'DCE3DF' },
    },
    rows: [
      new TableRow({ tableHeader: true, children: head.map(head1) }),
      ...rows.map(([fill, sample, fg, ...rest]) => new TableRow({
        children: [
          new TableCell({
            width: { size: widths[0], type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill },
            margins: { top: 140, bottom: 140, left: 120, right: 120 },
            verticalAlign: 'center',
            children: [new Paragraph({
              alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 },
              children: runs(sample, { size: 22, bold: true, color: fg }),
            })],
          }),
          ...rest.map((t, i) => new TableCell({
            width: { size: widths[i + 1], type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: 'FFFFFF' },
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
            verticalAlign: 'center',
            children: String(t).split('\n').map(line => new Paragraph({
              spacing: { before: 0, after: 0, line: 300 },
              children: runs(line, { size: 21 }),
            })),
          })),
        ],
      })),
    ],
  });
}

/* 手順。章ごとに番号を1から振り直したいので instance を分ける */
let INST = 0;
function steps(items) {
  const instance = ++INST;
  return items.map(t => new Paragraph({
    numbering: { reference: 'steps', level: 0, instance },
    spacing: { before: 80, after: 80, line: 320 },
    children: Array.isArray(t)
      ? t.map(p => Array.isArray(p)
        ? new TextRun({ text: p[0], font: FONT, size: 23, bold: true, color: p[1] || INK })
        : new TextRun({ text: p, font: FONT, size: 23, color: INK }))
      : [new TextRun({ text: t, font: FONT, size: 23, color: INK })],
  }));
}

function bullets(items) {
  return items.map(t => new Paragraph({
    numbering: { reference: 'dots', level: 0, instance: 0 },
    spacing: { before: 40, after: 40, line: 320 },
    children: [new TextRun({ text: t, font: FONT, size: 23, color: INK })],
  }));
}

const BREAK = () => new Paragraph({ children: [new PageBreak()] });
const GAP = (after = 160) => new Paragraph({ spacing: { after }, children: [] });

/* 画面で使われている色の一覧。2冊とも同じものを載せる */
function COLOR_LEGEND() {
  return [
    colorTable(
      ['色', 'どこに出るか', '意味'],
      [
        ['B3261E', '赤', 'FFFFFF', '「面接・進捗報告：停止」\n未入力の欄の枠', '止まっています。すぐ手を打ってください'],
        ['94600E', '黄土色', 'FFFFFF', '案件一覧のいちばん上の帯\n「上申から○日」', '遅れています。数日のうちに'],
        ['2A7549', '緑', 'FFFFFF', '「入力ずみ」のバッジ\n進捗の丸', '終わっています。手は不要です'],
        ['224C74', '紺', 'FFFFFF', '押せるボタン\nいま開いているタブ', 'ここを押してください'],
        ['E8EDEA', '灰色', '5C6660', '押せないボタン\n「これから」の進捗', 'まだ押せません。横に理由が出ています'],
      ],
      [1500, 3600, 4538],
    ),
    GAP(200),
    box('tip', '進捗の丸の色', [
      '案件の画面の左にある「進捗」では、緑＝終わった、オレンジ＝いまここ、灰色＝これから、を表します。',
      'オレンジの「いま ここ」を見れば、その案件が次に何をすべき状態なのかが分かります。',
    ]),
  ];
}

function cover(title, sub, who) {
  return [
    GAP(2600),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: [new TextRun({ text: '株式会社bring', font: FONT, size: 24, color: GRAY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 100 },
      children: [new TextRun({ text: title, font: FONT, size: 52, bold: true, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 420 },
      children: [new TextRun({ text: sub, font: FONT, size: 34, bold: true, color: INK })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 1400 },
      children: [new TextRun({ text: who, font: FONT, size: 24, color: GRAY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 60 },
      children: [new TextRun({ text: 'システムのURL', font: FONT, size: 20, color: GRAY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 300 },
      children: [new TextRun({ text: 'https://rdbusinessunit.github.io/anken-kanri/', font: FONT, size: 22, bold: true, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '2026年10月版', font: FONT, size: 20, color: GRAY })],
    }),
    BREAK(),
  ];
}

function toc() {
  return [
    H1('目次'),
    new TableOfContents('目次', { hyperlink: true, headingStyleRange: '1-2' }),
    new Paragraph({
      spacing: { before: 300 },
      children: [new TextRun({ text: '※ 目次の数字は、Wordで「更新」すると入ります。目次を右クリック →「フィールド更新」。', font: FONT, size: 20, color: GRAY })],
    }),
    BREAK(),
  ];
}

const docOptions = {
  styles: {
    default: {
      document: { run: { font: FONT, size: 23, color: INK } },
      heading1: { run: { font: FONT, size: 36, bold: true, color: NAVY } },
      heading2: { run: { font: FONT, size: 28, bold: true, color: NAVY } },
      heading3: { run: { font: FONT, size: 24, bold: true, color: INK } },
    },
  },
  numbering: {
    config: [
      {
        reference: 'steps',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 560, hanging: 360 } }, run: { bold: true, color: NAVY, font: FONT, size: 23 } },
        }],
      },
      {
        reference: 'dots',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '\u25CF', alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 560, hanging: 300 } }, run: { color: NAVY, font: FONT, size: 18 } },
        }],
      },
    ],
  },
};

const section = children => ({
  properties: {
    page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
    },
  },
  children,
});

/* ============================================================
   1冊目：管理者ガイド
   ============================================================ */
function adminDoc() {
  const c = [];
  c.push(...cover('案件管理システム', '管理者ガイド', '所長・管理本部・経理・決済のみなさま'));
  c.push(...toc());

  c.push(H1('1. このシステムは何をするものか'));
  c.push(P('受注した案件を登録し、稟議で決裁をとり、求人を出すまでを1か所にまとめたシステムです。紙やExcelでばらばらに持っていた情報を、同じ画面で全員が見られるようにしてあります。'));
  c.push(GAP(60));
  c.push(mono(['受注　→　①簡易求人　→　②稟議　→　承認　→　③詳細　→　面接・進捗報告']));
  c.push(GAP(200));
  c.push(P('管理者のみなさまがこのシステムで行うのは、おもに次の3つです。'));
  c.push(table(
    ['やること', 'どこで', 'どのくらい'],
    [
      ['LINEの通知を見る', 'スマホのLINE', '月・水・金の朝8時'],
      ['稟議を承認する・差し戻す', '案件の「② 稟議」', '通知が来たとき'],
      ['設定を変える（担当者・金額のルールなど）', '「設定」', 'ときどき'],
    ],
    [4200, 3200, 2238],
  ));
  c.push(GAP(240));
  c.push(box('tip', '入力はしなくて大丈夫です', [
    '案件の中身を入力するのは営業担当の仕事です。管理者は「見る」と「承認する」だけで使えます。',
    '間違って文字を変えてしまっても、画面の下に出る「取り消す」を押せば元に戻ります。',
  ]));
  c.push(BREAK());

  c.push(H1('2. いちばん最初にすること'));
  c.push(H2('自分の名前を選ぶ'));
  c.push(P('システムを開いたら、画面の右上にある「入力者」から自分の名前を選んでください。'));
  c.push(box('warn', 'これを選ばないと承認できません', [
    '承認したときに押される「ハンコ」には、ここで選んだ名前が入ります。',
    '選んでいないと「未選択」と表示され、誰が承認したのか分からなくなります。',
    '一度選べば、同じパソコンでは次回から覚えています。',
  ]));
  c.push(...shot('case-tabs', '画面の右上に「入力者」の欄があります'));
  c.push(BREAK());

  c.push(H1('3. 毎回やること① LINEの通知を見る'));
  c.push(P('月・水・金の朝8時に、対応が必要な案件だけをLINEでお知らせします。該当する案件が1件もない日は届きません。届かない日は「問題なし」という意味です。'));
  c.push(H2('届くメッセージの例'));
  c.push(mono([
    '【案件管理】全担当のまとめ',
    '2026-10-16　対応が必要な案件 2件',
    '',
    '──────────',
    '▼ 第一熱処理工業株式会社 成田工場',
    'plus-i／担当 川住',
    '🔴 ③詳細が未入力のため、面接・進捗報告は停止中',
    '🟡 課題が2件、未着手のままです',
    'https://rdbusinessunit.github.io/anken-kanri/#/case/daiichi-narita',
    '',
    '──────────',
    '▼ 富双合成株式会社 久喜工場',
    'plus-i／担当 藤井',
    '🟡 上申から5日、決裁が止まっています',
    'https://rdbusinessunit.github.io/anken-kanri/#/case/fuso-kuki',
  ]));
  c.push(GAP(240));
  c.push(H2('印の意味'));
  c.push(P('メッセージの先頭に付く丸い印で、急ぎ具合が分かります。下の色が実際に届く色です。'));
  c.push(colorTable(
    ['LINEの印', '意味', 'いつまでに'],
    [
      [TONE.crit.bg, '🔴  赤', 'FFFFFF', '至急。業務が止まっています', 'その日のうちに見てください'],
      [TONE.warn.bg, '🟡  黄', 'FFFFFF', '注意。遅れが出ています', '数日のうちに見てください'],
      [TONE.info.bg, '🔵  青', 'FFFFFF', 'お知らせ。もうすぐ期限です', '覚えておけば大丈夫です'],
    ],
    [1700, 3900, 4038],
  ));
  c.push(GAP(240));
  c.push(box('tip', 'リンクを押すとその案件が開きます', [
    'メッセージの下にあるURLを押すと、その案件の画面がそのまま開きます。',
    '案件を探す必要はありません。',
  ]));
  c.push(BREAK());

  c.push(H1('4. 毎回やること② 稟議を承認する'));
  c.push(P('稟議が上申されると、案件一覧のいちばん上に黄色い帯で出ます。LINEの通知からも開けます。'));
  c.push(...shot('alert-banner', '「いま対応が必要な案件」。右の「開く →」を押します'));

  c.push(H2('手順'));
  c.push(...steps([
    [['案件一覧', NAVY], 'の黄色い帯にある「開く →」を押します。LINEの通知のURLからでも同じ画面が開きます。'],
    [['② 稟議', NAVY], 'のタブを押します。'],
    ['内容を確認します。取引状況・契約の種別・単価・契約期間などが並んでいます。'],
    ['画面の左下にある「稟議の決裁」まで下にスクロールします。'],
    [['自分の役割のボタン', NAVY], 'を押します（例：所長の方は「所長として承認」）。'],
  ]));
  c.push(...shot('ringi-approve', '「稟議の決裁」。全員が承認すると決裁になります', 340));

  c.push(H2('差し戻すとき'));
  c.push(P('内容に問題があるときは、コメント欄に理由を書いてから「差戻し」を押してください。'));
  c.push(box('warn', '理由は必ず書いてください', [
    '差し戻された営業担当には、理由がそのまま表示されます。',
    '理由がないと、何を直せばよいのか分からず、やり取りが増えてしまいます。',
  ]));

  c.push(H2('全員が承認すると'));
  c.push(...bullets([
    '案件の状態が「承認」に変わります。',
    '営業担当が「③ 詳細・勤務説明」を入力できるようになります。',
    '③が入力されるまで、面接と進捗報告は止まったままです。',
  ]));
  c.push(...shot('case-progress', '左側の「進捗」。いまどこまで進んでいるかが一目で分かります', 340));
  c.push(BREAK());

  c.push(H1('5. 案件一覧の見方'));
  c.push(...shot('cases', '案件一覧。上から新しい順に並びます'));
  c.push(table(
    ['列', '意味'],
    [
      ['案件', '企業名と就業先。その下に拠点・営業担当・受注日'],
      ['段階', 'いまどこまで進んでいるか（受注登録／決裁待ち／導入前の既存案件 など）'],
      ['原価率', '支払単価 ÷ 請求単価。しきい値（65%）以下なら稟議の前に求人を出せます'],
      ['面接', '面接・進捗報告ができる状態か。「停止」は③が未入力という意味です'],
      ['求人数', 'いま出ている求人の件数'],
      ['応募', '直近3か月の応募数'],
      ['更新', '最後に誰がいつ触ったか'],
    ],
    [1800, 7838],
  ));
  c.push(GAP(240));
  c.push(P('上のボタンで拠点をしぼれます。「担当」「段階」や検索欄でも絞り込めます。'));

  c.push(H2('画面の色のきまり'));
  c.push(P('システムは色で状態を伝えます。文字を読まなくても、色だけで急ぎ具合が分かるようにしてあります。下の色が実際の画面の色です。'));
  c.push(...COLOR_LEGEND());
  c.push(BREAK());

  c.push(H1('6. 設定を変える'));
  c.push(P('「設定」は全員で共通です。ここを変えると、全員の画面が変わります。'));
  c.push(box('warn', '変更したらすぐ反映されます', [
    '設定を変えると、他の人の画面にも20秒ほどで反映されます。',
    '試しに変えてそのままにしないよう、気をつけてください。',
  ]));

  c.push(H2('担当者・拠点を増やす／減らす'));
  c.push(P('「担当者」の欄に1行1人で名前を書きます。ここに書いた人が、案件の「営業担当」やLINE通知の割り当ての選択肢になります。'));
  c.push(...shot('set-staff', '「拠点」と「担当者」。1行に1つずつ書きます'));
  c.push(P('書き終えたら、画面右上の「設定を保存」を押してください。'));

  c.push(H2('金額や日数のルール'));
  c.push(...shot('set-rules', '「稟議の承認者」と「ルール」'));
  c.push(table(
    ['項目', '意味'],
    [
      ['稟議の承認者', '役割｜名前 の形で1行ずつ。ここに書いた全員が承認すると決裁になります。\n稟議書の押印欄の並び順にもなります'],
      ['原価率しきい値', 'この値以下なら、稟議の前に求人を出してよい、という境目。既定は65%'],
      ['求人の修正間隔', '求人を何日ごとに手直しするか。既定は14日'],
      ['稟議の遅れ警告', '上申してから何日で「止まっている」と通知するか。既定は3日'],
    ],
    [2400, 7238],
  ));

  c.push(H2('LINE通知'));
  c.push(...shot('set-line', 'LINE通知の設定。受け取る人がここに自動で並びます'));
  c.push(table(
    ['項目', '意味'],
    [
      ['送信', '「送らない」にすると、宛先を消さずに通知だけ止められます'],
      ['送る曜日', '毎日／平日／月・水・金 から選べます。少ないほど多くの人に配れます'],
      ['受け取り方', '「自分の担当分だけ」は営業担当向け。「全担当のまとめ」は管理者向けです'],
      ['この人は誰？', 'LINEの表示名と、システムの担当者名を結びつけます。\n「全担当のまとめ」の人は選ばなくて構いません'],
    ],
    [2400, 7238],
  ));
  c.push(GAP(200));
  c.push(box('warn', 'LINEは月200通まで（無料）', [
    '1通＝1人ぶんで数えます。送る回数ではなく、受け取る人数の分だけ減ります。',
    '毎日なら6人、平日なら8人、月・水・金なら14人まで無料に収まります。',
    '画面の下の緑の枠に「あと何人増やせるか」が出ます。超えそうになると赤くなります。',
  ]));

  c.push(H2('バックアップ'));
  c.push(...shot('set-backup', '「JSONで保存」を押すとファイルがダウンロードされます', 420));
  c.push(P('月に1回ほど、「JSONで保存」を押してファイルを保存しておくことをおすすめします。全案件・掲載・設定がまとめて1つのファイルになります。'));
  c.push(BREAK());

  c.push(H1('7. 新しい人に通知を届ける'));
  c.push(...steps([
    ['会社のLINE公式アカウントのQRコードを、その人に渡します。'],
    ['その人のスマホのLINEで読み取って、友だち追加してもらいます。'],
    ['「友だち追加ありがとうございます」と返信が来れば登録できています。'],
    [['設定 → LINE通知', NAVY], 'を開くと、その人の名前（LINEの表示名）が自動で並んでいます。'],
    ['「受け取り方」と「この人は誰？」を選びます。', ['選んだ瞬間に保存されます。', CRIT]],
  ]));
  c.push(box('tip', 'QRコードの場所', [
    'LINE Developers → 作成したチャネル →「Messaging API設定」タブにあります。',
    '分からないときは、システムを作った担当にお尋ねください。',
  ]));
  c.push(BREAK());

  c.push(H1('8. 困ったとき'));
  c.push(table(
    ['こうなった', 'こうしてください'],
    [
      ['LINEが届かない', 'その日は対応が必要な案件がなかっただけかもしれません。\nシステムを開いて、黄色い帯が出ているか確かめてください。\n帯が出ているのに届かない場合は、システム担当にご連絡ください'],
      ['画面の上に「接続できません」と赤く出る', 'インターネットにつながっていない可能性があります。\n赤い帯の「再接続」を押してください。それでも直らなければ、\nしばらく待ってから画面を開き直してください'],
      ['間違えて文字を変えてしまった', '画面の下に出る「取り消す」を押せば、元に戻ります'],
      ['承認ボタンが押せない', '画面の右上で「入力者」を選んでいないと押せません'],
      ['表示が暗くて見づらい', '画面の右上「表示」を「ライト」にすると明るくなります'],
      ['文字が小さい', 'キーボードの Ctrl キーを押しながら「＋」を押すと大きくなります。\n元に戻すときは Ctrl と「0」です'],
    ],
    [2900, 6738],
  ));
  c.push(GAP(300));
  c.push(box('tip', 'それでも分からないとき', [
    'システムを作った担当にご連絡ください。画面の写真を撮って送っていただけると早く解決できます。',
  ]));

  return new Document({ ...docOptions, sections: [section(c)] });
}

/* ============================================================
   2冊目：担当者ガイド
   ============================================================ */
function staffDoc() {
  const c = [];
  c.push(...cover('案件管理システム', '操作ガイド', '営業担当・RD担当のみなさま'));
  c.push(...toc());

  c.push(H1('1. 全体の流れ'));
  c.push(P('受注してから求人を出すまで、次の順番で進みます。この順番どおりに画面のタブが並んでいます。'));
  c.push(GAP(60));
  c.push(mono([
    '受注を登録',
    '　↓',
    '① 簡易求人を入力　→　RDへ発注（原価率が65%以下ならここで出せます）',
    '　↓',
    '② 稟議を上申　→　所長・管理本部・経理・決済が承認',
    '　↓',
    '③ 詳細・勤務説明を入力　→　入力完了を押す',
    '　↓',
    '面接・進捗報告をはじめる',
  ]));
  c.push(GAP(240));
  c.push(box('warn', '③を入力するまで面接できません', [
    '稟議が承認されても、③が未入力のままだと面接と進捗報告は止まったままです。',
    '承認されたらすぐ③を入力してください。',
  ]));

  c.push(H2('画面の色のきまり'));
  c.push(P('システムは色で状態を伝えます。文字を読まなくても、色だけで急ぎ具合が分かるようにしてあります。下の色が実際の画面の色です。'));
  c.push(...COLOR_LEGEND());
  c.push(BREAK());

  c.push(H1('2. いちばん最初にすること'));
  c.push(P('画面の右上にある「入力者」から、自分の名前を選んでください。誰が入力したかの記録に使われます。一度選べば次回から覚えています。'));
  c.push(box('warn', '名前が出てこないときは', [
    '「設定 →担当者」に自分の名前が登録されていません。管理者に追加してもらってください。',
  ]));
  c.push(...shot('case-tabs', '右上の「入力者」で自分の名前を選びます'));
  c.push(BREAK());

  c.push(H1('3. 新規受注を登録する'));
  c.push(...steps([
    ['画面の上の「新規受注」を押します。案件一覧の右上の「＋ 新規受注を登録」でも同じです。'],
    ['拠点・営業担当・受注日・企業名・就業先を入れます。'],
    [['必須', CRIT], 'と赤く付いている欄は、空のままだと先に進めません。'],
    ['入れ終わったら、画面の下に出る', ['「受注登録する」', NAVY], 'を押します。'],
  ]));
  c.push(...shot('new-top', '新規受注の画面'));
  c.push(box('tip', '途中でやめても消えません', [
    '入力の途中で他の画面に移っても、入力した内容は覚えています。戻ってくれば続きから入れられます。',
    'やり直したいときは、画面の下の「取り消す」を押してください。',
  ]));
  c.push(BREAK());

  c.push(H1('4. ① 簡易求人を入れて発注する'));
  c.push(P('求人を出すために最低限必要な内容を入れるところです。仕事内容・勤務時間・時給・請求単価などを入れます。'));
  c.push(...shot('case-a1', '「① 簡易求人」のタブ'));
  c.push(H2('原価率で分かれます'));
  c.push(P('請求単価と時給を入れると、原価率が自動で計算されます。この値で、求人をいつ出せるかが決まります。'));
  c.push(table(
    ['原価率', 'どうなるか'],
    [
      ['65%以下', '稟議の前に求人を出せます。「① 簡易求人をRDへ発注」のボタンが押せるようになります'],
      ['65%より上', '稟議が承認されるまで求人を出せません。③と同時に発注することになります'],
    ],
    [1800, 7838],
  ));
  c.push(GAP(200));
  c.push(box('tip', 'ボタンが押せないとき', [
    'ボタンの横に理由が出ています。足りない欄が書いてあるので、そこを埋めてください。',
    '未保存の変更があるときも押せません。先に「保存する」を押してください。',
  ]));
  c.push(BREAK());

  c.push(H1('5. ② 稟議を上申する'));
  c.push(...steps([
    [['② 稟議', NAVY], 'のタブを押します。'],
    ['取引状況・稟議種別・契約の種別・契約期間・単価などを入れます。'],
    ['「所見」に、現況と起案者の意見を書きます。'],
    ['画面の下の', ['「保存する」', NAVY], 'を押します。'],
    ['左側の', ['「② 稟議を上申」', NAVY], 'を押します。'],
  ]));
  c.push(...shot('case-a2', '「② 稟議」のタブ'));
  c.push(H2('差し戻されたら'));
  c.push(P('承認者が差し戻すと、案件の状態が「差戻し」になり、理由がコメントとして残ります。理由を読んで直したあと、「② 稟議を再上申」を押してください。'));
  c.push(H2('いま誰が承認したか'));
  c.push(P('左下の「稟議の決裁」で、誰が承認済みかが分かります。丸の中が「未」なら、まだその人は承認していません。'));
  c.push(...shot('ringi-approve', '承認の状況。全員そろうと決裁になります', 340));
  c.push(BREAK());

  c.push(H1('6. ③ 詳細・勤務説明を入力する'));
  c.push(P('稟議が承認されたら入力できるようになります。勤務説明書に載せる内容を入れるところです。'));
  c.push(...shot('case-a3', '「③ 詳細・勤務説明」のタブ'));
  c.push(...steps([
    ['必要な欄を埋めます。タブに「入力 2/10」のように、あといくつ残っているかが出ます。'],
    ['画面の下の', ['「保存する」', NAVY], 'を押します。'],
    ['左側の', ['「③ 入力完了（面接・進捗報告を開始）」', NAVY], 'を押します。'],
  ]));
  c.push(box('warn', 'このボタンを押すまで面接は止まったままです', [
    '保存しただけでは「入力完了」になりません。必ずボタンを押してください。',
    '押すと、案件一覧の「面接」の列が「停止」から変わります。',
  ]));
  c.push(BREAK());

  c.push(H1('7. 現場実態を残す'));
  c.push(P('工場見学で見たことを残すところです。次に同じ現場を担当する人が、行かなくても様子が分かるようにするためのものです。'));
  c.push(...shot('case-kg', '「現場実態」のタブ'));
  c.push(BREAK());

  c.push(H1('8. 課題と対応を残す'));
  c.push(P('「応募が来ない」「時給が相場より低い」といった問題と、やってみた対応、効いたかどうかを残します。'));
  c.push(...steps([
    [['履歴・管理', NAVY], 'のタブを押します。'],
    ['左のプルダウンで種類を選びます。8種類あります。'],
    ['右の欄に何が問題かを書きます。例：クリックはあるのに応募が0'],
    [['「課題を追加」', NAVY], 'を押します。'],
    ['対応したら、その課題に対応内容を追記します。解決したら「解決」にします。'],
  ]));
  c.push(...shot('case-issues', '「課題と対応」。未解決の数はタブに赤く出ます'));
  c.push(table(
    ['種類', 'こんなとき'],
    [
      ['時給', '相場より低い、近隣に負けている'],
      ['勤務形態', '交替制・夜勤など、勤務の形が応募の妨げになっている'],
      ['仕事内容', '仕事がきつい、内容が伝わっていない'],
      ['年齢条件', '年齢で合わない応募が多い'],
      ['掲載・媒体', '出している媒体が合っていない、掲載が止まっている'],
      ['原稿', 'タイトルや本文に問題がある'],
      ['職場環境', '現場の環境が理由で続かない'],
      ['その他', '上のどれにも当てはまらない'],
    ],
    [1900, 7738],
  ));
  c.push(GAP(200));
  c.push(box('tip', 'なぜ残すのか', [
    '未解決の課題があると、LINEの通知に出ます。放置されないようにするためです。',
    '次に同じ案件を見る人が、過去の経緯から判断できるようになります。',
  ]));
  c.push(BREAK());

  c.push(H1('9. 書類を印刷する'));
  c.push(P('入力した内容から、紙の書類を自動で作れます。もう一度入力し直す必要はありません。'));
  c.push(...steps([
    ['案件の画面の右上にある', ['「書類を作る（稟議書・勤務説明書）」', NAVY], 'を押します。'],
    ['上のタブで書類の種類を選びます。'],
    ['印刷するときは、キーボードの Ctrl キーを押しながら「P」を押します。'],
  ]));
  c.push(table(
    ['書類', '中身'],
    [
      ['契約稟議書', '稟議にかけるための書類。押印欄は「設定 → 稟議の承認者」の並び順になります'],
      ['ヒアリングシート', '新規受注時に聞き取った内容'],
      ['勤務説明書', '就業条件の説明書。③で入れた内容から作られます'],
      ['簡易求人票', '①の内容から作った求人の原稿'],
    ],
    [2200, 7438],
  ));
  c.push(...shot('doc-ringi', '契約稟議書。そのまま印刷できます'));
  c.push(BREAK());

  c.push(H1('10. 求人管理を見る'));
  c.push(P('どの拠点で・どの案件が・どの媒体に何件出ているかをまとめた画面です。'));
  c.push(...shot('postings-top', '「求人管理」の画面'));
  c.push(...bullets([
    '媒体の行を押すと、その媒体に出ている案件の一覧に切り替わります。',
    '表示・クリック・応募・費用は、取り込んだCSVから自動で集計されます。',
    '求人の修正日が近づくと、LINEの通知でお知らせします。',
  ]));
  c.push(BREAK());

  c.push(H1('11. 成績ボードにCSVを取り込む'));
  c.push(P('エアワーク（Indeed）と求人BOXの成績CSVを取り込んで、どの求人を直すべきか優先順位をつける画面です。画面の上の「成績ボード」から開きます。'));
  c.push(...shot('board-import', '拠点ごとの取り込みボタン。上4つがエアワーク、下3つが相互'));
  c.push(H2('取り込みかた'));
  c.push(...steps([
    ['取り込みたい拠点のボタンを押します（plus-i／plus-c／next／up／plus相互／next相互／up相互）。'],
    ['ダウンロードしたCSVファイルを選びます。'],
    ['内容を確認して取り込みます。'],
  ]));
  c.push(box('tip', 'まとめて取り込むこともできます', [
    'いちばん上の「CSVをまとめて選ぶ」を使うと、複数の拠点のCSVを一度に選べます。',
    '種類は列の名前から自動で判定し、拠点はファイル名の広告番号から割り当てます。',
  ]));
  c.push(...shot('board-list', '優先度の高い順に並びます。赤いほど手直しが必要です'));
  c.push(...bullets([
    '「優先度」は、表示数・応募数・クリック率から自動で決まります。',
    'チェックを入れて、まとめて「修正日として登録」や削除ができます。',
    '古くなった求人は「全件削除」で消せます。消す前に確認のメッセージが出ます。',
  ]));
  c.push(BREAK());

  c.push(H1('12. LINEで通知を受け取る'));
  c.push(P('月・水・金の朝8時に、自分が担当している案件のうち対応が必要なものだけが届きます。該当がない日は届きません。'));
  c.push(H2('受け取るには'));
  c.push(...steps([
    ['会社のLINE公式アカウントのQRコードを、管理者から受け取ります。'],
    ['スマホのLINEで読み取って、友だち追加します。'],
    ['「友だち追加ありがとうございます」と返信が来れば登録できています。'],
    ['管理者に、自分の名前を割り当ててもらいます。'],
  ]));
  c.push(H2('届くメッセージ'));
  c.push(mono([
    '【案件管理】川住 さんの案件',
    '2026-10-16　対応が必要な案件 1件',
    '',
    '──────────',
    '▼ 第一熱処理工業株式会社 成田工場',
    'plus-i／担当 川住',
    '🟡 Airワークの求人修正日を3日超過',
    'https://rdbusinessunit.github.io/anken-kanri/#/case/daiichi-narita',
  ]));
  c.push(GAP(200));
  c.push(P('URLを押すと、その案件がそのまま開きます。'));
  c.push(H2('印の意味'));
  c.push(colorTable(
    ['LINEの印', '意味', 'いつまでに'],
    [
      [TONE.crit.bg, '🔴  赤', 'FFFFFF', '至急。業務が止まっています', 'その日のうちに'],
      [TONE.warn.bg, '🟡  黄', 'FFFFFF', '注意。遅れが出ています', '数日のうちに'],
      [TONE.info.bg, '🔵  青', 'FFFFFF', 'お知らせ。もうすぐ期限です', '覚えておけば大丈夫'],
    ],
    [1700, 3900, 4038],
  ));
  c.push(BREAK());

  c.push(H1('13. 困ったとき'));
  c.push(table(
    ['こうなった', 'こうしてください'],
    [
      ['ボタンが押せない（灰色）', 'ボタンの横に理由が出ています。足りない欄を埋めてください。\n未保存の変更があるときも押せません。先に「保存する」を押します'],
      ['赤枠が消えない', '必須の欄が空です。赤い枠の欄を埋めてください'],
      ['入力した内容が消えた', '画面は20秒ごとに自動で最新になります。入力したら、\nこまめに「保存する」を押してください'],
      ['保存したのに他の人に見えない', '相手の画面が最新になるまで20秒ほどかかります。少し待ってください'],
      ['画面の上に「接続できません」と赤く出る', 'インターネットにつながっていない可能性があります。\n赤い帯の「再接続」を押してください'],
      ['変更理由を聞かれる', 'すでにRDへ発注した案件や、稟議を上申したあとの案件を変えるときは、\n理由の入力が必須です。何を・なぜ変えたのかを短く書いてください'],
      ['印刷すると文字が切れる', '印刷の設定で「用紙に合わせる」または「縮小」を選んでください'],
      ['文字が小さい', 'Ctrl キーを押しながら「＋」で大きくなります。元に戻すのは Ctrl と「0」です'],
    ],
    [2900, 6738],
  ));
  c.push(GAP(300));
  c.push(box('tip', 'それでも分からないとき', [
    'システムを作った担当にご連絡ください。画面の写真を撮って送っていただけると早く解決できます。',
  ]));

  return new Document({ ...docOptions, sections: [section(c)] });
}

/* ============================================================ */
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const jobs = [
    ['案件管理システム_管理者ガイド.docx', adminDoc()],
    ['案件管理システム_操作ガイド_担当者用.docx', staffDoc()],
  ];
  for (const [name, doc] of jobs) {
    const buf = await Packer.toBuffer(doc);
    const file = path.join(OUT, name);
    fs.writeFileSync(file, buf);
    console.log(`  ${name}  ${(buf.length / 1024).toFixed(0)} KB`);
  }
})();
