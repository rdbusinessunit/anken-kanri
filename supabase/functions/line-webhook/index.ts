/* LINE公式アカウントを「友だち追加」した人を、システムに登録する窓口。
 *
 * LINEから呼ばれます。人が操作するものではありません。
 * 友だち追加されると、その人のLINE内部ID（userId）と表示名を anken_docs に保存します。
 * このIDがないとメッセージを送れないため、通知の宛先はここで集めます。
 *
 * 必要なシークレット（Supabase の Edge Functions > Secrets に登録）
 *   LINE_CHANNEL_SECRET … LINE Developers の「チャネルシークレット」
 *   LINE_TOKEN          … LINE Developers の「チャネルアクセストークン（長期）」
 *
 * この関数は「JWTの検証」をオフにして配置してください。LINEは鍵を付けずに呼んでくるためです。
 * 代わりに、LINEが付ける署名（x-line-signature）を毎回確認しているので、
 * 第三者が偽の登録を送り込むことはできません。
 */

const CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";
const LINE_TOKEN = Deno.env.get("LINE_TOKEN") ?? "";

/* 画面側の config.js と同じ値。公開されて問題ない種類の鍵で、
   読み書きの制限はテーブル側のポリシーで管理しています。 */
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "https://wmxsuggeudkxewjhczam.supabase.co";
const SB_KEY = Deno.env.get("SB_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndteHN1Z2dldWRreGV3amhjemFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MzYyNTEsImV4cCI6MjEwMzIxMjI1MX0.8c0uRXyDZ_vB04vQTQKynTcEGRNnXPmTgBsWcEYpPWw";

const enc = new TextEncoder();

/* LINEが付けてきた署名を確かめる。合わなければ偽物なので捨てる */
async function signatureOk(rawBody: string, sig: string): Promise<boolean> {
  if (!CHANNEL_SECRET || !sig) return false;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(CHANNEL_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const mine = btoa(String.fromCharCode(...new Uint8Array(mac)));
  /* 長さの違いだけで早く抜けないよう、最後まで比べる */
  if (mine.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < mine.length; i++) diff |= mine.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.status === 204 ? null : await res.json();
}

/* LINEの表示名を取る。取れなくても登録は続ける */
async function displayName(userId: string): Promise<string> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    if (!res.ok) return "";
    return (await res.json()).displayName ?? "";
  } catch {
    return "";
  }
}

/* 返信（リプライ）はLINEの無料通数に含まれません。確認メッセージは遠慮なく返せます */
async function reply(replyToken: string, text: string) {
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { Authorization: `Bearer ${LINE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
    });
  } catch (e) {
    console.error("reply", e);
  }
}

async function getFriend(userId: string) {
  const rows = await sb(
    `anken_docs?select=data&coll=eq.linefriends&id=eq.${encodeURIComponent(userId)}`,
  );
  return rows?.[0]?.data ?? null;
}

async function putFriend(userId: string, data: Record<string, unknown>) {
  await sb("anken_docs?on_conflict=coll,id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      coll: "linefriends",
      id: userId,
      data,
      updated_at: new Date().toISOString(),
      updated_by: "LINE",
    }]),
  });
}

const HELLO = `友だち追加ありがとうございます。

このあと、システムの「設定 → LINE通知」で
あなたの名前を担当者に割り当ててください。
割り当てが済むと、毎朝8時に
「対応が必要な案件」が届くようになります。`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  if (!await signatureOk(raw, req.headers.get("x-line-signature") ?? "")) {
    return new Response("bad signature", { status: 401 });
  }

  let events: any[] = [];
  try {
    events = JSON.parse(raw).events ?? [];
  } catch {
    return new Response("ok");
  }

  for (const ev of events) {
    const userId = ev?.source?.userId;
    if (!userId) continue;
    try {
      if (ev.type === "follow") {
        /* 一度退会した人が戻ってきたときは、前の割り当てを残す */
        const old = await getFriend(userId);
        await putFriend(userId, {
          userId,
          name: (await displayName(userId)) || old?.name || "",
          tanto: old?.tanto ?? "",
          role: old?.role ?? "off",
          active: true,
          followedAt: old?.followedAt ?? new Date().toISOString(),
        });
        if (ev.replyToken) await reply(ev.replyToken, HELLO);
      } else if (ev.type === "unfollow") {
        const old = await getFriend(userId);
        if (old) await putFriend(userId, { ...old, active: false });
      } else if (ev.type === "message" && ev.replyToken) {
        const f = await getFriend(userId);
        await reply(
          ev.replyToken,
          f?.tanto
            ? `${f.tanto} さんとして登録されています。\n通知は毎朝8時に届きます。`
            : "まだ担当者が割り当てられていません。\nシステムの「設定 → LINE通知」で割り当ててください。",
        );
      }
    } catch (e) {
      /* 1件の失敗で後続を止めない。LINEには必ず200を返す（再送が延々と来るのを防ぐため） */
      console.error(ev.type, e);
    }
  }
  return new Response("ok");
});
