import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore, memoryMessages } from "../src/memory.js";
import { buildMessages } from "../src/core.js";

test("per-user memories survive reinitialization and can be forgotten", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meng-memory-"));
  try {
    const store = new MemoryStore(directory);
    await store.init();
    const data = { summary: "喜欢咖啡", history: [{ role: "user", content: "你好" }] };
    await store.save("123", data);
    assert.deepEqual(await new MemoryStore(directory).load("123"), data);
    assert.deepEqual(await store.load("456"), { summary: "", history: [] });
    assert.match(buildMessages(data.history, "早", undefined, 12, data.summary)[1].content, /喜欢咖啡/);
    await store.save("123", { ...data, history: [] });
    assert.equal((await store.load("123")).summary, "喜欢咖啡");
    await store.save("123", { ...data, partner: "girlfriend" });
    assert.equal((await new MemoryStore(directory).load("123")).partner, "girlfriend");
    assert.equal((await store.load("456")).partner, undefined);
    await store.forget("123");
    assert.deepEqual(await store.load("123"), { summary: "", history: [] });
    assert.throws(() => store.path("../456"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("summarization includes only the oldest six turns", () => {
  const history = Array.from({ length: 36 }, (_, n) => ({ role: n % 2 ? "assistant" : "user", content: String(n) }));
  const payload = JSON.parse(memoryMessages("旧摘要", history)[1].content);
  assert.equal(payload.oldSummary, "旧摘要");
  assert.equal(payload.conversation.length, 12);
  assert.equal(payload.conversation.at(-1).content, "11");
  assert.equal(history.slice(12).length, 24);
});
