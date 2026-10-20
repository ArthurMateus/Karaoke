// Screenshots of every screen at phone (390 px) and desktop (1280 px) width, for the UI polish step.
//
//   node scripts/ui-shots.mjs before            -> design/shots/ui-polish/<phase>-<screen>-before-<width>.png
//   node scripts/ui-shots.mjs after p2          -> only the screens of phase 2 ("p2"), named ...-after-...
//
// It drives a headless Microsoft Edge over the DevTools protocol (no extra packages): signs in two
// test accounts through Mailpit, makes a room, lets the robot singer sing, and photographs each state.
// Needs the app running (docker compose up) and the API started with the test host as an admin:
//   ADMIN_EMAILS="<your admin emails>,shots-host@example.com" docker compose up -d api
// (afterwards a plain `docker compose up -d api` puts the normal admin list back).
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [which = 'before', onlyPhase = ''] = process.argv.slice(2)
const OUT = join(import.meta.dirname, '..', 'design', 'shots', 'ui-polish')
const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const HOST = 'http://localhost:8080'
const GUEST = 'http://127.0.0.1:8080' // a different site for the browser: separate cookies
const MAILPIT = 'http://localhost:8025'
const HOST_EMAIL = 'shots-host@example.com'
const WIDTHS = [390, 1280]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })

// ---------- A tiny DevTools protocol client ----------
const port = 9300 + Math.floor(Math.random() * 500)
const profile = mkdtempSync(join(tmpdir(), 'kp-shots-'))
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--hide-scrollbars', '--lang=en-US', '--mute-audio', '--no-first-run', '--disable-features=Translate', 'about:blank',
], { stdio: 'ignore' })

let ws
for (let i = 0; i < 50 && !ws; i++) {
  try {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    ws = new WebSocket(webSocketDebuggerUrl)
  } catch {
    await sleep(200)
  }
}
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let nextId = 1
const pending = new Map()
const listeners = []
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  } else if (msg.method) {
    for (const l of listeners) l(msg)
  }
})
const cdp = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })

// In-page helpers, added to every page.
const HELPERS = `
window.__visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
window.__find = (text, sel = 'button, a, summary, [role=radio], [role=tab], label') => {
  const els = [...document.querySelectorAll(sel)].filter(__visible)
  const t = (el) => (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim()
  return els.find((el) => t(el) === text) || els.find((el) => t(el).includes(text))
}
window.__click = (text, sel) => { const el = __find(text, sel); if (!el || el.disabled) return false; el.click(); return true }
window.__type = (selector, value) => {
  const el = document.querySelector(selector); if (!el) return false
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true })); return true
}
window.__has = (text) => document.body.innerText.toLowerCase().includes(text.toLowerCase())
`

async function newPage() {
  const { browserContextId } = await cdp('Target.createBrowserContext', { disposeOnDetach: true })
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId })
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  const s = (method, params) => cdp(method, params, sessionId)
  await s('Page.enable')
  await s('Runtime.enable')
  await s('Page.addScriptToEvaluateOnNewDocument', { source: HELPERS })
  // Always English, whatever the PC's language (the texts above are looked up in English).
  const { userAgent } = await cdp('Browser.getVersion')
  await s('Emulation.setUserAgentOverride', { userAgent: userAgent.replace('HeadlessChrome', 'Chrome'), acceptLanguage: 'en-US', platform: 'Win32' })
  await s('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  const page = {
    async goto(url) {
      const loaded = new Promise((r) => {
        const l = (m) => m.sessionId === sessionId && m.method === 'Page.loadEventFired' && (listeners.splice(listeners.indexOf(l), 1), r())
        listeners.push(l)
      })
      await s('Page.navigate', { url })
      await Promise.race([loaded, sleep(15000)])
      await sleep(800)
    },
    async eval(expression) {
      const res = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text)
      return res.result.value
    },
    async waitFor(expression, timeout = 15000, what = expression) {
      const end = Date.now() + timeout
      while (Date.now() < end) {
        if (await page.eval(expression).catch(() => false)) return true
        await sleep(250)
      }
      throw new Error(`timed out waiting for ${what}`)
    },
    async click(text, sel) {
      await page.waitFor(`!!__find(${JSON.stringify(text)}${sel ? `, ${JSON.stringify(sel)}` : ''})`, 15000, `"${text}"`)
      if (!(await page.eval(`__click(${JSON.stringify(text)}${sel ? `, ${JSON.stringify(sel)}` : ''})`))) throw new Error(`can't click "${text}"`)
      await sleep(400)
    },
    fetch: (path, body, method) =>
      page.eval(`fetch(${JSON.stringify(path)}, ${JSON.stringify({
        method: method ?? (body ? 'POST' : 'GET'), credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
      })}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }))`),
    /** Full-page shot at each width. */
    async shot(phase, screen, widths = WIDTHS) {
      if (onlyPhase && phase !== onlyPhase) return
      for (const width of widths) {
        await s('Emulation.setDeviceMetricsOverride', { width, height: width < 500 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 500 })
        await sleep(700)
        const height = await page.eval('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight)')
        const { data } = await s('Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(height, 6000), scale: 1 },
        })
        const file = join(OUT, `${phase}-${screen}-${which}-${width}.png`)
        writeFileSync(file, Buffer.from(data, 'base64'))
        console.log('  saved', file.split(/[\\/]/).slice(-1)[0])
      }
      await s('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    },
  }
  return page
}

