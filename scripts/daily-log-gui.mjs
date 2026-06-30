import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const UI_DIR = path.join(ROOT, "tools", "daily-log-gui")
const DAILY_LOG = path.join(ROOT, "content", "Our Calendar", "每日记录编辑本.md")
const CALENDAR_SCRIPT = path.join(ROOT, "scripts", "generate-calendar-stickers.mjs")
const PREPUBLISH_CHECK_SCRIPT = path.join(ROOT, "scripts", "prepublish-check.mjs")
const TSC_SCRIPT = path.join(ROOT, "node_modules", "typescript", "bin", "tsc")
const BACKUP_DIR = path.join(ROOT, "content", "private", "backups", "daily-log")
const DEFAULT_PORT = Number(process.env.PORT || 5177)
const MAX_BODY_BYTES = 1_000_000

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
])

function toPosix(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/")
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  response.end(JSON.stringify(payload, null, 2))
}

function isValidIsoDate(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return false
  }

  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function timestampInShanghai() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const millis = String(Date.now() % 1000).padStart(3, "0")
  return `${value.year}${value.month}${value.day}-${value.hour}${value.minute}${value.second}-${millis}`
}

function maskFencedCode(source) {
  // Keep byte positions stable while preventing example Markdown blocks from
  // being mistaken for real daily entries.
  return source.replace(/^```[\s\S]*?^```/gm, (block) => block.replace(/[^\r\n]/g, " "))
}

function stripFrontmatter(source) {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
}

function findDateHeadings(source) {
  const masked = maskFencedCode(source)
  const headingPattern = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/gm
  return [...masked.matchAll(headingPattern)].map((match) => ({
    date: match[1],
    index: match.index,
    end: match.index + match[0].length,
  }))
}

function entryRange(source, date) {
  const headings = findDateHeadings(source)
  const index = headings.findIndex((heading) => heading.date === date)
  if (index === -1) {
    return null
  }

  return {
    ...headings[index],
    bodyEnd: headings[index + 1]?.index ?? source.length,
  }
}

function normalizeText(value) {
  return String(value ?? "").trim()
}

function normalizeCommitMessage(value) {
  const message = normalizeText(value).replace(/[\r\n]+/g, " ")
  return message || `Update daily journal ${todayInShanghai()}`
}

