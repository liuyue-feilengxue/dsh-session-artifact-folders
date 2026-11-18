# dsh-session-artifact-folders

> 让每个会话的产物自动落进以会话标题命名的文件夹，会话之间互不混杂，整理和查找一目了然。

DeepSeek Harness（DSH）插件 · 零依赖 · MIT

---

## 解决的问题

DSH 的一个工作区里往往跑着很多会话：会话 A 生成了两张原型图、会话 B 产出了一份方案、会话 C 写了几个脚本——它们全都落在**同一个工作区根目录**，几十个文件挤在一起，过两周就分不清谁是谁的。

这个插件把「一个会话的产物放进它自己的文件夹」这条约定固化成程序行为：

```
my-workspace/
├── 邮件模板改版/              ← 会话「邮件模板改版」的产物
│   ├── 方案.md
│   └── 预览.png
├── 数据看板原型/              ← 会话「数据看板原型」的产物
│   └── dashboard.html
├── AGENTS.md                 ← 工作区说明，留在根上
└── tools/                    ← 长期工具目录，留在根上
```

目录名 = 会话在侧边栏里的标题（自动规范化）。会话改了标题，目录名跟着改；标题为空时不建目录。

## 它做什么

两条机制，都是非破坏性的：

1. **注入约定（每次组装提示词时）** —— 往会话的 system prompt 里加一段《会话产物目录约定》，明确写出**本会话**该用的目录名（相对当前工作目录）、相对路径规则、允许保留绝对路径的历史接缝清单，以及本会话最近被记下的写死路径。
2. **可选硬拦截（`tools.guard`）** —— `write` / `edit` / `apply_patch` / `present` 的参数里出现「工作区根目录下、且不在豁免清单里」的绝对路径时，把这次调用拒掉，拒绝理由直接给出该改写成什么相对路径。默认是 `warn`（只记录不拦），要硬拦把 `mode` 改成 `deny`。

## 它不做什么（重要）

- **不改写工具入参**。DSH 在分发前就把 `ToolExecution.arguments` 冻成只读的 lossless JSON，`tools/pre-execute` 的契约里明确排除了输入改写。所以插件不能「悄悄把绝对路径改成相对路径」——它只能通过提示词引导，必要时拒绝并告诉你正确写法。
- **不搬、不改、不删任何文件**。搬迁是一次性的人工整理；插件只守住新增产物，历史文件原样不动。
- **不读文件内容、不碰 git**。唯一的磁盘读取是工作区根目录的一次浅扫描（找散落文件，用于提醒），带 20 秒冷却。

## 安装

前置：DSH 已启用插件管理器（profile 里带 `plugin_manager` 工具）。

```text
plugin_manager action=install_bundle target=<本仓库目录的绝对路径>
```

本地目录安装是把这份 checkout **链接**进 profile（junction / symlink），所以源码目录不能删、不能挪，否则插件失效。

安装完成后：

- 装一个新 bundle 通常可经 HMR 即时生效；替换已装包或想彻底干净，重启一次 DSH 更稳。
- 新会话的提示词里应能看到《会话产物目录约定》那一段。
- 想验证拦截：让模型写一个带绝对路径的产物文件，`mode: "deny"` 下应当被拒绝并给出相对写法。

卸载：

```text
plugin_manager action=remove_bundle target=dsh-session-artifact-folders
```

或者临时停用：把 `settings.json` 的 `enabled` 改成 `false`。

## 配置

仓库不自带 `settings.json`（每台机器的工作区根不同，它已在 `.gitignore` 里）。首次使用：

```bash
cp settings.example.json settings.json
```

然后按需改。优先级：内置默认 < `settings.json` < 装配行 `cordis.patch.yml` 的 `config`。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | `false` 则什么都不注册 |
| `mode` | `warn` | `deny` 拦截文件类工具；`warn` 只记账并提示；`off` 完全静默 |
| `shellMode` | `warn` | `off` 不记录；`warn` 记录 shell 命令（`bash`/`pwsh`/`exec`）里的绝对路径，**永不拦截** |
| `enforcedTools` | `write, edit, apply_patch, present` | 参与判定的文件类工具 |
| `shellTools` | `bash, pwsh, exec` | 只做观测的工具 |
| `workspaceRoots` | `[]` | 空 = 所有工作目录都管；填了则只在列出的根下生效 |
| `exemptAbsolute` | `AGENTS.md, /todo/, /tools/, /skills/, .chrome-, .edge-, /.dsh/` | 命中即视为「历史接缝」，绝对路径照用但不许搬 |
| `folderMaxLength` | `40` | 会话标题转目录名的长度上限 |
| `looseScan` / `looseScanTtlMs` | `true` / `20000` | 根目录散文件提醒开关与冷却 |
| `maxReportedViolations` | `4` | 提示词里最多回显几条最近的写死路径 |
| `sectionName` | `session-artifact-folders` | 注入的 section 名（重名会让 DSH 报错，避免撞名） |

## 目录名规则

会话标题 → 目录名：

