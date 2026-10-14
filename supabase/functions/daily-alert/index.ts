/* 毎朝、担当者ごとに「対応が必要な案件」をメールで送る。
 *
 * Supabase の定期実行（Supabase Cron）から呼ばれます。誰も画面を開いていなくても動きます。
 * 判定の中身は画面側の core.js の alertsFor() と同じです。片方だけ直すとズレるので、
 * 条件を変えるときは両方を直してください。
 *
 * 必要なシークレット（Supabase の Edge Functions > Secrets に登録）
 *   SUPABASE_URL            … プロジェクトのURL（既定で入っています）
 *   SUPABASE_SERVICE_ROLE_KEY … 既定で入っています
 *   RESEND_API_KEY          … メール送信サービスのAPIキー
 *   MAIL_FROM               … 差出人（例: 案件管理システム <onboarding@resend.dev>）
 */

type Json = Record<string, unknown>;

const SB_URL = Deno.env.get("SUPABASE_URL")!;
/* データを読むための鍵。Supabaseが自動で入れる環境変数は、プロジェクトの作成時期で
   名前が違う（新しい方式は SUPABASE_SECRET_KEYS に JSON で入る）。どちらでも動くようにする。 */
function serviceKey(): string {
  const plain = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (plain) return plain;
  const json = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (json) {
    try {
      const o = JSON.parse(json);
      const v = Object.values(o).find((x) => typeof x === "string" && x);
      if (typeof v === "string") return v;
    } catch { /* 形式が違えば次へ */ }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}
const ENV_KEY = serviceKey();
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "";
/* 画面のURL。メールから案件を直接開けるようにする */
const APP_URL = Deno.env.get("APP_URL") ?? "https://rdbusinessunit.github.io/anken-kanri/";

const JST = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000);
const today = () => JST().toISOString().slice(0, 10);
const dateOf = (s: unknown) => (s ? new Date(String(s)) : null);
const daysSince = (s: unknown) => {
  const d = dateOf(s);
  return d ? Math.floor((JST().getTime() - d.getTime()) / 86400000) : 0;
};
const daysUntil = (s: unknown) => {
  const d = dateOf(s);
  return d ? Math.ceil((d.getTime() - JST().getTime()) / 86400000) : 0;
};

async function loadColl(coll: string, key: string) {
  const out: Json[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${SB_URL}/rest/v1/anken_docs?select=id,data&coll=eq.${coll}&order=id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` } },
    );
    if (!res.ok) throw new Error(`${coll} を読めませんでした: ${res.status}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

/* core.js の alertsFor() と同じ判定 */
function alertsFor(c: any, postings: any[], ringiDays: number) {
  const a: { tone: string; text: string }[] = [];
  const f = c.flow ?? {};
  if (f.closed) return a;
  if (!c.legacy) {
    if (f.area1?.done && f.ringi?.state === "未上申") {
      const d = daysSince(f.area1.at);
      a.push({ tone: d >= ringiDays ? "crit" : "warn", text: `簡易求人の発注から${d}日、稟議が未上申` });
    }
    if (f.ringi?.state === "差戻し") a.push({ tone: "warn", text: "稟議が差し戻されています。修正して再上申してください" });
    if (f.ringi?.state === "上申中") {
      const d = daysSince(f.ringi.submittedAt);
      if (d >= ringiDays) a.push({ tone: "warn", text: `上申から${d}日、決裁が止まっています` });
    }
    if (f.ringi?.state === "承認" && !f.area3?.done) {
      a.push({ tone: "crit", text: "③詳細が未入力のため、面接・進捗報告は停止中" });
    }
  }
  /* 承認後の条件変更とRD未確認は、画面には出すがメールでは送らない（運用で決定） */
  const openIssues = (c.issues ?? []).filter((i: any) => i.state === "open").length;
  if (openIssues) a.push({ tone: "warn", text: `課題が${openIssues}件、未着手のままです` });
  for (const p of postings) {
    if (p.caseId !== c.id || p.status === "停止" || !p.nextFix) continue;
    const d = daysUntil(p.nextFix);
    if (d < 0) a.push({ tone: "warn", text: `${p.media}の求人修正日を${-d}日超過` });
    else if (d <= 3) a.push({ tone: "info", text: `${p.media}の求人修正日まであと${d}日` });
  }
  return a;
}

const caseName = (c: any) =>
  [c.company?.name, c.company?.plant].filter(Boolean).join(" ") || "（名称未設定）";
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]!));

const TONE_LABEL: Record<string, string> = { crit: "至急", warn: "注意", info: "お知らせ" };
const TONE_BG: Record<string, string> = { crit: "#C0392B", warn: "#B8860B", info: "#50606B" };