function normalizeListLines(value) {
  return normalizeText(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
}

function splitInlineList(value) {
  return normalizeText(value)
    .split(/[;；,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function combineInlineList(previous, next) {
  const items = [...splitInlineList(previous)]
  for (const item of splitInlineList(next)) {
    if (!items.includes(item)) {
      items.push(item)
    }
  }
  return items.join(", ")
}

function firstUsefulLine(value) {
  return normalizeListLines(value)[0] ?? ""
}

function entryAttributeKey(sleep, ...values) {
  if (normalizeText(sleep)) {
    return "rest"
  }

  return values.some((value) => normalizeText(value).length > 0) ? "note" : "empty"
}

function entryAttributeLabel(attribute) {
  return {
    rest: "休息",
    note: "记录",
    empty: "空白",
  }[attribute] ?? "记录"
}

function formatEntry(payload) {
  const lines = [`## ${payload.date}`, ""]
  const metaLines = [
    ["sleep", payload.sleep],
    ["title", payload.title],
    ["mood", payload.mood],
    ["weather", payload.weather],
    ["tags", payload.tags],
    ["stickers", payload.stickers],
  ]
    .map(([key, value]) => [key, normalizeText(value)])
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => `${key}: ${value}`)

  if (metaLines.length > 0) {
    lines.push(...metaLines, "")
  }

  const whispers = normalizeListLines(payload.whispers)
  if (whispers.length > 0) {
    lines.push("### 碎碎念", ...whispers.map((line) => `- ${line}`), "")
  }

  for (const [heading, value] of [
    ["今天的一句话", payload.sentence],
    ["我们一起", payload.together],
    ["想记住", payload.remember],
  ]) {
    const text = normalizeText(value)
    if (text.length > 0) {
      lines.push(`### ${heading}`, text, "")
    }
  }

  return `${lines.join("\n").trimEnd()}\n`
}

function validatePayload(payload) {
  const date = normalizeText(payload.date)
  if (!isValidIsoDate(date)) {
    throw new Error("日期需要是 YYYY-MM-DD 格式。")
  }

  const normalized = {
    date,
    mode: normalizeText(payload.mode) || "sleep",
    sleep: normalizeText(payload.sleep),
    title: normalizeText(payload.title),
    mood: normalizeText(payload.mood),
    weather: normalizeText(payload.weather),
    tags: normalizeText(payload.tags),
    stickers: normalizeText(payload.stickers),
    whispers: normalizeText(payload.whispers),
    sentence: normalizeText(payload.sentence),
    together: normalizeText(payload.together),
    remember: normalizeText(payload.remember),
    generate: payload.generate !== false,
  }

  const hasContent = [
    normalized.sleep,
    normalized.title,
    normalized.mood,
    normalized.weather,
    normalized.tags,
    normalized.stickers,
    normalized.whispers,
    normalized.sentence,
    normalized.together,
    normalized.remember,
  ].some((value) => value.length > 0)

  if (!hasContent) {
    throw new Error("至少写一个休息时间、标题或碎碎念。")
  }

  return normalized
}

function parseMeta(value) {
  const meta = {}
  for (const line of value.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*|[\u4e00-\u9fff]+)\s*:\s*(.+)$/)
    if (match) {
      meta[match[1].trim().toLowerCase()] = match[2].trim()
    }
  }
  return meta
}

function parseSubsections(value) {
  const sections = {}
  const headingPattern = /^###\s+(.+?)\s*$/gm
  const matches = [...value.matchAll(headingPattern)]

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const bodyStart = match.index + match[0].length
    const bodyEnd = matches[index + 1]?.index ?? value.length
    sections[match[1].trim()] = value.slice(bodyStart, bodyEnd).trim()
  }

  return sections
}

function parseEntries(source) {
  const bodySource = stripFrontmatter(source)
  const headings = findDateHeadings(bodySource)
  const entries = headings.map((heading, index) => {
    const bodyStart = heading.end
    const bodyEnd = headings[index + 1]?.index ?? bodySource.length
    const body = bodySource.slice(bodyStart, bodyEnd).trim()
    const firstSectionIndex = body.search(/^###\s+/m)
    const metaBlock = firstSectionIndex === -1 ? body : body.slice(0, firstSectionIndex)
    const sections = firstSectionIndex === -1 ? {} : parseSubsections(body.slice(firstSectionIndex))
    const meta = parseMeta(metaBlock)
    const sleep = meta.sleep || meta.睡眠 || meta.睡着 || ""
    const notes = sections["碎碎念"] || sections["小碎念"] || meta.notes || meta.碎碎念 || ""
    const sentence = sections["今天的一句话"] || ""
    const together = sections["我们一起"] || ""
    const remember = sections["想记住"] || ""
    const excerpt = firstUsefulLine(notes) || firstUsefulLine(sentence) || firstUsefulLine(together) || firstUsefulLine(remember)
    const attribute = entryAttributeKey(sleep, notes, sentence, together, remember, meta.title || meta.标题 || "")
    const title = meta.title || meta.标题 || excerpt || (sleep ? `${sleep}休息` : "有记录")

    return {
      date: heading.date,
      title,
      sleep,
      sleepTime: sleep,
      excerpt,
      noteCount: normalizeListLines(notes).length,
      attribute,
      attributeLabel: entryAttributeLabel(attribute),
    }
  })

  return entries.sort((a, b) => b.date.localeCompare(a.date))
}

function entryBlock(source, date) {
  const range = entryRange(source, date)
  return range ? source.slice(range.index, range.bodyEnd).trimEnd() + "\n" : ""
}

function parseEntryDetails(date, markdown) {
  const headingMatch = markdown.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*\r?\n?/)
  const body = headingMatch ? markdown.slice(headingMatch[0].length).trim() : markdown.trim()
  const sectionIndex = body.search(/^###\s+/m)
  const metaBlock = sectionIndex === -1 ? body : body.slice(0, sectionIndex)
  const sectionBlock = sectionIndex === -1 ? "" : body.slice(sectionIndex)
  const meta = parseMeta(metaBlock)
  const sections = parseSubsections(sectionBlock)
  const notes = sections["碎碎念"] || sections["小碎念"] || meta.notes || meta.碎碎念 || ""
  const sleep = meta.sleep || meta.睡眠 || meta.睡着 || ""
  const title = meta.title || meta.标题 || ""
  const sentence = sections["今天的一句话"] || ""
  const together = sections["我们一起"] || ""
  const remember = sections["想记住"] || ""
  const attribute = entryAttributeKey(sleep, notes, sentence, together, remember, title)

  return {
    date,
    sleep,
    sleepTime: sleep,
    title,
    mood: meta.mood || meta.心情 || "",
    weather: meta.weather || meta.天气 || "",
    tags: meta.tags || meta.标签 || "",
    stickers: meta.stickers || meta.表情 || "",
    whispers: normalizeListLines(notes).join("\n"),
    sentence,
    together,
    remember,
    attribute,
    attributeLabel: entryAttributeLabel(attribute),
    markdown: markdown || `## ${date}\n`,
  }
}

function calendarMonths(entries) {
  const todayMonth = todayInShanghai().slice(0, 7)
  const months = new Set([todayMonth])
  entries.forEach((entry) => months.add(entry.date.slice(0, 7)))
  return [...months].sort()
}

function normalizeEntryMarkdown(date, markdown) {
  const text = normalizeText(markdown)
  if (!text) {
    throw new Error("这一天的 Markdown 不能为空。")
  }

  const heading = text.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*$/m)
  if (heading && heading[1] !== date) {
    throw new Error(`Markdown 标题日期是 ${heading[1]}，但当前正在编辑 ${date}。`)
  }

  if (!text.startsWith(`## ${date}`)) {
    return `## ${date}\n\n${text}\n`
  }

  return `${text}\n`
}

