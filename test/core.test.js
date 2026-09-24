import test from "node:test";
import assert from "node:assert/strict";
import { buildMessages, completionUrl, parseAllowedIds, readAnswer, splitText } from "../src/core.js";

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
  assert.equal(messages[1].content, "6");
  assert.equal(messages.at(-1).content, "new");
});

test("relay replies and telegram chunks", () => {
  assert.equal(readAnswer({ choices: [{ message: { content: [{ type: "text", text: "你好" }] } }] }), "你好");
  assert.deepEqual(splitText("a".repeat(7001)).map(x => x.length), [3500, 3500, 1]);
  assert.deepEqual([...parseAllowedIds(" 123, 456 ,, ")], ["123", "456"]);
});