async function signIn(page, email) {
  await page.goto(`${HOST}/`)
  const before = Date.now()
  const r = await page.fetch('/api/auth/magic-link', { email, locale: 'en', next: '/' })
  if (r.status !== 202) throw new Error(`magic link: ${r.status}`)
  let link
  for (let i = 0; i < 40 && !link; i++) {
    await sleep(300)
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/messages?limit=20`)).json()
    const msg = messages.find((m) => m.To?.[0]?.Address === email && new Date(m.Created).getTime() >= before - 2000)
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()
      link = full.Text.match(/\/auth\/verify\?[^\s"<>]+/)?.[0]
    }
  }
  if (!link) throw new Error('no sign-in email')
  await page.goto(`${HOST}${link}`)
  await page.waitFor(`location.pathname === '/'`, 15000, 'signed in')
}

/** Turn on the robot mic, do the delay check, press ready. */
async function getReady(page) {
  await page.click('Turn on my microphone')
  await page.waitFor(`!!__find('Start the check') || !!__find("I'm ready to sing")`, 15000, 'mic on')
  if (await page.eval(`!!__find('Start the check')`)) await page.click('Start the check')
  await page.waitFor(`__has('Your mic delay') || __has("couldn't hear you")`, 20000, 'delay check')
  if (await page.eval(`__has("couldn't hear you")`)) await page.click('Skip (use a typical delay)')
  await page.click("I'm ready to sing")
}

const steps = []
const step = (name, fn) => steps.push({ name, fn })
const ctx = {}

// ---------- The screens ----------
step('signed-out pages', async () => {
  const p = (ctx.anon = await newPage())
  await p.goto(`${HOST}/`)
  await p.waitFor(`__has('Join with a code')`)
  await p.shot('p2', 'home-signed-out')
  await p.goto(`${HOST}/sign-in`)
  await p.shot('p6', 'sign-in')
  await p.goto(`${HOST}/auth/verify?token=expired-example`)
  await p.waitFor(`__has("didn't work")`)
  await p.shot('p6', 'verify-failed')
})

step('host signs in', async () => {
  const p = (ctx.host = await newPage())
  await signIn(p, HOST_EMAIL)
  // Start every run as a free host: revoke premium left over from an earlier run.
  const grants = await p.fetch('/api/admin/grants')
  if (grants.status !== 200) throw new Error('the test host is not an admin (see the top of this file)')
  for (const g of grants.data.filter((g) => g.email === HOST_EMAIL && !g.revoked)) await p.fetch(`/api/admin/grants/${g.id}/revoke`, {})
  await p.goto(`${HOST}/`)
  await p.waitFor(`__has('Create a room')`)
  await p.shot('p2', 'home')
})

step('account pages', async () => {
  const p = ctx.host
  await p.goto(`${HOST}/profile`)
  await p.waitFor(`__has('Your plan')`)
  await p.shot('p6', 'profile-free')
  await p.goto(`${HOST}/songs`)
  await p.waitFor(`__has('Starter library')`)
  await p.shot('p5', 'songs')
  await p.goto(`${HOST}/songs/upload`)
  await p.shot('p5', 'upload')
  await p.goto(`${HOST}/songs/import`)
  await p.shot('p5', 'import')
  const songs = await p.fetch('/api/songs')
  ctx.twinkle = songs.data.starter.find((s) => s.title.startsWith('Twinkle'))
  ctx.duet = songs.data.starter.find((s) => s.is_duet)
  await p.goto(`${HOST}/songs/${ctx.twinkle.id}/edit`)
  await p.waitFor(`!!document.querySelector('.piano-roll svg, svg')`)
  await p.shot('p5', 'editor')
  await p.goto(`${HOST}/solo`)
  await p.waitFor(`__has('Sing')`)
  await p.shot('p5', 'solo')
  await p.goto(`${HOST}/solo/${ctx.twinkle.id}?robot`)
  await p.shot('p5', 'solo-sing')
  await p.goto(`${HOST}/daily`)
  await p.waitFor(`__has('leaderboard')`)
  await p.shot('p5', 'daily')
})

step('lobby, host alone', async () => {
  const p = ctx.host
  const room = await p.fetch('/api/rooms', {})
  ctx.code = room.data.code
  await p.goto(`${HOST}/room/${ctx.code}?robot`)
  await p.waitFor(`__has('Turn on my microphone')`)
  await p.shot('p2', 'lobby-new')
})

step('guest joins', async () => {
  const g = (ctx.guest = await newPage())
  await g.goto(`${GUEST}/join/${ctx.code}`)
  await g.waitFor(`!!document.querySelector('input')`)
  await g.shot('p6', 'join')
  await g.eval(`__type('input', 'Lia')`)
  await g.click('Join as guest')
  await g.waitFor(`location.pathname.startsWith('/room/')`)
  await g.goto(`${GUEST}/room/${ctx.code}?robot`)
  await g.waitFor(`__has('Turn on my microphone')`)
})

step('lobby, everyone ready', async () => {
  const { host, guest } = ctx
  await getReady(host)
  await getReady(guest)
  if (!(await host.eval(`!!document.querySelector('details.picker[open]')`))) await host.click('Pick a song', 'summary')
  await host.eval(`[...document.querySelectorAll('.pick')].find((li) => li.innerText.includes('Twinkle'))?.querySelector('button')?.click()`)
  await host.waitFor(`__has('Song loaded')`, 30000)
  await guest.waitFor(`__has('Song loaded')`, 30000)
  await host.shot('p2', 'lobby-ready-host')
  await guest.shot('p2', 'lobby-ready-guest')
})

step('sing together', async () => {
  const { host, guest } = ctx
  await host.click('Start the song')
  await sleep(2500)
  await host.shot('p3', 'sing-countdown', [390])
  await guest.shot('p3', 'sing-countdown', [1280])
  await sleep(9000)
  await host.shot('p3', 'sing-playing', [390])
  await guest.shot('p3', 'sing-playing', [1280])
  await host.waitFor(`__has('Results')`, 180000, 'results')
  await sleep(4000)
  await host.shot('p3', 'results-host')
  await guest.shot('p3', 'results-guest')
  await host.click('Pick the next song')
})

step('stage screen', async () => {
  const p = ctx.host
  const stage = await p.fetch(`/api/rooms/${ctx.code}/stage`)
  const s = (ctx.stage = await newPage())
  // The stage has no account: it's just a link with a token, so a fresh browser context is right.
  await s.goto(`${HOST}/stage/${ctx.code}?t=${encodeURIComponent(stage.data.token)}`)
  await s.shot('p4', 'stage-start', [1280])
  await s.click('Start the stage')
  await sleep(1500)
  await s.shot('p4', 'stage-lobby', [1280])
})

step('premium host, admin page', async () => {
  const p = ctx.host
  await p.fetch('/api/admin/grants', { email: HOST_EMAIL, kind: 'premium', days: 30, note: 'screenshots' })
  await p.fetch('/api/admin/codes', { kind: 'party_pass', count: 2, max_uses: 5, expires_in_days: 30, note: 'screenshots' })
  await p.goto(`${HOST}/admin`)
  await p.waitFor(`__has('Recent grants')`)
  await p.shot('p6', 'admin')
  await p.goto(`${HOST}/profile`)
  await p.waitFor(`__has('Your plan')`)
  await p.shot('p6', 'profile-premium')
})

step('spotlight lobby', async () => {
  const { host, guest } = ctx
  await host.goto(`${HOST}/room/${ctx.code}?robot`)
  await guest.goto(`${GUEST}/room/${ctx.code}?robot`)
  await getReady(host)
  await getReady(guest)
  await host.click('Spotlight', '[role=radio]')
  await host.waitFor(`__has('Add my turn')`)
  for (const [page, title] of [[host, 'Twinkle'], [guest, 'Row, Row']]) {
    await page.click('Add my turn')
    await page.waitFor(`!!document.querySelector('.pick')`)
    await page.eval(`[...document.querySelectorAll('.pick')].find((li) => li.innerText.includes(${JSON.stringify(title)}))?.querySelector('button')?.click()`)
    await sleep(500)
    if (await page.eval(`__has('Add to the queue')`)) await page.click('Add to the queue')
  }
  await host.waitFor(`document.querySelectorAll('.queue-entry, .queue li').length >= 2`)
  await host.shot('p2', 'lobby-spotlight-host')
  await guest.shot('p2', 'lobby-spotlight-guest')
})

step('spotlight turn', async () => {
  const { host, guest, stage } = ctx
  // The host is first in the queue: "Start my turn" (older builds said "Start <name>'s turn").
  if (!(await host.eval(`__click('Start my turn', 'button')`))) await host.click("'s turn", 'button')
  await sleep(10000)
  await guest.eval(`document.querySelector('.reaction-button')?.click()`)
  await host.eval(`document.querySelector('.reaction-button')?.click()`)
  await sleep(500)
  await guest.shot('p3', 'spotlight-audience')
  if (stage) await stage.shot('p4', 'stage-singing', [1280])
  await guest.waitFor(`__has('Tap the stars')`, 180000, 'voting')
  await guest.eval(`document.querySelectorAll('.star')[4]?.click()`)
  await sleep(1500)
  await host.shot('p3', 'spotlight-results-host')
  await guest.shot('p3', 'spotlight-results-guest')
  if (stage) await stage.shot('p4', 'stage-results', [1280])
})

for (const { name, fn } of steps) {
  console.log(name)
  try {
    await fn()
  } catch (err) {
    console.log(`  FAILED: ${err.message}`)
  }
}
ws.close()
edge.kill()
process.exit(0)