function replaceDailyLogEntry(source, date, markdown) {
  const range = entryRange(source, date)
  if (!range) {
    return insertEntry(source, markdown, date)
  }

  return `${source.slice(0, range.index).trimEnd()}\n\n${markdown.trimEnd()}\n\n${source
    .slice(range.bodyEnd)
    .trimStart()}`.trimEnd() + "\n"
}

function firstSectionIndex(body) {
  const index = body.search(/^###\s+/m)
  return index === -1 ? body.length : index
}

function upsertMeta(body, key, value, { append = false } = {}) {
  const nextValue = normalizeText(value)
  if (!nextValue) {
    return body
  }

  const sectionIndex = firstSectionIndex(body)
  const metaBlock = body.slice(0, sectionIndex).trimEnd()
  const sectionBlock = body.slice(sectionIndex).trimStart()
  const metaLines = metaBlock ? metaBlock.split(/\r?\n/) : []
  const pattern = new RegExp(`^${key}:\\s*(.*)$`, "i")
  const lineIndex = metaLines.findIndex((line) => pattern.test(line))

  if (lineIndex >= 0) {
    const previous = metaLines[lineIndex].match(pattern)?.[1] ?? ""
    metaLines[lineIndex] = `${key}: ${append ? combineInlineList(previous, nextValue) : nextValue}`
  } else {
    metaLines.push(`${key}: ${nextValue}`)
  }

  const nextMetaBlock = metaLines.filter((line) => line.trim().length > 0).join("\n")
  return [nextMetaBlock, sectionBlock].filter(Boolean).join("\n\n")
}

function appendSection(body, heading, value, { bullets = false } = {}) {
  const text = bullets
    ? normalizeListLines(value)
        .map((line) => `- ${line}`)
        .join("\n")
    : normalizeText(value)

  if (!text) {
    return body
  }

  const pattern = new RegExp(`^###\\s+${heading}\\s*$`, "m")
  const match = body.match(pattern)
  if (!match?.index && match?.index !== 0) {
    return `${body.trimEnd()}\n\n### ${heading}\n${text}`.trimStart()
  }

  const start = match.index + match[0].length
  const rest = body.slice(start)
  const nextHeading = rest.search(/^###\s+/m)
  const end = nextHeading === -1 ? body.length : start + nextHeading
  const current = body.slice(start, end).trimEnd()
  const replacement = `${current}\n${text}`.trimEnd()
  return `${body.slice(0, start)}\n${replacement}\n${body.slice(end).trimStart()}`.trimEnd()
}

function mergeEntry(existingEntry, payload) {
  const headingMatch = existingEntry.match(/^##\s+\d{4}-\d{2}-\d{2}\s*\r?\n?/)
  if (!headingMatch) {
    return formatEntry(payload)
  }

  const heading = headingMatch[0].trimEnd()
  let body = existingEntry.slice(headingMatch[0].length).trimEnd()
  body = upsertMeta(body, "sleep", payload.sleep, { append: true })
  body = upsertMeta(body, "title", payload.title)
  body = upsertMeta(body, "mood", payload.mood)
  body = upsertMeta(body, "weather", payload.weather)
  body = upsertMeta(body, "tags", payload.tags, { append: true })
  body = upsertMeta(body, "stickers", payload.stickers, { append: true })
  body = appendSection(body, "碎碎念", payload.whispers, { bullets: true })
  body = appendSection(body, "今天的一句话", payload.sentence)
  body = appendSection(body, "我们一起", payload.together)
  body = appendSection(body, "想记住", payload.remember)

  return `${heading}\n${body ? `\n${body.trimEnd()}\n` : "\n"}`
}

function insertEntry(source, block, date) {
  const headings = findDateHeadings(source)
  const laterHeading = headings.find((heading) => heading.date.localeCompare(date) > 0)

  if (!laterHeading) {
    return `${source.trimEnd()}\n\n${block}`
  }

  return `${source.slice(0, laterHeading.index).trimEnd()}\n\n${block}\n${source.slice(laterHeading.index).trimStart()}`
}

function updateDailyLog(source, payload) {
  const range = entryRange(source, payload.date)
  if (!range) {
    return {
      action: "created",
      markdown: formatEntry(payload),
      source: insertEntry(source, formatEntry(payload), payload.date),
    }
  }

  const existing = source.slice(range.index, range.bodyEnd)
  const markdown = mergeEntry(existing, payload)
  return {
    action: "updated",
    markdown,
    source: `${source.slice(0, range.index).trimEnd()}\n\n${markdown}\n${source.slice(range.bodyEnd).trimStart()}`.trimEnd() + "\n",
  }
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      throw new Error("请求内容太大。")
    }
    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString("utf8")
  return raw ? JSON.parse(raw) : {}
}

async function backupSource(source) {
  await fs.mkdir(BACKUP_DIR, { recursive: true })
  const backupPath = path.join(BACKUP_DIR, `${timestampInShanghai()}-每日记录编辑本.md`)
  await fs.writeFile(backupPath, source, "utf8")
  return backupPath
}

function runCalendarGenerator() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CALENDAR_SCRIPT], {
      cwd: ROOT,
      windowsHide: true,
    })
    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
      } else {
        reject(new Error(stderr.trim() || `日历同步失败，退出码：${code}`))
      }
    })
  })
}

