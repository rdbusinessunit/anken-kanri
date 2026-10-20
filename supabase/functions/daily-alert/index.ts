/* 毎朝、担当者ごとに「対応が必要な案件」をLINEで送る。メールも併用できる。
 *
 * cron（pg_net）から呼ばれたときは、すぐ200を返して送信は裏で続けます。
 * pg_netの待ち時間は画面から最大5秒までしか延ばせず、この関数はそれを
 * 超えることがあるためです。打ち切られると1通も送られません。
 * 結果は anken_docs の coll=notifylog に1件だけ残します。
 *
 * Supabase の定期実行（Supabase Cron）から呼ばれます。誰も画面を開いていなくても動きます。
 * 判定の中身は画面側の core.js の alertsFor() と同じです。片方だけ直すとズレるので、
 * 条件を変えるときは両方を直してください。
 *
 * LINEの無料プランは月200通まで、1通＝1人宛てです。使い切ると送れなくなるので、
 * 毎回フリープランの残りを確かめ、少なくなったら本文の先頭で知らせます。
 * 宛先（LINEのuserId）は line-webhook 関数が集めて anken_docs の coll='linefriends' に入れます。
 *
 * 必要なシークレット（Supabase の Edge Functions > Secrets に登録）
 *   LINE_TOKEN     … LINE Developers の「チャネルアクセストークン（長期）」
 *   APP_URL        … システムのURL
 *   RESEND_API_KEY … メールも併用する場合だけ
 *   MAIL_FROM      … メールも併用する場合だけ
 */

type Json = Record<string, unknown>;

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "https://wmxsuggeudkxewjhczam.supabase.co";
/* データを読むための鍵。画面側の config.js と同じ公開キーを既定にする。
   公開されて問題ない種類の鍵で、読み書きの制限はテーブル側のポリシーで管理している。

   以前は「呼び出し元が付けてきた鍵」を使っていたが、Supabaseのテスト画面から呼ぶと
   その画面の鍵ではテーブルを読めず403になった。誰が呼んでも同じ鍵で読むようにする。 */
