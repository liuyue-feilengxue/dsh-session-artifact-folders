# 变更记录

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 1.1.0 — 2026-11-18

开源版本。

### 新增

- `LICENSE`（MIT）、`.gitignore`、`settings.example.json`、`CHANGELOG.md`。
- 离线单元测试 `test/run.mjs` 与 `npm test`（stub ctx，无需 DSH 运行时）。
- README 重写为对外文档：安装、配置表、目录名规则、工作原理、已知限制、Gitee 发布步骤。
- `package.json` 补齐 `license` / `author` / `keywords` / `engines` / `repository` / `homepage` / `bugs` / `scripts`，并导出 `./rules`。
- 新增断言：`apply_patch` 参与判定、无 agent 时不注入、`workspaceRoots: []` 时任意工作目录都生效。

### 变更

- **默认 `mode` 由 `deny` 改为 `warn`**：开箱即用只做引导与记账，不打断任何工具调用。需要硬拦截请在 `settings.json` 里写 `"mode": "deny"`。
- **默认 `workspaceRoots` 由写死的一台机器路径改为 `[]`**（空 = 所有工作目录），插件不再绑定作者机器。
- 插件描述文案改为：「让每个会话的产物自动落进以会话标题命名的文件夹，会话之间互不混杂，整理和查找一目了然。」
- `settings.json` 移入 `.gitignore`，仓库只带 `settings.example.json`（本机配置不进仓库）。

### 修复

- `workspaceRoots` 为空时不再把工作区外的路径记成「另一个工作区，先不动」。

## 1.0.0 — 2026-11-18

首个可用版本：systemPrompt 注入 + tools.guard 拦截 + 违规回显 + 散文件提醒，33 条断言。