function runCommand(command, args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const commandText = [command, ...args].join(" ")
    const child = spawn(command, args, {
      cwd: ROOT,
      windowsHide: true,
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill()
      const error = new Error(`${commandText} 超时。`)
      error.command = commandText
      error.stdout = stdout.trim()
      error.stderr = stderr.trim()
      reject(error)
    }, timeoutMs)

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      error.command = commandText
      error.stdout = stdout.trim()
      error.stderr = stderr.trim()
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      const output = { command: commandText, stdout: stdout.trim(), stderr: stderr.trim() }
      if (code === 0) {
        resolve(output)
      } else {
        const detail = [output.stderr, output.stdout].filter(Boolean).join("\n")
        const error = new Error(detail || `${output.command} 失败，退出码：${code}`)
        error.command = output.command
        error.stdout = output.stdout
        error.stderr = output.stderr
        error.code = code
        reject(error)
      }
    })
  })
}

async function runOptionalCommand(command, args, options) {
  try {
    return await runCommand(command, args, options)
  } catch (error) {
    return { command: [command, ...args].join(" "), stdout: "", stderr: error.message, failed: true }
  }
}

async function runProjectCheck() {
  const privacy = await runCommand(process.execPath, [PREPUBLISH_CHECK_SCRIPT], { timeoutMs: 120_000 })
  const typescript = await runCommand(process.execPath, [TSC_SCRIPT, "--noEmit"], { timeoutMs: 180_000 })
  return {
    command: "node scripts/prepublish-check.mjs && node node_modules/typescript/bin/tsc --noEmit",
    stdout: [privacy.stdout, typescript.stdout].filter(Boolean).join("\n"),
    stderr: [privacy.stderr, typescript.stderr].filter(Boolean).join("\n"),
  }
}

