/**
 * session-artifact-folders — Host plugin that keeps every DSH workspace tidy: one
 * folder per session (named after the session title) holds that session's artifacts,
 * and artifacts are addressed by paths **relative to the session's working
 * directory**, never by hardcoded absolute paths.
 *
 * Two mechanisms, both non-destructive and both purely advisory by default:
 *  1. a per-assembly system-prompt section telling the model its artifact folder, the
 *     relative-path rule, the exempted legacy paths, and any violations just detected;
 *  2. a `tools.guard` that can deny a file-writing tool call whose path is a hardcoded
 *     absolute path inside the session's own workspace root, with the exact relative
 *     spelling to use instead (`mode: "deny"`; the shipped default is `"warn"`).
 *     Shell commands are only observed, never denied.
 *
 * The plugin never rewrites tool arguments — DSH freezes them before dispatch — and
 * never moves, renames or deletes a file by itself.
 *
 * Tunables live in `settings.json` next to this file (plain JSON, no schema service
 * needed).
 *
 * @module dsh-session-artifact-folders
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeSessionName,
  findAbsolutePaths,
  toRelativeUnder,
  isUnderRoot,
  isExempt,
  relativeHint,
} from './rules.js'

export const name = 'session-artifact-folders'
export const inject = ['tools', 'systemPrompt', 'sessionProjections', 'workingDirectory']

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * Defaults: safe out of the box for any workspace, every key overridable in
 * settings.json / row config. `workspaceRoots: []` means "wherever the session
 * works"; list roots to limit the plugin to a known set of workspaces.
 */
export const DEFAULTS = {
  enabled: true,
  /** off | warn | deny — applies to file-writing tools listed in `enforcedTools`. */
  mode: 'warn',
  /** off | warn — absolute paths inside shell commands are only ever observed. */
  shellMode: 'warn',
  enforcedTools: ['write', 'edit', 'apply_patch', 'present'],
  shellTools: ['bash', 'pwsh', 'exec'],
  /** Empty = every working directory; otherwise only these roots are policed. */
  workspaceRoots: [],
  /** Substrings that mark a hardcoded path as a known legacy seam (never denied). */
  exemptAbsolute: ['AGENTS.md', '/todo/', '/tools/', '/skills/', '.chrome-', '.edge-', '/.dsh/'],
  folderMaxLength: 40,
  /** Surface loose files sitting at the workspace root in the prompt section. */
  looseScan: true,
  looseScanTtlMs: 20000,
  /** Cap on how many recent violations are shown back to the model. */
  maxReportedViolations: 4,
  sectionName: 'session-artifact-folders',
}

/** Read settings.json (if present) and layer the row config on top of the defaults. */
export function loadSettings(rowConfig) {
  let fromFile = {}
  try {
    fromFile = JSON.parse(readFileSync(path.join(HERE, 'settings.json'), 'utf8'))
  } catch {}
  const merged = { ...DEFAULTS, ...fromFile, ...(rowConfig && typeof rowConfig === 'object' ? rowConfig : {}) }
  for (const key of ['enforcedTools', 'shellTools', 'workspaceRoots', 'exemptAbsolute']) {
    if (!Array.isArray(merged[key])) merged[key] = DEFAULTS[key]
  }
  return merged
}

function safe(fn, fallback) {
  try {
    const value = fn()
    return value === undefined ? fallback : value
  } catch {
    return fallback
  }
}

function titleOf(ctx, session) {
  return safe(() => ctx.sessionProjections.snapshot(session, ['title']).values.title, null)
}

function folderName(ctx, session, settings) {
  const title = titleOf(ctx, session)
  return title ? normalizeSessionName(title, { maxLength: settings.folderMaxLength }) : null
}

/** Configured roots; an empty list means "every workspace is in scope". */
function rootsOf(settings) {
  return Array.isArray(settings.workspaceRoots) ? settings.workspaceRoots.filter((r) => typeof r === 'string' && r) : []
}

/** Is this directory (or path) inside the family of roots the plugin cares about? */
function insideFamily(p, settings) {
  const roots = rootsOf(settings)
  if (!roots.length) return true
  return roots.some((root) => isUnderRoot(p, root) || toRelativeUnder(p, root) === '')
}

function stateOf(map, session) {
  let state = map.get(session.id)
  if (!state) {
    state = { violations: [], seen: new Set(), scannedAt: 0, loose: [] }
    map.set(session.id, state)
  }
  return state
}

function recordViolation(state, settings, abs, rel) {
  const key = rel === null ? `foreign:${abs}` : `local:${rel.toLowerCase()}`
  if (state.seen.has(key)) return
  state.seen.add(key)
  state.violations.push({ abs, rel, at: Date.now() })
  while (state.violations.length > settings.maxReportedViolations) state.violations.shift()
}