const SB_KEY = Deno.env.get("SB_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndteHN1Z2dldWRreGV3amhjemFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MzYyNTEsImV4cCI6MjEwMzIxMjI1MX0.8c0uRXyDZ_vB04vQTQKynTcEGRNnXPmTgBsWcEYpPWw";
const LINE_TOKEN = Deno.env.get("LINE_TOKEN") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "";
/* 画面のURL。通知から案件を直接開けるようにする */
const APP_URL = Deno.env.get("APP_URL") ?? "https://rdbusinessunit.github.io/anken-kanri/";

/* この時刻より前には送りません（日本時間）。早朝にLINEが鳴るのを防ぐためです。
   定期実行を早い時間から並べてあるのは、GitHubの遅れを吸収するためで、
   早く動いたぶんはここで止めます。 */
const SEND_FROM_MIN = 7 * 60 + 30;
const SEND_FROM_LABEL = "7時半";

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

async function loadColl(coll: string) {
  const out: Json[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${SB_URL}/rest/v1/anken_docs?select=id,data&coll=eq.${coll}&order=id`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Range: `${from}-${from + 999}` } },
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
  /* 承認後の条件変更とRD未確認は、画面には出すが通知では送らない（運用で決定） */
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

type Hit = { c: any; alerts: { tone: string; text: string }[] };

/* ============ LINE ============ */

/* 送る曜日。cronは毎日呼んでくるので、今日が送る日かどうかはここで決める。
   SQLに曜日を書くと、設定画面に出る通数の目安とズレてしまうため。
   postings.js の LINE_PLANS と同じ区分なので、増やすときは両方に足すこと。 */
const LINE_PLANS: Record<string, { label: string; days: number[] }> = {
  everyday: { label: "毎日", days: [0, 1, 2, 3, 4, 5, 6] },
  weekday: { label: "平日（月〜金）", days: [1, 2, 3, 4, 5] },
  mwf: { label: "月・水・金", days: [1, 3, 5] },
};
/* JST() は9時間ずらした Date なので、曜日は getUTCDay() で読む */
const isSendDay = (plan: string) =>
  (LINE_PLANS[plan] ?? LINE_PLANS.mwf).days.includes(JST().getUTCDay());

const TONE_MARK: Record<string, string> = { crit: "🔴", warn: "🟡", info: "🔵" };

/* LINEの1通は5000文字まで。分けて送ると通数が増えて無料枠を食うので、
   入りきらない分は件数だけ伝えて必ず1通に収める。 */
function lineBody(rows: Hit[], title: string, notice: string) {
  const LIMIT = 4500;
  let out = `【案件管理】${title}\n${today()}　対応が必要な案件 ${rows.length}件\n`;
  if (notice) out += `\n※ ${notice}\n`;
  let shown = 0;
  for (const { c, alerts } of rows) {
    const who = [c.kyoten, c.tanto ? `担当 ${c.tanto}` : ""].filter(Boolean).join("／");
    const block = `\n──────────\n▼ ${caseName(c)}\n${who}\n`
      + alerts.map((a) => `${TONE_MARK[a.tone] ?? "・"} ${a.text}`).join("\n")
      + `\n${APP_URL}#/case/${c.id}\n`;
    if (out.length + block.length > LIMIT) break;
    out += block;
    shown++;
  }
  if (shown < rows.length) out += `\nほか ${rows.length - shown}件あります。\n${APP_URL}`;
  return out;
}

/* 今月あと何通送れるか。取れなければ null（判断材料がないだけで、送信は止めない） */
async function lineRemaining(): Promise<number | null> {
  try {
    const h = { Authorization: `Bearer ${LINE_TOKEN}` };
    const [q, u] = await Promise.all([
      fetch("https://api.line.me/v2/bot/message/quota", { headers: h }),
      fetch("https://api.line.me/v2/bot/message/quota/consumption", { headers: h }),
    ]);
    if (!q.ok || !u.ok) return null;
    const qj = await q.json();
    if (qj?.type !== "limited") return null; /* 上限なしのプラン */
    return Number(qj.value) - Number((await u.json()).totalUsage ?? 0);
  } catch {
    return null;
  }
}

/* 1人に送る。失敗しても例外にせず理由を返す */
async function linePush(to: string, text: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${LINE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    });
    if (res.ok) return null;
    const body = await res.text();
    if (res.status === 429) return "今月の無料通数を使い切りました（LINE公式アカウントのプラン変更が必要）";
    if (res.status === 403) return "この相手に送れません（友だち解除された可能性があります）";
    return `${res.status} ${body.slice(0, 140)}`;
  } catch (e) {
    return String((e as Error).message ?? e);
  }
}

/* ============ メール（併用する場合） ============ */

const TONE_LABEL: Record<string, string> = { crit: "至急", warn: "注意", info: "お知らせ" };
const TONE_BG: Record<string, string> = { crit: "#C0392B", warn: "#B8860B", info: "#50606B" };

