import test from "node:test";
import assert from "node:assert/strict";
import { BOT_NAME, DEFAULT_PERSONA, buildMessages, completionUrl, disclosesGirlfriend, parseAllowedIds, readAnswer, splitBubbles, splitText } from "../src/core.js";
import { hasServiceTone } from "../src/dialogue.js";

test("completion URL accepts a /v1 base or full endpoint", () => {
  assert.equal(completionUrl("https://relay.example/v1/"), "https://relay.example/v1/chat/completions");
  assert.equal(completionUrl("https://relay.example/v1/chat/completions"), "https://relay.example/v1/chat/completions");
  assert.throws(() => completionUrl("http://relay.example/v1"));
});

test("default character is Mengmeng, an adult woman", () => {
  assert.equal(BOT_NAME, "萌萌");
  assert.match(DEFAULT_PERSONA, /成年女性/);
  assert.match(DEFAULT_PERSONA, /你叫萌萌/);
});

test("history is bounded and isolated by caller", () => {
  const history = Array.from({ length: 30 }, (_, n) => ({ role: n % 2 ? "assistant" : "user", content: String(n) }));
  const messages = buildMessages(history, "new", "persona");
  assert.equal(messages.length, 26);
  assert.ok(messages[0].content.startsWith("persona\n\n"));
  assert.match(messages[0].content, /萌萌已经很喜欢对方/);
  assert.match(messages[0].content, /【成人亲密关系】/);
  assert.match(messages[0].content, /先回应具体内容/);
  assert.doesNotMatch(messages[0].content, /\[\[BUBBLE\]\]/);
  assert.equal(messages[1].content, "6");
  assert.equal(messages.at(-1).content, "new");
});

test("reply bubbles follow natural paragraphs and keep one paragraph intact", () => {
  assert.deepEqual(splitBubbles("你好\n[[BUBBLE]]\n今天怎么样？"), ["你好", "今天怎么样？"]);
  assert.deepEqual(splitBubbles("第一句\n\n第二句"), ["第一句", "第二句"]);
  assert.deepEqual(splitBubbles("我认真听着你今天讲的事情，也记得昨天你提到的烦恼。要不要先喝点水？我们可以慢慢聊。"), ["我认真听着你今天讲的事情，也记得昨天你提到的烦恼。要不要先喝点水？我们可以慢慢聊。"]);
  assert.deepEqual(splitBubbles("好呀。"), ["好呀。"]);
  assert.deepEqual(buildMessages([{ role: "assistant", content: "嗯\n[[BUBBLE]]\n我在" }], "好")[1].content, "嗯\n\n我在");
});

test("assistant templates trigger one tone repair in casual chat", () => {
  assert.equal(hasServiceTone("如果你愿意，可以告诉我更多。", "今天有点烦"), true);
  assert.equal(hasServiceTone("六次？那我替你记仇了。", "今天有点烦"), false);
  assert.equal(hasServiceTone("我可以帮你列步骤。", "帮我列一下步骤"), false);
  assert.equal(hasServiceTone("我是 AI 聊天伙伴。", "你是AI吗"), false);
});

test("partner context belongs only to a confirmed user and can be disabled", () => {
  const unknown = buildMessages([], "你好");
  assert.equal(unknown.some(message => /这位用户现实中有女朋友/.test(message.content)), false);
  const known = buildMessages([], "你好", undefined, 12, "", "girlfriend");
  assert.match(known[1].content, /这位用户现实中有女朋友/);
  const disabled = buildMessages([], "你好", undefined, 12, "旧摘要：女朋友", "off");
  assert.match(disabled[2].content, /不要将既有摘要中关于用户现实伴侣的旧说法当成当前事实/);
  assert.equal(disclosesGirlfriend("我现实中有女朋友，她知道我在聊天"), true);
  assert.equal(disclosesGirlfriend("其实我有女朋友了"), true);
  assert.equal(disclosesGirlfriend("如果我有女朋友呢"), false);
  assert.equal(disclosesGirlfriend("我没有女朋友"), false);
});

test("relay replies and telegram chunks", () => {
  assert.equal(readAnswer({ choices: [{ message: { content: [{ type: "text", text: "你好" }] } }] }), "你好");
  assert.deepEqual(splitText("a".repeat(7001)).map(x => x.length), [3500, 3500, 1]);
  assert.deepEqual([...parseAllowedIds(" 123, 456 ,, ")], ["123", "456"]);
});
