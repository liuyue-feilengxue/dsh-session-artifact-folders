/**
 * Pure rule helpers for the session-artifact-folders plugin.
 * No imports beyond node builtins; every function is synchronous and side-effect free
 * so the plugin's guard / prompt section can call them at high frequency.
 */
import path from 'node:path'

/** Characters illegal in a Windows file name, plus C0 controls. */
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g
/** Bare Windows device names that can never be used as a folder name. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Forward-slash, case-folded form for prefix comparisons (same length as the input). */
function canon(p) {
  return String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * Session title -> folder name safe for Windows and readable for humans.
 * @returns normalized name, or null when the title yields nothing usable.
 */
export function normalizeSessionName(title, { maxLength = 40 } = {}) {
  if (typeof title !== 'string') return null
  let out = title.replace(ILLEGAL, ' ').replace(/\s+/g, ' ').trim()
  out = out.replace(/[. ]+$/, '')
  if (!out) return null
  if (RESERVED.test(out)) out = `_${out}`
  if (maxLength > 0 && out.length > maxLength) out = out.slice(0, maxLength).replace(/[. ]+$/, '')
  return out || null
}

/**
 * Drive-qualified path token, tolerant of both native (`D:\a\b`) and JSON-escaped
 * (`D:\\a\\b`) separators. Terminators are shell/JSON punctuation, so a token never
 * swallows the quote or command separator that follows it.
 */
const ABS_PATH_RE = /[A-Za-z]:[\\/][^\s"'`|&;<>()*?]*[^\s"'`|&;<>()*?.,;:\]}\\\/-]/g

/**
 * Every drive-qualified path token appearing in a string, de-duplicated.
 * Escaped separators are flattened first so the returned tokens are usable paths.
 */
export function findAbsolutePaths(text) {
  if (typeof text !== 'string') return []
  const flat = text.replace(/\\\\/g, '\\')
  const out = []
  const seen = new Set()
  let m
  ABS_PATH_RE.lastIndex = 0
  while ((m = ABS_PATH_RE.exec(flat))) {
    const raw = m[0]
    if (raw.length > 3 && !seen.has(canon(raw))) {
      seen.add(canon(raw))
      out.push(raw)
    }
  }
  return out
}

export function looksAbsolute(p) {
  return typeof p === 'string' && /^[A-Za-z]:[\\/]/.test(p)
}

/** Absolute path under `root` -> root-relative posix path (original case kept); else null. */
export function toRelativeUnder(absPath, root) {
  const flat = (p) => String(p).replace(/\\/g, '/')
  const r = canon(root)
  if (!r) return null
  const bare = canon(absPath).replace(/\/+$/, '')
  if (!bare.startsWith(`${r}/`)) return null
  return flat(absPath).slice(r.length + 1) || null
}

export function isUnderRoot(absPath, root) {
  return toRelativeUnder(absPath, root) !== null
}

/** True when the absolute path matches one of the exempt substrings / prefixes. */
export function isExempt(absPath, exempt) {
  const c = canon(absPath)
  for (const raw of exempt || []) {
    if (typeof raw !== 'string' || !raw) continue
    if (c.includes(canon(raw))) return true
  }
  return false
}

/** Root-relative loose files only: nothing nested under a directory, no dotfiles. */
export function looseRootFiles(rootRelFiles, dirs) {
  return (rootRelFiles || []).filter((f) => !f.includes('/') && !f.startsWith('.') && !dirs.has(f.toLowerCase()))
}

/** One-line, model-facing hint telling the caller what to write instead. */
export function relativeHint(absPath, root, folder) {
  const rel = toRelativeUnder(absPath, root)
  const suggestion = rel === null ? String(absPath) : rel
  const scoped = folder && !suggestion.startsWith(`${folder}/`) ? `${folder}/${path.posix.basename(suggestion)}` : suggestion
  return `改用相对当前工作目录的路径：${JSON.stringify(scoped)}`
}
