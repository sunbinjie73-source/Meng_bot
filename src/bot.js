import { buildMessages, completionUrl, DEFAULT_PERSONA, parseAllowedIds, readAnswer, splitText } from "./core.js";

const required = ["TELEGRAM_BOT_TOKEN", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL"];
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length) {
  console.error(`缺少环境变量：${missing.join(", ")}`);
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const aiUrl = completionUrl(process.env.AI_BASE_URL);
const allowedIds = parseAllowedIds(process.env.ALLOWED_USER_IDS);
const persona = process.env.BOT_PERSONA?.trim() || DEFAULT_PERSONA;
const histories = new Map();
let running = true;
process.on("SIGTERM", () => { running = false; });
process.on("SIGINT", () => { running = false; });

async function request(url, options = {}, timeout = 45000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  const body = await response.text();
  let data;
  try { data = JSON.parse(body); } catch { throw new Error(`接口返回非 JSON（HTTP ${response.status}）`); }
  if (!response.ok) throw new Error(`接口 HTTP ${response.status}：${String(data?.error?.message || data?.description || "请求失败").slice(0, 180)}`);
  return data;
}

async function telegram(method, payload) {
  const data = await request(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  }, method === "getUpdates" ? 45000 : 15000);
  if (!data.ok) throw new Error(`Telegram ${method} 失败`);
  return data.result;
}

async function send(chatId, text) {
  for (const part of splitText(text)) await telegram("sendMessage", { chat_id: chatId, text: part });
}

async function reply(message) {
  if (message.chat?.type !== "private" || !message.from?.id) return;
  const chatId = message.chat.id;
  const userId = String(message.from.id);
  if (allowedIds.size && !allowedIds.has(userId)) return;
  const input = message.text?.trim();
  if (!input) {
    await send(chatId, "我现在可以读文字消息，发段话给我吧～");
    return;
  }
  const command = input.split(/\s/)[0].split("@")[0].toLowerCase();
  if (command === "/start") {
    await send(chatId, `嗨，我是${process.env.BOT_NAME?.trim() || "小夏"}。想聊什么都可以。用 /reset 清空这段对话的临时记忆。`);
    return;
  }
  if (command === "/reset") {
    histories.delete(userId);
    await send(chatId, "好，我们从头聊。今天过得怎么样？");
    return;
  }
  if (input.length > 4000) {
    await send(chatId, "这条消息有点长，分成几段发给我好吗？");
    return;
  }

  const old = histories.get(userId) || [];
  try {
    await telegram("sendChatAction", { chat_id: chatId, action: "typing" });
    const data = await request(aiUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.AI_MODEL, messages: buildMessages(old, input, persona), temperature: 0.8, max_tokens: 800, stream: false })
    }, 70000);
    const answer = readAnswer(data);
    await send(chatId, answer);
    histories.set(userId, [...old, { role: "user", content: input }, { role: "assistant", content: answer }].slice(-24));
  } catch (error) {
    console.error("回复失败：", error.message);
    try { await send(chatId, "刚才连接不太顺畅，过一会儿再发一次好吗？"); } catch (sendError) {
      console.error("发送错误提示失败：", sendError.message);
    }
  }
}

async function main() {
  // Long polling requires exactly one active replica and no Telegram webhook.
  const me = await telegram("getMe", {});
  console.log(`已启动 @${me.username}，等待私聊消息`);
  let offset;
  let delay = 1000;
  while (running) {
    try {
      const updates = await telegram("getUpdates", {
        offset, timeout: 30, limit: 20, allowed_updates: ["message"]
      });
      delay = 1000;
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) await reply(update.message);
        if (!running) break;
      }
    } catch (error) {
      console.error("轮询失败：", error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }
  console.log("正在停止 bot");
}

main().catch(error => { console.error("启动失败：", error.message); process.exit(1); });
