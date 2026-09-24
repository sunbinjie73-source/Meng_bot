# Telegram 恋爱聊天 Bot

一个单实例 Telegram 私聊 bot，通过 OpenAI 兼容格式的中转站调用 Claude。默认中文，支持持久化聊天记忆。使用长轮询，不需要公网域名。

`src/worldbook.js` 包含情感表现规则：按真实对话里的关系进展调整亲近程度，让克制型角色也能表达在意，并避免编造共同回忆。即使通过 `BOT_PERSONA` 自定义人物设定，这层规则仍会加入系统提示。模型提供方的内容规则仍由提供方执行。

回复通常分成 2～3 个独立的 Telegram 消息气泡；模型用单独一行的 `[[BUBBLE]]` 标记分隔，程序也能按段落或较长回复的句子分割。亲密角色扮演只适用于明确成年的自愿参与者，具体内容仍受所选模型及中转站规则约束。

## 创建与部署

1. 在 Telegram 与 [@BotFather](https://t.me/BotFather) 对话，发送 `/newbot` 创建 bot，保存返回的 Token。
2. 把本仓库连到 Railway，新建服务。项目文件就在仓库根目录，Root Directory 留空。
3. 设置服务变量：`TELEGRAM_BOT_TOKEN`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`。`AI_BASE_URL` 应为中转站给出的 OpenAI 兼容地址，通常以 `/v1` 结尾；也可以填写完整 `/chat/completions` 地址。
4. 给该服务挂载 Railway Volume 到 `/data`；应用会读取 Railway 自动设置的 `RAILWAY_VOLUME_MOUNT_PATH`。存储不可用时启动会失败，避免把记忆误存到临时容器。可选变量：`BOT_NAME`、`BOT_PERSONA`、`ALLOWED_USER_IDS`（逗号分隔的 Telegram 数字用户 ID；留空时允许任何人私聊，可能产生 API 费用）。不要提交 `.env` 或 Token 到 GitHub。
5. 部署后查看日志中的 `已启动 @机器人用户名`。在 Telegram 打开 bot，发 `/start`，再发一句话验证回复。只有一个实例可运行长轮询，保持 Railway sleep/serverless 关闭，restart policy 设为 Always，不要设置 cron。

## 本地运行

需要 Node.js 20 以上。在 `bot` 目录按 `.env.example` 设置系统环境变量，再运行 `npm start`；`npm test` 运行不需要密钥的单元测试。

## 使用范围与数据

目前只处理文字私聊。每位用户的历史独立存放在挂载卷，最近 12 轮直接带入模型；较早的对话每满 6 轮会请求模型提炼成长期记忆，重启或重新部署后仍保留。摘要可能遗漏或记错细节，可用 `/memory` 查看，`/reset` 清空近期对话但保留长期记忆，`/forget` 删除全部记忆。摘要请求会额外消耗模型额度；若摘要失败，原始历史继续保留，随后再试。对话内容和摘要会发送给中转站及模型提供方。单实例 worker 的全天可用性仍取决于 Railway 套餐、余额及中转站和 Telegram 的可用性。本地可设置 `MEMORY_DIR` 指向可写目录。