/** Loose files at the workspace root (not inside any directory, no dotfiles). */
function scanLoose(root, settings) {
  const entries = safe(() => readdirSync(root, { withFileTypes: true }), [])
  const out = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (entry.name.startsWith('.')) continue
    if (isExempt(entry.name, ['AGENTS.md'])) continue
    if (isExempt(`/${entry.name}/`, settings.exemptAbsolute)) continue
    out.push(entry.name)
    if (out.length >= 8) break
  }
  return out
}

function sectionText(ctx, agent, settings, states) {
  const session = agent?.session
  if (!session) return ''
  const root = safe(() => ctx.workingDirectory.get(session), null)
  if (!root || !insideFamily(root, settings)) return ''
  const folder = folderName(ctx, session, settings)
  const state = stateOf(states, session)

  const lines = ['【会话产物目录约定】（由 dsh-session-artifact-folders 插件维护，与 AGENTS.md 同源）']
  if (folder) {
    lines.push(`1. 本会话的产物放进与本会话标题同名的目录：\`${folder}/\`（路径相对当前工作目录）。工具参数直接写 \`${folder}/文件名.ext\`。`)
  } else {
    lines.push('1. 本会话还没有标题：定下标题后产物目录名就用那个标题；在那之前先别在工作区根目录散放文件。')
  }
  lines.push('2. 新产物一律用**相对路径**，不要把工作区的绝对路径写进文件或命令——目录一旦改名，写死的引用全断。')
  if (settings.exemptAbsolute.length) {
    lines.push(`3. 已知历史接缝可以按绝对路径引用、但不要搬迁：${settings.exemptAbsolute.map((x) => `\`${x}\``).join('、')}。`)
  }
  if (settings.looseScan && settings.mode !== 'off') {
    const now = Date.now()
    if (now - state.scannedAt > settings.looseScanTtlMs) {
      state.scannedAt = now
      state.loose = safe(() => scanLoose(root, settings), [])
    }
    if (state.loose.length) {
      lines.push(`4. 当前工作区根目录还有散文件没归档：${state.loose.map((x) => `\`${x}\``).join('、')}。确认归属后搬进对应会话目录（不要静默搬动别人的历史文件）。`)
    }
  }
  if (state.violations.length) {
    lines.push(`检测到的写死路径（本会话内）：${state.violations
      .map((v) => `\`${v.abs}\`${v.rel ? ` → 应写 \`${v.rel}\`` : '（另一个工作区，先不动）'}`)
      .join('；')}`)
  }
  return lines.join('\n')
}

function guardFactory(ctx, settings, states) {
  return (execution) => {
    const tool = execution?.name
    const isShell = (settings.shellTools || []).includes(tool)
    const isFile = (settings.enforcedTools || []).includes(tool)
    if (!isShell && !isFile) return undefined
    const session = execution?.agent?.session
    if (!session) return undefined
    const root = safe(() => ctx.workingDirectory.get(session), null)
    if (!root || !insideFamily(root, settings)) return undefined

    const raw = isShell
      ? String(execution.arguments?.command ?? execution.arguments?.cmd ?? '')
      : safe(() => JSON.stringify(execution.arguments ?? ''), '')
    const hits = findAbsolutePaths(raw)
    if (!hits.length) return undefined

    const state = stateOf(states, session)
    const mode = isShell ? settings.shellMode : settings.mode
    if (mode === 'off') return undefined
    const local = []
    for (const abs of hits) {
      if (isExempt(abs, settings.exemptAbsolute)) continue
      const rel = toRelativeUnder(abs, root)
      if (rel) local.push({ abs, rel })
      else if (rootsOf(settings).length && insideFamily(abs, settings)) recordViolation(state, settings, abs, null)
    }
    for (const item of local) recordViolation(state, settings, item.abs, item.rel)

    // Shell is observation-only: legacy tasks legitimately carry absolute paths.
    if (isShell || mode !== 'deny') return undefined
    const first = local[0]
    if (!first) return undefined
    const folder = folderName(ctx, session, settings)
    return {
      reason:
        `[session-artifact-folders] 产物不能写死绝对路径。${relativeHint(first.abs, root, folder)}。` +
        (folder ? `本会话产物目录：\`${folder}/\`。` : '') +
        '写死的绝对路径在目录改名或搬家后会全部失效。' +
        `若这条路径属于历史接缝，请把它加入插件 settings.json 的 exemptAbsolute，或改用相对路径后重试。`,
    }
  }
}

export function apply(ctx, config) {
  const settings = loadSettings(config)
  if (!settings.enabled) return
  const states = new Map()

  ctx.effect(() => ctx.systemPrompt.section({
    name: settings.sectionName,
    order: safe(() => ctx.systemPrompt.getSectionOrder('HARNESS_SOURCE'), 10000) + 20,
    interpolate: false,
    text: (context) => safe(() => sectionText(ctx, context.agent, settings, states), ''),
  }), 'session-artifact-folders.section()')

  ctx.effect(() => {
    const guard = guardFactory(ctx, settings, states)
    return safe(() => ctx.tools.guard((execution) => safe(() => guard(execution), undefined)), () => {})
  }, 'session-artifact-folders.guard()')
}
