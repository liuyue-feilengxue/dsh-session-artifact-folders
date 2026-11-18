# 变更记录

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 1.1.1 — 2026-11-18

只动文档与文案，功能不变。

### 新增

- README 顶部徽章行：Gitee Star / Fork、MIT 许可、Node ≥18、零依赖、Release。

### 变更

- 删除 README 的「发布到 Gitee」章节：那是仓库作者的发布步骤，对使用者无用。
- 拒绝理由与文档示例改用通用文案，不再出现具体机器上的目录名、会话标题与整理历史。

## 1.1.0 — 2026-11-18

开源版本。

### 新增

- `LICENSE`（MIT）、`.gitignore`、`.gitattributes`、`settings.example.json`、`CHANGELOG.md`。
- 离线单元测试 `test/run.mjs` 与 `npm test`（stub ctx，无需 DSH 运行时）。
- README 重写为对外文档：安装、卸载、配置表、目录名规则、工作原理、已知限制。
- `package.json` 补齐 `license` / `author` / `keywords` / `engines` / `repository` / `homepage` / `bugs` / `scripts`，并导出 `./rules`。
- 新增断言：`apply_patch` 参与判定、无 agent 时不注入、`workspaceRoots: []` 时任意工作目录都生效。

### 变更

- **默认 `mode` 由 `deny` 改为 `warn`**：开箱即用只做引导与记账，不打断任何工具调用。需要硬拦截请在 `settings.json` 里写 `"mode": "deny"`。
- **默认 `workspaceRoots` 由写死的一台机器路径改为 `[]`**（空 = 所有工作目录），插件不再绑定某一台具体机器。
- 插件描述文案改为：「让每个会话的产物自动落进以会话标题命名的文件夹，会话之间互不混杂，整理和查找一目了然。」
- `settings.json` 移入 `.gitignore`，仓库只带 `settings.example.json`。
- 测试夹具改用通用路径，仓库不带任何具体机器的目录结构。
- 署名与仓库地址：`LICENSE` 版权人与 `package.json` 的 `author` 为 **六月飞冷雪**，`repository` / `homepage` / `bugs` 指向 <https://gitee.com/liuyuefeilengxue/dsh-session-artifact-folders>。

### 修复

- `workspaceRoots` 为空时不再把工作区外的路径记成「另一个工作区，先不动」。

## 1.0.0 — 2026-11-18

首个可用版本：systemPrompt 注入 + tools.guard 拦截 + 违规回显 + 散文件提醒，33 条断言。