function mailBody(rows: Hit[], title: string) {
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
        送信を止めるときは、システムの「設定 → 通知」で「送らない」にしてください。
      </div>
    </div></div>`;
}

/* 1件送る。失敗しても例外にせず理由を返す。
   1人の宛先が弾かれただけで、他の人に届かなくなるのを防ぐため。 */
async function mailSend(to: string, subject: string, html: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html }),
    });
    if (res.ok) return null;
    const body = await res.text();
    /* いちばん多いのがこれ。差出人が resend.dev のままだと、自分以外には送れない */
    if (res.status === 403) return "差出人が未登録のドメインのため、自分以外には送れません（自社ドメインの登録が必要）";
    return `${res.status} ${body.slice(0, 120)}`;
  } catch (e) {
    return String((e as Error).message ?? e);
  }
}

/* 毎回の結果を1件だけ残す。設定画面の「前回の送信」に出す。
   cronから呼ぶときは返事を待たない作りなので、これが唯一の記録になる。 */
async function writeLog(result: Record<string, unknown>) {
  try {
    await fetch(`${SB_URL}/rest/v1/anken_docs?on_conflict=coll,id`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify([{
        coll: "notifylog",
        id: "last",
        data: { ...result, at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
        updated_by: "通知",
      }]),
    });
  } catch (e) {
    console.error("記録に失敗", e);
  }
}

/* ============ 本体 ============ */

async function run(force: boolean, once: boolean): Promise<Record<string, unknown>> {
  try {
    const [cfgRows, caseRows, postRows, friendRows, logRows] = await Promise.all([
      loadColl("config"), loadColl("cases"), loadColl("postings"), loadColl("linefriends"),
      loadColl("notifylog"),
    ]);

    /* 定期実行のときだけの2つの門番。どちらも記録を書かずに帰る（その日の枠を使わない）。

       GitHubの定期実行は混み具合で1〜3時間遅れます（実測 1:39 / 2:04 / 2:59）。
       そこで早朝から何回も呼んでおき、
         ・まだ早い時間に動いたぶんは、何もせず帰る
         ・7時半を過ぎてから動いた最初のぶんが送る
         ・その日すでに送っていれば、何もせず帰る
       という形にしています。遅れても遅れなくても7時半〜8時半ごろに届きます。 */
    if (once && !force) {
      const last = (logRows.find((r: any) => r.id === "last") as any)?.data;
      if (last?.ok && last.at) {
        const lastDay = new Date(new Date(String(last.at)).getTime() + 9 * 3600 * 1000)
          .toISOString().slice(0, 10);
        if (lastDay === today()) {
          return { ok: true, 送った: 0, 結果: "今日はすでに実行済みです", 記録しない: true };
        }
      }
      const n = JST();
      const nowMin = n.getUTCHours() * 60 + n.getUTCMinutes();
      if (nowMin < SEND_FROM_MIN) {
        return { ok: true, 送った: 0, 結果: `まだ早いので送りません（${SEND_FROM_LABEL}以降に送ります）`, 記録しない: true };
      }
    }
    const cfg: any = (cfgRows.find((r: any) => r.id === "main") as any)?.data ?? {};
    const line = cfg.line ?? {};
    const mail = cfg.mail ?? {};
    if (!line.enabled && !mail.enabled) {
      return { ok: true, 送った: 0, 結果: "設定で「送らない」になっています" };
    }

    const postings = postRows.map((r: any) => r.data);
    const ringiDays = Number(cfg.ringiDays) || 3;
    const hits: Hit[] = caseRows
      .map((r: any) => ({ c: r.data, alerts: alertsFor(r.data, postings, ringiDays) }))
      .filter((x) => x.alerts.length);

    if (!hits.length) return { ok: true, 送った: 0, 結果: "対応が必要な案件はありません" };

    const sent: string[] = [];
    const failed: { to: string; reason: string }[] = [];
    let remaining: number | null = null;

    /* --- LINE --- */
    const plan = LINE_PLANS[line.days] ? String(line.days) : "mwf";
    let skippedToday = "";
    if (line.enabled && !force && !isSendDay(plan)) {
      skippedToday = `今日はLINEを送る日ではありません（設定：${LINE_PLANS[plan].label}）`;
    } else if (line.enabled) {
      if (!LINE_TOKEN) {
        failed.push({ to: "LINE", reason: "LINE_TOKEN が未設定です" });
      } else {
        const friends = friendRows
          .map((r: any) => r.data)
          .filter((f: any) => f?.userId && f.active !== false && f.role && f.role !== "off");
        remaining = await lineRemaining();
        /* 残りが少なくなったら本文の先頭で知らせる。
           警告だけを別に送ると、その1通も無料枠を食ってしまうため。 */
        const notice = remaining !== null && remaining <= friends.length * 3
          ? `LINEの無料通数の残りが ${remaining} 通です。少なくなっています`
          : "";
        for (const f of friends) {
          const mine = f.role === "all" ? hits : hits.filter((x) => (x.c.tanto ?? "") === f.tanto);
          if (!mine.length) continue;
          const title = f.role === "all" ? "全担当のまとめ" : `${f.tanto} さんの案件`;
          const err = await linePush(f.userId, lineBody(mine, title, notice));
          const label = `LINE:${f.tanto || f.name || String(f.userId).slice(0, 8)}`;
          if (err) failed.push({ to: label, reason: err });
          else sent.push(label);
        }
      }
    }

    /* --- メール（併用する場合） --- */
    if (mail.enabled) {
      if (!RESEND_API_KEY || !MAIL_FROM) {
        failed.push({ to: "メール", reason: "RESEND_API_KEY か MAIL_FROM が未設定です" });
      } else {
        const one = async (addr: string, subject: string, html: string) => {
          const err = await mailSend(addr, subject, html);
          if (err) failed.push({ to: addr, reason: err });
          else sent.push(addr);
        };
        /* 担当者ごとに、その人の案件だけ送る */
        for (const [name, addr] of Object.entries(mail.to ?? {})) {
          const mine = hits.filter((x) => (x.c.tanto ?? "") === name);
          if (!mine.length || !addr) continue;
          await one(String(addr), `【案件管理】対応が必要な案件 ${mine.length}件`, mailBody(mine, `${name} さんの案件`));
        }
        /* まとめて受け取る宛先には全件 */
        for (const addr of mail.cc ?? []) {
          if (!addr) continue;
          await one(String(addr), `【案件管理】対応が必要な案件 ${hits.length}件（全担当）`, mailBody(hits, "全担当のまとめ"));
        }
      }
    }

    return {
      ok: failed.length === 0,
      送った: sent.length,
      送れなかった: failed.length,
      対象の案件: hits.length,
      LINEの残り通数: remaining,
      ...(skippedToday ? { 結果: skippedToday } : {}),
      失敗の内訳: failed,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, 送った: 0, error: String((e as Error).message ?? e) };
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  /* ?debug=1 で、鍵が入っているかだけ返す（値は出さない）。送信はしない */
  if (url.searchParams.get("debug")) {
    const names = ["LINE_TOKEN", "RESEND_API_KEY", "MAIL_FROM", "APP_URL"];
    return Response.json({
      env: Object.fromEntries(names.map((n) => [n, (Deno.env.get(n) ?? "").length ? `${(Deno.env.get(n) ?? "").length}文字` : "空です"])),
      LINEの残り通数: await lineRemaining(),
    });
  }

  /* ?force=1 を付けると曜日を無視して送る。手で試すとき用 */
  const force = !!url.searchParams.get("force");
  /* ?once=1 を付けると、その日すでに実行済みなら何もしない。定期実行から使う */
  const once = !!url.searchParams.get("once");

  /* cron（pg_net）から呼ばれたときは、すぐ返事を返して送信は裏で続ける。
     pg_netの待ち時間は画面から最大5秒までしか延ばせず、この関数は
     起動＋4種類の読み込み＋LINE送信で、それを超えることがあるため。
     打ち切られると1通も送られないので、先に200を返してしまう。
     結果は anken_docs の notifylog に残り、設定画面の「前回の送信」に出る。 */
  const body = await req.text().catch(() => "");
  const fromCron = /pg_net/i.test(req.headers.get("user-agent") ?? "")
    || !!url.searchParams.get("async")
    || /"async"\s*:\s*true/.test(body);

  const job = run(force, once).then(async (r) => {
    /* 「今日はすでに実行済み」のときは記録を上書きしない。朝の結果を残すため */
    if (!r.記録しない) await writeLog(r);
    return r;
  });

  if (fromCron) {
    (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
      .EdgeRuntime?.waitUntil?.(job);
    job.then((r) => console.log("通知の結果", r)).catch((e) => console.error(e));
    return Response.json({ ok: true, 受付: "送信を始めました。結果は設定画面の「前回の送信」に出ます" });
  }
  return Response.json(await job);
});
