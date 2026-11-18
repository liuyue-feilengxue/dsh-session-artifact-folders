# 会话产物目录（dsh-session-artifact-folders）

让每个会话的产物自动落进以会话标题命名的文件夹，会话之间互不混杂，整理和查找一目了然。

## 它做什么

1. **注入约定（systemPrompt section）**：每个会话的提示词里加一段《会话产物目录约定》，直接写出**本会话**该用的目录名（由会话标题规范化而来，相对当前工作目录）。这一段随标题实时变化，因为它是 `text(context)` 函数而不是静态文本。
2. **拦下写死的绝对路径（tools.guard，可选）**：`write` / `edit` / `apply_patch` / `present` 的参数里出现「工作区下、且不在豁免清单里」的绝对路径时，可以拒绝该次调用，理由里给出应当改写的相对路径写法。默认 `warn` 只记账不拦，`mode: "deny"` 才硬拦。
3. **记账**：被拦下（或只记录）的绝对路径按会话累计，注入在提示词末尾，便于一次会话内收敛；跨工作区的绝对路径只记「另一个工作区，先不动」。
4. **散文件提醒**：默认对当前工作目录根做一次浅扫描，根目录有散着的文件时提示一句（只读，不搬）。

## 它不做什么（以及为什么）

- **不改写工具参数**。DSH 把 `ToolExecution.arguments` 冻成只读的 lossless JSON，`tools/pre-execute` 契约里明确排除了输入改写，所以只能引导 +（可选）拒绝，不能替你改成相对路径。
- **不搬历史文件**。搬迁是一次性的人工整理，插件只守住新增产物。
- **shell 命令只观测不拦**。`bash` / `pwsh` / `exec` 里的绝对路径大量来自旧任务、计划任务、跨工作区调用，硬拦会打断正常活。

## 可调项（settings.json）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 关掉则什么都不注册 |
| `mode` | `warn` | `deny` 拦截文件类工具；`warn` 只记账；`off` 完全静默 |
| `shellMode` | `warn` | `off` 连记账都跳过；`warn` 记录 shell 里的绝对路径 |
| `enforcedTools` | `write, edit, apply_patch, present` | 真正会被拒的工具 |
| `shellTools` | `bash, pwsh, exec` | 只做观测的工具 |
| `workspaceRoots` | `[]` | 空 = 所有工作目录；填了则只在这些根下生效 |
| `exemptAbsolute` | `AGENTS.md, /todo/, /tools/, /skills/, .chrome-, .edge-, /.dsh/` | 已知历史接缝，绝对路径照用，但不许搬迁 |
| `folderMaxLength` | `40` | 会话标题转目录名的长度上限 |
| `looseScan` / `looseScanTtlMs` | `true` / `20000` | 根目录浅扫描开关与冷却 |
| `maxReportedViolations` | `4` | 提示词里最多列几条写死路径 |

优先级：内置默认 < `settings.json` < 装配行 `cordis.patch.yml` 的 `config`。改完 `settings.json` 需要重载插件。

## 目录名规则

会话标题 → 目录名：非法字符 `<>:"/\|?*` 与控制字符替换为空格、空白折叠、去掉结尾的点和空格、Windows 保留设备名（`con`/`nul`/`com1`…）前缀 `_`、截断到 40 字符。标题为空或全是非法字符时不注入目录那一行。实测 28 个真实标题，含「工作日热搜Top10与抖音宠物话题日报（微信推送） · 2026-11-10」这类 36 字的都保持原样。

## 与 AGENTS.md 的关系

约定也可以写在工作区的 `AGENTS.md` 里：AGENTS.md 靠模型自觉，插件靠每轮注入 + 拒绝理由把正确写法直接塞回模型眼前。两者冲突时以 AGENTS.md 为准，或者把 `enabled` 设为 `false`。