function parsePorcelainStatus(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !line.startsWith("## "))
    .map((line) => ({
      code: (line.match(/^(.{1,2})\s+(.+)$/)?.[1] ?? line.slice(0, 2)).padEnd(2, " "),
      path: line.match(/^(.{1,2})\s+(.+)$/)?.[2] ?? line.slice(3),
    }))
}

async function getGitSummary() {
  const [status, branch, remote, upstream] = await Promise.all([
    runCommand("git", ["status", "--porcelain=v1", "-uall", "--branch"]),
    runOptionalCommand("git", ["branch", "--show-current"]),
    runOptionalCommand("git", ["remote", "get-url", "origin"]),
    runOptionalCommand("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
  ])
  const branchLine = status.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("## "))
    ?.replace(/^##\s+/, "")
  const aheadBehind = branchLine?.match(/\[(.+)]/)?.[1] ?? ""

  return {
    branch: branch.stdout || "(detached)",
    branchLine: branchLine || branch.stdout || "(detached)",
    aheadBehind,
    remote: remote.failed ? "" : remote.stdout,
    upstream: upstream.failed ? "" : upstream.stdout,
    changes: parsePorcelainStatus(status.stdout),
  }
}

async function pushCurrentBranch(branch, upstream) {
  if (upstream) {
    return runCommand("git", ["push"], { timeoutMs: 300_000 })
  }

  if (!branch || branch === "(detached)") {
    return runCommand("git", ["push"], { timeoutMs: 300_000 })
  }

  return runCommand("git", ["push", "-u", "origin", branch], { timeoutMs: 300_000 })
}

async function runPushStep(steps, name, action) {
  try {
    const output = await action()
    steps.push({ name, ok: true, ...output })
    return output
  } catch (error) {
    steps.push({
      name,
      ok: false,
      command: error.command || "",
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || String(error),
    })
    throw error
  }
}

async function runOneClickPush(payload) {
  const message = normalizeCommitMessage(payload.message)
  const runCheck = payload.runCheck !== false
  const steps = []

  try {
    await runPushStep(steps, "同步日历", () => runCalendarGenerator())

    if (runCheck) {
      await runPushStep(steps, "项目检查", () => runProjectCheck())
    }

    let summary = await getGitSummary()
    if (summary.changes.length > 0) {
      await runPushStep(steps, "暂存改动", () => runCommand("git", ["add", "--all"]))

      const staged = await runCommand("git", ["diff", "--cached", "--name-only"])
      if (staged.stdout.trim().length === 0) {
        steps.push({ name: "创建提交", ok: true, command: "git commit", stdout: "没有可提交的改动，跳过提交。", stderr: "" })
      } else {
        await runPushStep(steps, "创建提交", () => runCommand("git", ["commit", "-m", message]))
      }
    } else {
      steps.push({ name: "创建提交", ok: true, command: "git commit", stdout: "工作区没有改动，跳过提交。", stderr: "" })
    }

    summary = await getGitSummary()
    await runPushStep(steps, "推送远端", () => pushCurrentBranch(summary.branch, summary.upstream))

    return {
      ok: true,
      message,
      steps,
      summary: await getGitSummary(),
    }
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error),
      message,
      steps,
      summary: await getGitSummary(),
    }
  }
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`)
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname
  const fullPath = path.normalize(path.join(UI_DIR, decodeURIComponent(requestedPath)))

  if (!fullPath.startsWith(UI_DIR)) {
    response.writeHead(403)
    response.end("Forbidden")
    return
  }

  try {
    const content = await fs.readFile(fullPath)
    response.writeHead(200, {
      "Content-Type": MIME_TYPES.get(path.extname(fullPath)) ?? "application/octet-stream",
      "Cache-Control": "no-store",
    })
    response.end(content)
  } catch {
    response.writeHead(404)
    response.end("Not found")
  }
}

async function handleApi(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`)

  if (request.method === "GET" && requestUrl.pathname === "/api/state") {
    const source = await fs.readFile(DAILY_LOG, "utf8")
    json(response, 200, {
      today: todayInShanghai(),
      relativePath: toPosix(DAILY_LOG),
      entries: parseEntries(source),
    })
    return
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/calendar") {
    const source = await fs.readFile(DAILY_LOG, "utf8")
    const entries = parseEntries(source)
    json(response, 200, {
      today: todayInShanghai(),
      relativePath: toPosix(DAILY_LOG),
      months: calendarMonths(entries),
      entries,
    })
    return
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/calendar-entry") {
    const date = normalizeText(requestUrl.searchParams.get("date"))
    if (!isValidIsoDate(date)) {
      throw new Error("日期需要是 YYYY-MM-DD 格式。")
    }

    const source = await fs.readFile(DAILY_LOG, "utf8")
    const markdown = entryBlock(source, date) || `## ${date}\n`
    json(response, 200, parseEntryDetails(date, markdown))
    return
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/git-status") {
    json(response, 200, await getGitSummary())
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/preview") {
    const payload = validatePayload(await readJson(request))
    const markdown = formatEntry(payload)
    json(response, 200, { markdown })
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/entries") {
    const payload = validatePayload(await readJson(request))
    const source = await fs.readFile(DAILY_LOG, "utf8")
    const backupPath = await backupSource(source)
    const result = updateDailyLog(source, payload)
    await fs.writeFile(DAILY_LOG, result.source, "utf8")
    const generated = payload.generate ? await runCalendarGenerator() : null
    json(response, 200, {
      action: result.action,
      markdown: result.markdown,
      relativePath: toPosix(DAILY_LOG),
      backupPath: toPosix(backupPath),
      generated,
    })
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/calendar-entry") {
    const payload = await readJson(request)
    const date = normalizeText(payload.date)
    if (!isValidIsoDate(date)) {
      throw new Error("日期需要是 YYYY-MM-DD 格式。")
    }

    const markdown = normalizeEntryMarkdown(date, payload.markdown)
    const source = await fs.readFile(DAILY_LOG, "utf8")
    const backupPath = await backupSource(source)
    await fs.writeFile(DAILY_LOG, replaceDailyLogEntry(source, date, markdown), "utf8")
    const generated = payload.generate !== false ? await runCalendarGenerator() : null
    json(response, 200, {
      action: entryRange(source, date) ? "updated" : "created",
      entry: parseEntryDetails(date, markdown),
      relativePath: toPosix(DAILY_LOG),
      backupPath: toPosix(backupPath),
      generated,
    })
    return
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/push") {
    const payload = await readJson(request)
    json(response, 200, await runOneClickPush(payload))
    return
  }

  json(response, 404, { error: "Unknown API route" })
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host}`)
      if (requestUrl.pathname.startsWith("/api/")) {
        await handleApi(request, response)
      } else {
        await serveStatic(request, response)
      }
    } catch (error) {
      json(response, 400, { error: error.message || String(error) })
    }
  })
}

function listenOnAvailablePort(port, attempts = 12) {
  const server = createServer()

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && attempts > 1) {
      listenOnAvailablePort(port + 1, attempts - 1)
      return
    }
    throw error
  })

  server.listen(port, "127.0.0.1", () => {
    console.log(`Daily log GUI: http://127.0.0.1:${port}`)
    console.log(`Writing to: ${toPosix(DAILY_LOG)}`)
  })
}

listenOnAvailablePort(DEFAULT_PORT)
