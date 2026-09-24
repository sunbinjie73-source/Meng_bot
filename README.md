# Telegram 恋爱聊天 Bot

一个单实例 Telegram 私聊 bot，通过 OpenAI 兼容格式的中转站调用 Claude。默认中文，支持多轮聊天和 `/reset`。使用长轮询，不需要公网域名。

## 创建与部署

1. 在 Telegram 与 [@BotFather](https://t.me/BotFather) 对话，发送 `/newbot` 创建 bot，保存返回的 Token。
2. 把本仓库连到 Railway，新建服务。项目文件就在仓库根目录，Root Directory 留空。
3. 设置服务变量：`TELEGRAM_BOT_TOKEN`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`。`AI_BASE_URL` 应为中转站给出的 OpenAI 兼容地址，通常以 `/v1` 结尾；也可以填写完整 `/chat/completions` 地址。
4. 可选变量：`BOT_NAME`、`BOT_PERSONA`、`ALLOWED_USER_IDS`（逗号分隔的 Telegram 数字用户 ID；留空时允许任何人私聊，可能产生 API 费用）。不要提交 `.env` 或 Token 到 GitHub。
5. 部署后查看日志中的 `已启动 @机器人用户名`。在 Telegram 打开 bot，发 `/start`，再发一句话验证回复。只有一个实例可运行长轮询，保持 Railway sleep/serverless 关闭，restart policy 设为 Always，不要设置 cron。

## 本地运行

需要 Node.js 20 以上。在 `bot` 目录按 `.env.example` 设置系统环境变量，再运行 `npm start`；`npm test` 运行不需要密钥的单元测试。

## 使用范围与数据

目前只处理文字私聊。每个用户保留最近 12 轮在进程内存里，重启或重新部署会清空；`/reset` 可清空自己的历史。消息会发送给你选择的中转站和模型提供方。此实现使用连续运行的单实例 worker；是否全天可用还取决于 Railway 套餐、余额及中转站和 Telegram 的可用性。
