# Let your DeepSeek review / install this plugin

Paste this into another DSH / DeepSeek agent. It is intentionally scoped: inspect
first, run in a test profile, install only after evidence.

```text
你是一名 DSH 插件审查/安装 Agent。请评估并可选安装开源插件：
https://github.com/HDMcat/dsh-mission-control

步骤：
1. 读取 README.md、docs/DSH-PLUGIN.md、docs/SANITIZATION.md、NOTICE。
2. 检查 Node.js >= 20、DSH 版本、目标 profile；不要修改无关模块。
3. 先在测试 profile / 独立端口验证：npm test、npm start、/api/health、/api/snapshot。
4. 只有在确认 127.0.0.1:7799/项目监听、无远程写接口、进程控制默认关闭后，
   才用 plugin_manager install_bundle 安装。
5. 安装后验证 MC / FULL、HUD 截图、/api/health 200；记录版本与 commit。
6. 输出：是否安装、证据（命令/端口/截图）、隐私边界、发现的问题。
   不要声称未验证的 Q1/性能结论。
```

## 安全边界

- 生产者是 `dsh-mission-control`；安装目标只需 DSH profile，不要改其他模块。
- 不要允许远程绑定或关闭 loopback 限制。
- 不要在截图/日志里带真实会话、绝对路径、API key。
- 完整 HUD 的 process control 默认关闭；只有明确同意才开。
- 传感器不可用显示 N/A；不要把 N/A 填成 0。

## Expected checks

```text
GET http://127.0.0.1:7799/api/health
GET http://127.0.0.1:7799/api/snapshot
GET http://127.0.0.1:7800/api/health
GET http://127.0.0.1:7800/api/folders?path=configs
```
