// Offline unit test: stubs the Cordis ctx surface the plugin uses (effect /
// systemPrompt.section / tools.guard / sessionProjections.snapshot /
// workingDirectory.get) and asserts the rule behaviour. No DSH runtime needed.
//
//   node test/run.mjs        (or: npm test)
//
import assert from 'node:assert'
import { apply, loadSettings, DEFAULTS } from '../index.js'

// Fixture strings only — nothing is written; the loose-file scan is defensive and
// tolerates a non-existent root.
const ROOT = 'D:\\deepseek工作区\\工作'
const sessions = new Map([
  ['s1', { id: 's1', title: '测试会话', root: ROOT }],
  ['s2', { id: 's2', title: null, root: ROOT }],
  ['s3', { id: 's3', title: '外部项目', root: 'C:\\Users\\someone\\proj' }],
])

// The shipped config this machine runs with: only 工作区 is policed, deny is on.
const LOCAL = { mode: 'deny', workspaceRoots: ['D:/deepseek工作区'] }

const sections = []
const guards = []
const disposers = []

const ctx = {
  effect: (fn, label) => {
    const r = fn()
    disposers.push([label, r])
    return r
  },
  systemPrompt: {
    section: (s) => {
      sections.push(s)
      return () => {}
    },
    getSectionOrder: () => 10000,
  },
  tools: {
    guard: (g) => {
      guards.push(g)
      return () => {}
    },
  },
  sessionProjections: {
    snapshot: (session) => ({ asOfSeq: 1, values: { title: sessions.get(session.id)?.title ?? null } }),
  },
  workingDirectory: {
    get: (session) => sessions.get(session.id)?.root ?? null,
  },
}

apply(ctx, LOCAL)
assert.equal(sections.length, 1, 'one prompt section')
assert.equal(guards.length, 1, 'one tool guard')
assert.equal(disposers.length, 2)
for (const [label, dispose] of disposers) assert.equal(typeof dispose, 'function', label)

const text = (id) => sections[0].text({ agent: { session: sessions.get(id) } })
const guard = (id, name, args) => guards[0]({ name, arguments: args, agent: { session: sessions.get(id) } })

// --- section text -----------------------------------------------------------
const t1 = text('s1')
assert.ok(t1.includes('`测试会话/`'), 'folder line uses normalized title')
assert.ok(t1.includes('相对路径'), 'relative-path rule present')
assert.ok(!t1.includes(ROOT + '\\'), 'does not teach an absolute prefix')
assert.equal(text('s3'), '', 'working directory outside the configured roots contributes nothing')
assert.ok(text('s2').includes('还没有标题'), 'titleless session still gets the rule')
assert.equal(sections[0].interpolate, false)
assert.equal(sections[0].name, DEFAULTS.sectionName)
assert.ok(sections[0].order > 10000, 'ordered after HARNESS_SOURCE')
assert.equal(sections[0].text({ agent: undefined }), '', 'no agent, no text')

// --- guard: the case the plugin exists for ----------------------------------
const deny = guard('s1', 'write', { file_path: `${ROOT}\\新建说明.md`, content: 'x' })
assert.ok(deny && typeof deny.reason === 'string', 'absolute in-root write is denied')
assert.ok(deny.reason.includes('"测试会话/新建说明.md"'), 'reason shows the artifact-folder spelling')
assert.ok(guard('s1', 'edit', { file_path: `${ROOT}\\报告\\a.md`, old_string: 'a', new_string: 'b' }), 'edit is policed too')
assert.ok(guard('s1', 'apply_patch', { patch: `*** Add File: ${ROOT}\\x.md` }), 'apply_patch is policed')
assert.ok(guard('s1', 'present', { files: [{ path: `${ROOT}\\报告\\a.md` }] }), 'present is policed')

// --- guard: must stay out of the way --------------------------------------
assert.equal(guard('s1', 'write', { file_path: '新建说明.md' }), undefined, 'relative path allowed')
assert.equal(guard('s1', 'write', { file_path: `${ROOT}\\AGENTS.md` }), undefined, 'AGENTS.md exempt')
assert.equal(guard('s1', 'write', { file_path: `${ROOT}\\todo\\todo.mjs` }), undefined, 'legacy todo/ exempt')
assert.equal(guard('s1', 'write', { file_path: 'C:\\Windows\\notepad.exe' }), undefined, 'outside family allowed')
assert.equal(guard('s1', 'write', { file_path: 'D:\\deepseek工作区\\赚钱\\tools\\x.mjs' }), undefined, 'exempt legacy path in another workspace: allowed')
assert.equal(guard('s1', 'write', { file_path: 'D:\\deepseek工作区\\杂项\\散文件.md' }), undefined, 'other workspace: note only, never deny')
assert.equal(guard('s1', 'pwsh', { command: `node "${ROOT}\\todo\\todo.mjs" list` }), undefined, 'shell never denied')
assert.equal(guard('s1', 'read', { file_path: `${ROOT}\\AGENTS.md` }), undefined, 'read not enforced')
assert.equal(guard('s3', 'write', { file_path: 'C:\\Users\\someone\\proj\\a.md' }), undefined, 'foreign session untouched')

