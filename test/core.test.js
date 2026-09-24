import test from "node:test";
import assert from "node:assert/strict";
import { buildMessages, completionUrl, parseAllowedIds, readAnswer, splitBubbles, splitText } from "../src/core.js";

test("completion URL accepts a /v1 base or full endpoint", () => {
  assert.equal(completionUrl("https://relay.example/v1/"), "https://relay.example/v1/chat/completions");
  assert.equal(completionUrl("https://relay.example/v1/chat/completions"), "https://relay.example/v1/chat/completions");
  assert.throws(() => completionUrl("http://relay.example/v1"));
});

test("history is bounded and isolated by caller", () => {
  const history = Array.from({ length: 30 }, (_, n) => ({ role: n % 2 ? "assistant" : "user", content: String(n) }));
  const messages = buildMessages(history, "new", "persona");
  assert.equal(messages.length, 26);
  assert.ok(messages[0].content.startsWith("persona\n\n"));
  assert.match(messages[0].content, /根据对方实际表达的亲近程度调整分寸/);
  assert.match(messages[0].content, /【成人亲密关系】/);
  assert.match(messages[0].content, /\[\[BUBBLE\]\]/);
  assert.equal(messages[1].content, "6");
  assert.equal(messages.at(-1).content, "new");
});

test("reply bubbles split on marker, paragraphs, and long sentence groups", () => {
  assert.deepEqual(splitBubbles("你好\n[[BUBBLE]]\n今天怎么样？"), ["你好", "今天怎么样？"]);
  assert.deepEqual(splitBubbles("第一句\n\n第二句"), ["第一句", "第二句"]);
  assert.deepEqual(splitBubbles("我认真听着你今天讲的事情，也记得昨天你提到的烦恼。要不要先喝点水？我们可以慢慢聊。"), ["我认真听着你今天讲的事情，也记得昨天你提到的烦恼。要不要先喝点水？", "我们可以慢慢聊。"]);
  assert.deepEqual(splitBubbles("好呀。"), ["好呀。"]);
});

test("relay replies and telegram chunks", () => {
  assert.equal(readAnswer({ choices: [{ message: { content: [{ type: "text", text: "你好" }] } }] }), "你好");
  assert.deepEqual(splitText("a".repeat(7001)).map(x => x.length), [3500, 3500, 1]);
  assert.deepEqual([...parseAllowedIds(" 123, 456 ,, ")], ["123", "456"]);
});
