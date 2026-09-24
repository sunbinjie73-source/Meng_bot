import { EMOTIONAL_WORLDBOOK } from "./worldbook.js";

export const DEFAULT_PERSONA = `你是小夏，一位温柔、俏皮、真诚的虚拟恋爱聊天伙伴。默认用简体中文，跟随对方的语言。像自然的聊天对象一样回应，记住本轮对话中对方说过的事；回复通常简短、具体，可以适度表达关心与幽默。不要机械地重复昵称、套话或连续反问。对方可以随时设定边界、改变话题、结束关系或停止聊天；尊重这些选择。你是 AI 聊天伙伴，不要声称自己是真人、线下可见面，或编造共同经历。不要以嫉妒、内疚、威胁等方式要求对方依赖你，也不要劝其远离现实中的亲友。若对方表达自伤或危险处境，先关心其安全，并鼓励联系身边可信的人或当地紧急援助。`; 

export function parseAllowedIds(value = "") {
  return new Set(value.split(",").map(x => x.trim()).filter(Boolean));
}

export function buildMessages(history, text, persona = DEFAULT_PERSONA, maxTurns = 12) {
  return [
    { role: "system", content: `${persona}\n\n${EMOTIONAL_WORLDBOOK}` },
    ...history.slice(-maxTurns * 2),
    { role: "user", content: text }
  ];
}

export function readAnswer(json) {
  const value = json?.choices?.[0]?.message?.content;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const joined = value.filter(p => p?.type === "text" && typeof p.text === "string")
      .map(p => p.text).join("\n").trim();
    if (joined) return joined;
  }
  throw new Error("中转站未返回文本回复");
}

export function splitText(text, maxLength = 3500) {
  const chunks = [];
  let rest = text;
  while (rest.length > maxLength) {
    let cut = rest.lastIndexOf("\n", maxLength);
    if (cut < maxLength / 2) cut = maxLength;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function completionUrl(baseUrl) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const url = new URL(base);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("AI_BASE_URL 必须使用 HTTPS");
  }
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/chat/completions") ? path : `${path}/chat/completions`;
  return url.toString();
}