function body(rows: { c: any; alerts: { tone: string; text: string }[] }[], title: string) {
  const items = rows.map(({ c, alerts }) => `
    <tr><td style="padding:14px 16px;border-bottom:1px solid #E2E7E4">
      <div style="font-size:17px;font-weight:700;color:#1D2B2A">${esc(caseName(c))}</div>
      <div style="font-size:13px;color:#5C6660;margin:2px 0 8px">${esc(c.kyoten ?? "")}　担当 ${esc(c.tanto ?? "")}</div>
      ${alerts.map((a) =>
        `<div style="margin:4px 0"><span style="display:inline-block;background:${TONE_BG[a.tone] ?? "#50606B"};color:#fff;font-size:12px;font-weight:700;padding:2px 9px;border-radius:10px">${TONE_LABEL[a.tone] ?? "確認"}</span>
         <span style="font-size:15px;color:#1D2B2A">　${esc(a.text)}</span></div>`).join("")}
      <div style="margin-top:8px"><a href="${APP_URL}#/case/${esc(c.id)}" style="font-size:14px;color:#1D3B36;font-weight:700">この案件を開く →</a></div>
    </td></tr>`).join("");
  return `<div style="font-family:'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;background:#EEF1EE;padding:20px">
    <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden">
      <div style="background:#1D3B36;color:#fff;padding:16px 18px">
        <div style="font-size:12px;letter-spacing:.1em;opacity:.8">案件管理システム</div>
        <div style="font-size:19px;font-weight:700;margin-top:2px">${esc(title)}</div>
        <div style="font-size:13px;opacity:.85;margin-top:4px">${today()}　対応が必要な案件 ${rows.length}件</div>
      </div>
      <table style="width:100%;border-collapse:collapse">${items}</table>
      <div style="padding:14px 16px;font-size:12px;color:#5C6660">
        送信を止めるときは、システムの「設定 → 通知メール」で「送らない」にしてください。
      </div>
    </div></div>`;
}

async function send(to: string[], subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`送信に失敗: ${res.status} ${await res.text()}`);
}

Deno.serve(async (req) => {
  try {
    /* 呼び出し元が付けてきた鍵を使う。cronはservice key、手動テストはanon keyを付ける。
       どちらも anken_docs を読める（setup.sql で anon に select を許可しているため）。 */
    const sent = (req.headers.get("Authorization") ?? "").replace(/^Bearer[ ]+/i, "").trim();
    const key = sent || ENV_KEY;
    /* ?debug=1 で、どの環境変数が来ているかだけ返す（値は出さない） */
    if (new URL(req.url).searchParams.get("debug")) {
      const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS", "RESEND_API_KEY", "MAIL_FROM", "APP_URL"];
      return Response.json({
        env: Object.fromEntries(names.map((n) => [n, (Deno.env.get(n) ?? "").length])),
        使う鍵: sent ? "呼び出し元のもの" : ENV_KEY ? "環境変数のもの" : "なし",
        鍵の形: key ? key.slice(0, 7) + "…(" + key.length + "文字)" : "",
      });
    }
    if (!key) {
      return Response.json({ ok: false, error: "データを読む鍵がありません" }, { status: 500 });
    }
    if (!RESEND_API_KEY || !MAIL_FROM) {
      return Response.json({ ok: false, error: "RESEND_API_KEY か MAIL_FROM が未設定です" }, { status: 400 });
    }
    const [cfgRows, caseRows, postRows] = await Promise.all([
      loadColl("config", key), loadColl("cases", key), loadColl("postings", key),
    ]);
    const cfg: any = (cfgRows.find((r: any) => r.id === "main") as any)?.data ?? {};
    const mail = cfg.mail ?? {};
    if (!mail.enabled) return Response.json({ ok: true, skipped: "設定で「送らない」になっています" });

    const postings = postRows.map((r: any) => r.data);
    const ringiDays = Number(cfg.ringiDays) || 3;
    const hits = caseRows
      .map((r: any) => ({ c: r.data, alerts: alertsFor(r.data, postings, ringiDays) }))
      .filter((x) => x.alerts.length);

    if (!hits.length) return Response.json({ ok: true, sent: 0, note: "対応が必要な案件はありません" });

    const sent: string[] = [];
    /* 担当者ごとに、その人の案件だけ送る */
    for (const [name, addr] of Object.entries(mail.to ?? {})) {
      const mine = hits.filter((x) => (x.c.tanto ?? "") === name);
      if (!mine.length || !addr) continue;
      await send([String(addr)], `【案件管理】対応が必要な案件 ${mine.length}件`, body(mine, `${name} さんの案件`));
      sent.push(String(addr));
    }
    /* まとめて受け取る宛先には全件 */
    for (const addr of mail.cc ?? []) {
      if (!addr) continue;
      await send([String(addr)], `【案件管理】対応が必要な案件 ${hits.length}件（全担当）`, body(hits, "全担当のまとめ"));
      sent.push(String(addr));
    }
    return Response.json({ ok: true, sent: sent.length, cases: hits.length });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: String((e as Error).message ?? e) }, { status: 500 });
  }
});
