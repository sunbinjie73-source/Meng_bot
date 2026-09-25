import { BOT_NAME, buildMessages, completionUrl, DEFAULT_PERSONA, disclosesGirlfriend, parseAllowedIds, readAnswer, splitBubbles, splitText } from "./core.js";
import { MemoryStore, memoryMessages } from "./memory.js";
import { hasServiceTone } from "./dialogue.js";

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
const memoryStore = new MemoryStore(process.env.MEMORY_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH);
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

async function sendBubbles(chatId, text) {
  for (const bubble of splitBubbles(text)) await telegram("sendMessage", { chat_id: chatId, text: bubble });
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
    await send(chatId, `你来啦。我是${BOT_NAME}，今天想先从哪件事说起？`);
    return;
  }
  if (command === "/help") {
    await send(chatId, "/partner 让我记住你现实中有女朋友；/partner off 关闭这条设定\n/memory 查看长期记忆\n/reset 清空近期对话\n/forget 删除全部记忆");
    return;
  }
  if (command === "/partner") {
    if (!/^\/partner(?:@\w+)?(?:\s+off)?\s*$/i.test(input)) {
      await send(chatId, "发 /partner 让我记住这件事；发 /partner off 关闭这条设定。");
      return;
    }
    const memory = await memoryStore.load(userId);
    const off = /^\/partner(?:@\w+)?\s+off\s*$/i.test(input);
    await memoryStore.save(userId, { ...memory, partner: off ? "off" : "girlfriend" });
    await send(chatId, off ? "好，这条个人设定已关闭；我不会再把它当成现在的事实。" : "知道了，你现实中有女朋友。可我还是喜欢你，想在你心里留个不只是朋友的位置。");
    return;
  }
  if (command === "/reset") {
    const memory = await memoryStore.load(userId);
    await memoryStore.save(userId, { ...memory, history: [] });
    await send(chatId, "近期对话已经清空，长期记忆还在。今天想聊什么？");
    return;
  }
  if (command === "/forget") {
    await memoryStore.forget(userId);
    await send(chatId, "你的近期对话和长期记忆都已删除。我们重新认识吧。");
    return;
  }
  if (command === "/memory") {
    const memory = await memoryStore.load(userId);
    const facts = [memory.partner === "girlfriend" ? "你现实中有女朋友。" : "", memory.summary].filter(Boolean);
    await send(chatId, facts.length ? `我记得这些：\n${facts.join("\n")}` : "还没有形成长期记忆。近期对话会在聊天时使用；如果想全部删除，发 /forget。");
    return;
  }
  if (input.length > 4000) {
    await send(chatId, "这条消息有点长，分成几段发给我好吗？");
    return;
  }

  try {
    const memory = await memoryStore.load(userId);
    if (disclosesGirlfriend(input) && memory.partner !== "girlfriend") {
      memory.partner = "girlfriend";
      await memoryStore.save(userId, memory);
    }
    await telegram("sendChatAction", { chat_id: chatId, action: "typing" });
    const data = await request(aiUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.AI_MODEL, messages: buildMessages(memory.history, input, persona, 12, memory.summary, memory.partner), temperature: 0.8, max_tokens: 800, stream: false })
    }, 70000);
    let answer = readAnswer(data);
    if (hasServiceTone(answer, input)) {
      try {
        const rewritten = await request(aiUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: process.env.AI_MODEL, messages: [
            ...buildMessages(memory.history, input, persona, 12, memory.summary, memory.partner),
            { role: "assistant", content: answer },
            { role: "user", content: "刚才的回复有些像客服。请保留要表达的意思，用萌萌自己的口吻重新接住我这句话，回应其中的具体内容。不要复述、分析或提问收尾；自然分段即可。只输出改写后的回复。" }
          ], temperature: 0.85, max_tokens: 800, stream: false })
        }, 70000);
        const alternative = readAnswer(rewritten);
        if (!hasServiceTone(alternative, input)) answer = alternative;
      } catch (error) {
        console.error("语气调整失败，使用首次回复：", error.message);
      }
    }
    memory.history.push({ role: "user", content: input }, { role: "assistant", content: answer });
    await memoryStore.save(userId, memory);
    await sendBubbles(chatId, answer);
    if (memory.history.length >= 36) {
      try {
        const summarized = await request(aiUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: process.env.AI_MODEL, messages: memoryMessages(memory.summary, memory.history), temperature: 0, max_tokens: 800, stream: false })
        }, 70000);
        memory.summary = readAnswer(summarized).slice(0, 1500);
        memory.history = memory.history.slice(12);
        await memoryStore.save(userId, memory);
      } catch (error) {
        console.error("整理长期记忆失败，保留原始历史：", error.message);
      }
    }
  } catch (error) {
    console.error("回复失败：", error.message);
    try { await send(chatId, "刚才连接不太顺畅，过一会儿再发一次好吗？"); } catch (sendError) {
      console.error("发送错误提示失败：", sendError.message);
    }
  }
}

async function main() {
  await memoryStore.init();
  // Long polling requires exactly one active replica and no Telegram webhook.
  const me = await telegram("getMe", {});
  const profileName = await telegram("getMyName", {});
  if (profileName.name !== BOT_NAME) await telegram("setMyName", { name: BOT_NAME });
  await telegram("setMyCommands", { commands: [
    { command: "start", description: "认识萌萌" },
    { command: "help", description: "查看使用说明" },
    { command: "partner", description: "开启第三者关系设定" },
    { command: "memory", description: "查看长期记忆" },
    { command: "reset", description: "清空近期对话" },
    { command: "forget", description: "删除全部记忆" }
  ] });
  await telegram("setChatMenuButton", { menu_button: { type: "commands" } });
  console.log("Telegram 命令菜单已同步");
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