// --- violations reach the next prompt assembly -----------------------------
const t1b = text('s1')
assert.ok(t1b.includes('检测到的写死路径'), 'denied path is surfaced back to the model')
assert.ok(t1b.includes('杂项'), 'cross-workspace sighting is recorded (not denied)')
assert.ok(!t1b.includes('赚钱'), 'exempt legacy paths are never nagged about')

// --- knobs ----------------------------------------------------------------
assert.equal(loadSettings({ mode: 'warn' }).mode, 'warn')
assert.equal(loadSettings({ enforcedTools: 'nope' }).enforcedTools, DEFAULTS.enforcedTools, 'bad array falls back')
assert.equal(DEFAULTS.mode, 'warn', 'shipped default never blocks')
assert.equal(DEFAULTS.workspaceRoots.length, 0, 'shipped default covers every workspace')

/** Run apply() with overrides; returns the registered section + guard for one session. */
const capture = (overrides, sessionId = 's1') => {
  const sec = []
  const grd = []
  apply(
    {
      effect: (fn) => fn(),
      systemPrompt: { section: (s) => (sec.push(s), () => {}), getSectionOrder: () => 10000 },
      tools: { guard: (g) => (grd.push(g), () => {}) },
      sessionProjections: ctx.sessionProjections,
      workingDirectory: ctx.workingDirectory,
    },
    { ...LOCAL, ...overrides },
  )
  return {
    registered: sec.length + grd.length,
    text: () => (sec[0] ? sec[0].text({ agent: { session: sessions.get(sessionId) } }) : ''),
    guard: (name, args) => (grd[0] ? grd[0]({ name, arguments: args, agent: { session: sessions.get(sessionId) } }) : undefined),
  }
}

const warnOnly = capture({ mode: 'warn' })
assert.equal(warnOnly.guard('write', { file_path: `${ROOT}\\warn-me.md` }), undefined, 'warn mode never denies')
assert.ok(warnOnly.text().includes('检测到的写死路径'), 'warn mode still reports')

const off = capture({ mode: 'off' })
assert.equal(off.guard('write', { file_path: `${ROOT}\\quiet.md` }), undefined, 'off mode never denies')
assert.ok(!off.text().includes('检测到的写死路径'), 'off mode stays silent')

const shellOff = capture({ shellMode: 'off' })
assert.equal(shellOff.guard('pwsh', { command: `Get-ChildItem "${ROOT}\\x.md"` }), undefined, 'shell off = not even recorded')
assert.ok(!shellOff.text().includes('x.md'), 'shell sighting not recorded when shellMode=off')

const shellWarn = capture({ shellMode: 'warn' })
assert.equal(shellWarn.guard('pwsh', { command: `Get-ChildItem "${ROOT}\\loud.md"` }), undefined, 'shell warn never denies')
assert.ok(shellWarn.text().includes('loud.md'), 'shell warn is recorded')

assert.equal(capture({ enabled: false }).registered, 0, 'disabled plugin registers nothing')

// --- empty workspaceRoots = every workspace is in scope -------------------
const global = capture({ workspaceRoots: [] })
assert.ok(global.text('s1').includes('`测试会话/`'), 'unrestricted roots still guide the session')
const foreignText = capture({ workspaceRoots: [] }, 's3').text()
assert.ok(foreignText.includes('`外部项目/`'), 'unrestricted roots guide a foreign cwd too')
const foreignGuard = capture({ workspaceRoots: [] }, 's3')
assert.ok(foreignGuard.guard('write', { file_path: 'C:\\Users\\someone\\proj\\a.md' }), 'unrestricted roots police the foreign cwd itself')
assert.ok(!global.text().includes('另一个工作区'), 'no cross-workspace notes without configured roots')

console.log('OK  33+ assertions passed')
console.log('---')
console.log(`section lines: ${t1.split('\n').length}`)
console.log(t1.split('\n').slice(0, 6).join('\n'))
console.log('---\ndeny reason:', deny.reason)