| 输入（会话标题） | 输出（目录名） |
| --- | --- |
| `工作日热搜Top10与抖音宠物话题日报（微信推送） · 2026-11-10` | 原样保留（36 字，未超上限） |
| `报告/最终版: v2` | `报告 最终版 v2`（`/`、`:` 转空格并折叠） |
| `con` / `NUL` | `_con` / `_NUL`（Windows 保留设备名前缀 `_`） |
| `...` / `   ` | 不建目录（没有可用字符） |
| 超过 40 字 | 截断到 40 字，并去掉结尾的点和空格 |

规则细节：非法字符 `<>:"/\|?*` 与控制字符 → 空格；连续空白折叠；去掉结尾的点和空格；保留设备名加 `_`；按字符数截断。

## 工作原理

```
apply(ctx, config)
├── 读取配置          loadSettings(): DEFAULTS ← settings.json ← 装配行 config
├── inject            ['tools','systemPrompt','sessionProjections','workingDirectory']
├── prompt section    ctx.systemPrompt.section({
│                        name, order: getSectionOrder('HARNESS_SOURCE') + 20,
│                        interpolate: false,
│                        text: (context) => 本会话的目录名 + 规则 + 豁免 + 违规记录
│                     })
└── tool guard        ctx.tools.guard((execution) => deny | undefined)
```

**注入这一侧**（每次组装提示词时同步计算，不落盘、不发事件）：

- `ctx.sessionProjections.snapshot(session, ['title'])` → 会话当前标题（DSH 核心注册的 `title` 投影，读的是 session 事件流）。
- `ctx.workingDirectory.get(session)` → 会话当前工作目录（投影值，同步、无 I/O）。
- 标题经规则表规范化成目录名；工作目录不在 `workspaceRoots` 里则整段不注入。
- 违规记录来自本会话的内存态 `Map<sessionId, {violations, seen, scannedAt, loose}>`，只保留最近 `maxReportedViolations` 条，进程重启即清空。

**拦截这一侧**（同步判定，不阻塞、不抛错）：

1. 不是 `enforcedTools` / `shellTools` 里的工具 → 放行。
2. 取参数文本（shell 取 `arguments.command`，文件类取 `JSON.stringify(arguments)`，顺带把 `\\` 展平）。
3. `findAbsolutePaths()` 用一条正则抽出所有盘符路径（`D:\...`），去重。
4. 逐条判定：命中 `exemptAbsolute` → 跳过；在本会话工作目录下 → 记为违规；在 `workspaceRoots` 里但属于别的工作区 → 只记「另一个工作区，先不动」。
5. `mode` 为 `deny` 且是文件类工具且有本会话违规 → 返回 `{ reason }`，理由里带上正确写法（例如 `"邮件模板改版/方案.md"`）。
6. 其它情况一律放行。shell 永远只观测。

所有对外调用（投影、文件系统、prompt 组装）都包在 `safe()` 里：插件自身出错时降级为「不拦截、不注入」，不会把工具调用带崩。

## 兼容性与已知限制

- **路径语义**：当前只识别 Windows 盘符路径（`C:\...`）。POSIX 系统上的 `/home/...` 不会被视为写死路径——不影响「目录归档」这一主功能，只是少了那层提示。
- **标题变化不迁移旧目录**：会话改名后新目录名生效，旧目录按历史文件对待（插件不搬文件）。
- **`present` 也被纳入判定**：交付文件的绝对路径同样会触发提示。
- **只在 host 侧工作**：不注册任何客户端 UI；插件详情页只有描述与本文档。

## 测试

```bash
npm test          # 等价于 node test/run.mjs
```

测试用 stub 的 ctx 覆盖：标题→目录名规范化、section 文本内容、拒绝/放行判定矩阵、`mode`/`shellMode`/`enabled`/`workspaceRoots` 各档行为、违规回显。无需 DSH 运行时，纯 Node（≥18）。

## 目录结构

```
dsh-session-artifact-folders/
├── package.json            # dsh.bundle.patch -> ./cordis.patch.yml
├── cordis.patch.yml        # 装配行：id / name / config
├── index.js                # apply(ctx, config)：配置、section、guard
├── rules.js                # 纯逻辑：标题规范化、绝对路径抽取、相对换算、豁免
├── settings.example.json   # 配置样板（复制成 settings.json）
├── locale/{zh,en}.json     # 插件面板的标题 / 描述 / 详情页
├── docs/DETAIL.md          # 插件详情页正文
├── test/run.mjs            # 离线单元测试
├── icon.svg                # 插件图标
├── LICENSE
└── README.md
```

## 发布到 Gitee

```bash
git init
git add .
git commit -m "feat: session artifact folders for DeepSeek Harness"
git remote add origin https://gitee.com/<你的用户名>/dsh-session-artifact-folders.git
git push -u origin master
```

上传前把 `package.json` 里三处 `CHANGE_ME` 换成你的 Gitee 用户名（`repository` / `homepage` / `bugs`）。`settings.json` 已在 `.gitignore` 中，不会把本机路径带进仓库。

## License

[MIT](LICENSE)
