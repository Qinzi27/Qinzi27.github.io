import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

import { loadLocalSiteEnvironment } from "./site-workflow.mjs"

loadLocalSiteEnvironment()

const PUBLIC_DIR = path.resolve("public")
const REQUIRED_ROUTES = [
  "index.html",
  "under-construction.html",
  "404.html",
  "now.html",
  "sticker-wall.html",
  "sticker-categories.html",
  "our-calendar/index.html",
]
const UNLISTED_SLUGS = [
  "sticker-wall",
  "sticker-categories",
  "under-construction",
  "research--and--papers/paper-reading-template-in-action",
]

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, files)
    } else {
      files.push(fullPath)
    }
  }
  return files
}

function routeCandidates(pathname) {
  const relative = pathname.replace(/^\//, "")
  if (!relative || relative.endsWith("/")) {
    return [`${relative}index.html`]
  }
  if (path.extname(relative)) {
    return [relative]
  }
  return [`${relative}.html`, `${relative}/index.html`]
}

function decryptProtectedPayload(encryptedBase64, password, iterations) {
  const data = Buffer.from(encryptedBase64, "base64")
  const salt = data.subarray(0, 16)
  const iv = data.subarray(16, 28)
  const authTag = data.subarray(28, 44)
  const ciphertext = data.subarray(44)
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256")
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8")
}

if (!fs.existsSync(PUBLIC_DIR)) {
  throw new Error("Missing public/. Run npm.cmd run build before npm.cmd run check:site.")
}

const failures = []
const routeSummary = []

// Core routes should exist and expose exactly one page-level heading.
for (const relative of REQUIRED_ROUTES) {
  const filePath = path.join(PUBLIC_DIR, relative)
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing required route: public/${relative}`)
    continue
  }

  const html = fs.readFileSync(filePath, "utf8")
  const h1Count = (html.match(/<h1(?:\s|>)/g) ?? []).length
  const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? ""
  routeSummary.push({ route: relative, h1Count, title })
  if (h1Count !== 1) {
    failures.push(`Expected one <h1> in public/${relative}, found ${h1Count}.`)
  }
}

// Resolve every local anchor against its generated page and confirm that at
// least one Quartz output candidate exists. Hash-only and external links skip.
const htmlFiles = walk(PUBLIC_DIR).filter((filePath) => filePath.endsWith(".html"))
const missingLinks = new Map()
for (const filePath of htmlFiles) {
  const html = fs.readFileSync(filePath, "utf8")
  const relative = path.relative(PUBLIC_DIR, filePath).split(path.sep).join("/")
  const baseUrl = `https://local/${relative.replace(/index\.html$/, "").replace(/\.html$/, "")}`

  for (const match of html.matchAll(/href=["']([^"']*)["']/g)) {
    const href = match[1]
    if (!href || /^(?:https?:|mailto:|tel:|javascript:|data:|#)/i.test(href)) {
      continue
    }

    let pathname
    try {
      pathname = decodeURIComponent(new URL(href, baseUrl).pathname)
    } catch {
      continue
    }

    const exists = routeCandidates(pathname).some((candidate) =>
      fs.existsSync(path.join(PUBLIC_DIR, candidate)),
    )
    if (!exists) {
      missingLinks.set(`${relative}|${href}`, `${relative} -> ${href}`)
    }
  }
}

// The calendar editor credential must exist only inside the AES-GCM ciphertext.
// Search generated text assets for the exact value without ever printing it.
const calendarAccessToken = process.env.CALENDAR_ACCESS_TOKEN?.trim() ?? ""
if (calendarAccessToken) {
  const publicTextFiles = walk(PUBLIC_DIR).filter((filePath) =>
    [".html", ".json", ".js", ".css", ".xml"].includes(path.extname(filePath).toLowerCase()),
  )
  for (const filePath of publicTextFiles) {
    if (fs.readFileSync(filePath, "utf8").includes(calendarAccessToken)) {
      failures.push(`Calendar access token leaked as plaintext: public/${path.relative(PUBLIC_DIR, filePath)}`)
    }
  }


  const calendarHtmlPath = path.join(PUBLIC_DIR, "our-calendar", "index.html")
  const calendarHtml = fs.readFileSync(calendarHtmlPath, "utf8")
  const encryptedPayload = calendarHtml.match(/data-encrypted=["']([^"']+)["']/)?.[1] ?? ""
  const iterations = Number(calendarHtml.match(/data-iterations=["'](\d+)["']/)?.[1] ?? 600000)
  const password = process.env.PARENT_CALENDAR_PASSWORD ?? ""
  if (!encryptedPayload || !password) {
    failures.push("Protected calendar ciphertext or password is unavailable for the encrypted-token check.")
  } else {
    try {
      const decryptedCalendar = decryptProtectedPayload(encryptedPayload, password, iterations)
      if (!decryptedCalendar.includes(`data-calendar-access-token="${calendarAccessToken}"`)) {
        failures.push("Encrypted calendar payload is missing its shared editor token marker.")
      }
    } catch {
      failures.push("Protected calendar payload could not be decrypted during the encrypted-token check.")
    }
  }
}

for (const missing of missingLinks.values()) {
  failures.push(`Broken local link: ${missing}`)
}

// Large/generated utility pages are deliberately direct-link only and should
// not dominate the search payload, recent notes, RSS, or explorer.
const contentIndexPath = path.join(PUBLIC_DIR, "static", "contentIndex.json")
if (!fs.existsSync(contentIndexPath)) {
  failures.push("Missing public/static/contentIndex.json.")
} else {
  const contentIndex = JSON.parse(fs.readFileSync(contentIndexPath, "utf8"))
  const indexedSlugs = new Set(Object.keys(contentIndex.content ?? contentIndex))
  for (const slug of UNLISTED_SLUGS) {
    if (indexedSlugs.has(slug)) {
      failures.push(`Unlisted page leaked into contentIndex.json: ${slug}`)
    }
  }
}

if (failures.length > 0) {
  console.error("\nBUILT SITE CHECK FAILED")
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

const contentIndexBytes = fs.existsSync(contentIndexPath) ? fs.statSync(contentIndexPath).size : 0
console.log(
  `Built site check passed: ${routeSummary.length} core routes, ${htmlFiles.length} HTML files, no broken local links, content index ${contentIndexBytes} bytes.`,
)
