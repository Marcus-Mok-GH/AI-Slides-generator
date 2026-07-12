/**
 * Browser tool for Agent Five — interactive headless browser via puppeteer-core.
 *
 * Safety guards:
 *   - URL whitelist / blocklist
 *   - Max navigation timeout
 *   - No file downloads (blocked by intercepting requests)
 *   - Screenshot size limits (max 1920x1080)
 *
 * Supported actions:
 *   navigate   { url: string }
 *   click      { selector: string }
 *   type       { selector: string, text: string }
 *   extract    { selector?: string }   — returns text content
 *   screenshot { selector?: string }    — returns base64 PNG
 *
 * On Vercel serverless, uses @sparticuz/chromium if available, otherwise
 * falls back to local chrome via puppeteer-core. If neither is available,
 * throws a helpful error so the agent can continue without browser.
 */

const MAX_NAV_TIMEOUT = 30_000
const MAX_SCREENSHOT_W = 1920
const MAX_SCREENSHOT_H = 1080

// Blocklist: never visit these
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]

// Whitelist: if non-empty, ONLY these hosts are allowed
const ALLOWED_HOSTS = [] // e.g. ['example.com', 'wikipedia.org']

function isHostBlocked(hostname) {
  const h = hostname.toLowerCase()
  if (BLOCKED_HOSTS.some((b) => h === b || h.endsWith(`.${b}`))) return true
  if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.some((a) => h === a || h.endsWith(`.${a}`))) return true
  return false
}

function validateUrl(raw) {
  let url
  try { url = new URL(raw) } catch { throw new Error(`Invalid URL: "${raw}"`) }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Only http/https allowed, got: ${url.protocol}`)
  if (isHostBlocked(url.hostname)) throw new Error(`URL host is blocked: ${url.hostname}`)
  return url
}

let browser = null
let page = null

async function getPuppeteerCore() {
  try {
    const mod = await import('puppeteer-core')
    return mod.default || mod
  } catch (e) {
    throw new Error('Browser tool unavailable — puppeteer-core not installed. This feature is disabled on this environment.')
  }
}

async function getChromiumConfig() {
  try {
    const mod = await import('@sparticuz/chromium')
    const chromium = mod.default || mod
    const executablePath = await chromium.executablePath()
    return {
      executablePath,
      args: chromium.args,
    }
  } catch {
    return null
  }
}

async function ensureBrowser() {
  if (browser && page) return { browser, page }

  const puppeteer = await getPuppeteerCore()
  const chromiumConfig = await getChromiumConfig()

  const launchArgs = chromiumConfig?.args
    ? [...chromiumConfig.args, '--no-sandbox', '--disable-setuid-sandbox']
    : ['--no-sandbox', '--disable-setuid-sandbox']

  const launchOpts = {
    headless: true,
    args: launchArgs,
  }
  if (chromiumConfig?.executablePath) {
    launchOpts.executablePath = chromiumConfig.executablePath
  }

  try {
    browser = await puppeteer.launch(launchOpts)
  } catch (e) {
    // If launching with chromium executable fails, try without executablePath (local chrome)
    if (chromiumConfig?.executablePath) {
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        })
      } catch {
        throw e
      }
    } else {
      throw e
    }
  }

  if (!page) {
    page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    try {
      await page.setRequestInterception(true)
      page.on('request', (req) => {
        const resourceType = req.resourceType()
        if (resourceType === 'document' && req.url().match(/\.(pdf|zip|exe|dmg|pkg|deb|rpm|tar\.gz|tgz|bz2|7z|jar|war|apk|ipa)$/i)) {
          req.abort('blockedbyclient')
          return
        }
        if (['media', 'font'].includes(resourceType)) {
          req.abort('blockedbyclient')
          return
        }
        req.continue().catch(() => {})
      })
    } catch {
      // request interception may not be available in some puppeteer-core versions — ignore
    }
  }
  return { browser, page }
}

async function closeBrowser() {
  if (page) { await page.close().catch(() => {}); page = null }
  if (browser) { await browser.close().catch(() => {}); browser = null }
}

/* ─────────────────────── Actions ─────────────────────── */

async function actionNavigate({ url }) {
  const validated = validateUrl(url)
  const { page } = await ensureBrowser()
  await page.goto(validated.href, { waitUntil: 'networkidle2', timeout: MAX_NAV_TIMEOUT })
  const title = await page.title().catch(() => '')
  const finalUrl = page.url()
  return { action: 'navigate', url: finalUrl, title }
}

async function actionClick({ selector }) {
  if (!selector?.trim()) throw new Error('click requires "selector"')
  const { page } = await ensureBrowser()
  await page.waitForSelector(selector, { timeout: 10_000 })
  await page.click(selector)
  // Small pause for any navigation / re-render
  await new Promise((r) => setTimeout(r, 500))
  return { action: 'click', selector, clicked: true }
}

async function actionType({ selector, text }) {
  if (!selector?.trim()) throw new Error('type requires "selector"')
  if (typeof text !== 'string') throw new Error('type requires "text"')
  const { page } = await ensureBrowser()
  await page.waitForSelector(selector, { timeout: 10_000 })
  await page.focus(selector)
  await page.keyboard.type(text, { delay: 10 })
  return { action: 'type', selector, typed: text.length }
}

async function actionExtract({ selector }) {
  const { page } = await ensureBrowser()
  if (selector?.trim()) {
    const el = await page.$(selector)
    if (!el) return { action: 'extract', selector, text: '', found: false }
    const text = await page.evaluate((e) => e.innerText || e.textContent || '', el)
    return { action: 'extract', selector, text: String(text).slice(0, 5000), found: true }
  }
  const text = await page.evaluate(() => document.body.innerText || '')
  return { action: 'extract', text: String(text).slice(0, 5000), found: true }
}

async function actionScreenshot({ selector }) {
  const { page } = await ensureBrowser()
  let clip = null
  if (selector?.trim()) {
    const el = await page.$(selector)
    if (!el) throw new Error(`Element not found for screenshot: ${selector}`)
    const box = await el.boundingBox()
    if (!box) throw new Error(`Element has no bounding box: ${selector}`)
    clip = {
      x: box.x,
      y: box.y,
      width: Math.min(Math.round(box.width), MAX_SCREENSHOT_W),
      height: Math.min(Math.round(box.height), MAX_SCREENSHOT_H),
    }
  } else {
    const viewport = page.viewport() || { width: 1280, height: 720 }
    clip = { x: 0, y: 0, width: Math.min(viewport.width, MAX_SCREENSHOT_W), height: Math.min(viewport.height, MAX_SCREENSHOT_H) }
  }
  const buf = await page.screenshot({ clip, encoding: 'base64', type: 'png' })
  return { action: 'screenshot', format: 'png', base64: buf, width: clip.width, height: clip.height }
}

const ACTIONS = {
  navigate: actionNavigate,
  click: actionClick,
  type: actionType,
  extract: actionExtract,
  screenshot: actionScreenshot,
}

/**
 * Run a browser action.
 * @param {string} action — one of: navigate, click, type, extract, screenshot
 * @param {object} args   — action-specific arguments
 * @returns {object} structured result
 */
export async function runBrowserAction(action, args = {}) {
  const fn = ACTIONS[action]
  if (!fn) throw new Error(`Unknown browser action "${action}". Supported: ${Object.keys(ACTIONS).join(', ')}`)
  return fn(args)
}

/** Close the underlying browser (call on shutdown / error). */
export { closeBrowser }
