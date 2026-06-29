import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { slugifyFilePath } from "@quartz-community/utils"

const STICKER_DIR = path.resolve("content/assets/couple-calendar-stickers")
const WALL_STICKER_DIR = path.resolve("content/assets/stickers")
const DAILY_LOG = path.resolve("content/Our Calendar/每日记录编辑本.md")
const CALENDAR_PAGE = path.resolve("content/Our Calendar/index.md")
const WALL_PACK_LABELS = new Map([
  ["koonyangi", "Koonyangi"],
  ["mini-mini-somchi-2", "Mini Mini Somchi 2"],
  ["somchi", "Somchi"],
])

const MONTH_START_MARKER = "<!-- calendar-months:start -->"
const MONTH_END_MARKER = "<!-- calendar-months:end -->"
const STICKER_START_MARKER = "<!-- calendar-stickers:start -->"
const STICKER_END_MARKER = "<!-- calendar-stickers:end -->"
const ENTRY_START_MARKER = "<!-- calendar-entries:start -->"
const ENTRY_END_MARKER = "<!-- calendar-entries:end -->"

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"])

function toPosix(filePath) {
  return filePath.split(path.sep).join("/")
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function pad(value) {
  return String(value).padStart(2, "0")
}

function isoDate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function ensureDirs() {
  fs.mkdirSync(STICKER_DIR, { recursive: true })
  fs.mkdirSync(WALL_STICKER_DIR, { recursive: true })
  fs.mkdirSync(path.dirname(DAILY_LOG), { recursive: true })
}

function stripFrontmatter(source) {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
}

function stripFencedCode(source) {
  return source.replace(/^```[\s\S]*?^```/gm, "")
}

function walkImages(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkImages(fullPath, files)
      continue
    }

    const extension = path.extname(entry.name).toLowerCase()
    if (IMAGE_EXTENSIONS.has(extension)) {
      files.push(fullPath)
    }
  }

  return files
}

function humanName(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[-_]+/g, " ")
    .trim()
}

function titleFromSlug(slug) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function wallStickerPack(filePath) {
  const relative = toPosix(path.relative(WALL_STICKER_DIR, filePath))
  return relative.split("/")[0] || "uncategorized"
}

function imageFileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

function wallStickerPriority(filePath) {
  const relative = toPosix(path.relative(WALL_STICKER_DIR, filePath))
  return relative.includes("/animated_gif/") ? 0 : 1
}

function dedupeWallStickerFiles(files) {
  const selected = new Map()

  for (const filePath of files) {
    const key = `${wallStickerPack(filePath)}:${imageFileHash(filePath)}`
    const current = selected.get(key)
    if (
      !current ||
      wallStickerPriority(filePath) < wallStickerPriority(current) ||
      (wallStickerPriority(filePath) === wallStickerPriority(current) && filePath.localeCompare(current) < 0)
    ) {
      selected.set(key, filePath)
    }
  }

  return [...selected.values()].sort((a, b) => a.localeCompare(b, "zh-CN"))
}

function wallStickerPackLabel(pack) {
  return WALL_PACK_LABELS.get(pack) ?? titleFromSlug(pack)
}

function publicStickerPath(filePath) {
  const relativeToContent = toPosix(path.relative(path.resolve("content"), filePath))
  return `../${slugifyFilePath(relativeToContent)}`
}

function publicRootAssetPath(filePath) {
  const relativeToContent = toPosix(path.relative(path.resolve("content"), filePath))
  return `/${slugifyFilePath(relativeToContent)}`
}

function makeWallAssetScript(imageFiles) {
  const assets = imageFiles.map((filePath) => {
    const category = wallStickerPack(filePath)
    return {
      name: humanName(filePath),
      src: publicRootAssetPath(filePath),
      category,
      categoryLabel: wallStickerPackLabel(category),
      pack: category,
    }
  })

  return [
    '<script type="application/json" data-sticker-assets>',
    JSON.stringify(assets, null, 2),
    "</script>",
  ].join("\n")
}

function makeStickerIndex(imageFiles) {
  return new Map(
    imageFiles.map((filePath) => [
      humanName(filePath).toLowerCase(),
      {
        name: humanName(filePath),
        src: publicStickerPath(filePath),
      },
    ]),
  )
}

function readDailyLog() {
  if (!fs.existsSync(DAILY_LOG)) {
    throw new Error(`Missing daily editing document: ${toPosix(path.relative(process.cwd(), DAILY_LOG))}`)
  }

  return stripFencedCode(stripFrontmatter(fs.readFileSync(DAILY_LOG, "utf8")))
}

function parseMeta(value) {
  const meta = {}
  for (const line of value.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*|[\u4e00-\u9fff]+)\s*:\s*(.+)$/)
    if (!match) {
      continue
    }

    meta[match[1].trim().toLowerCase()] = match[2].trim()
  }
  return meta
}

function parseSubsections(value) {
  const sections = {}
  const headingPattern = /^###\s+(.+?)\s*$/gm
  const matches = [...value.matchAll(headingPattern)]

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const title = match[1].trim()
    const bodyStart = match.index + match[0].length
    const bodyEnd = matches[index + 1]?.index ?? value.length
    sections[title] = value.slice(bodyStart, bodyEnd).trim()
  }

  return sections
}

function firstUsefulLine(value) {
  return (
    value
      ?.split(/\r?\n/)
      .map((line) => line.replace(/^[-*]\s+/, "").trim())
      .find((line) => line.length > 0) ?? ""
  )
}

function firstNonEmpty(values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0) ?? ""
}

function sleepTimes(sleep) {
  return String(sleep)
    .split(/[;；,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function sleepText(sleep) {
  const times = sleepTimes(sleep)
  if (times.length > 1) {
    return times.map((time) => `宝宝${time}睡着`).join("；")
  }

  return `宝宝${sleep}睡着`
}

function parseEntries(source) {
  const headingPattern = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/gm
  const headings = [...source.matchAll(headingPattern)]
  const entries = []

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    const date = heading[1]
    const bodyStart = heading.index + heading[0].length
    const bodyEnd = headings[index + 1]?.index ?? source.length
    const body = source.slice(bodyStart, bodyEnd).trim()
    const firstSectionIndex = body.search(/^###\s+/m)
    const metaBlock = firstSectionIndex === -1 ? body : body.slice(0, firstSectionIndex)
    const sectionBlock = firstSectionIndex === -1 ? "" : body.slice(firstSectionIndex)
    const meta = parseMeta(metaBlock)
    const sections = parseSubsections(sectionBlock)
    const sleep = meta.sleep || meta.睡眠 || meta.睡着 || ""
    const notes = firstNonEmpty([sections["碎碎念"], sections["小碎念"], meta.notes, meta.碎碎念])
    const sentence = sections["今天的一句话"] ?? ""
    const together = sections["我们一起"] ?? ""
    const remember = sections["想记住"] ?? ""
    const title =
      meta.title || meta.标题 || firstUsefulLine(notes) || firstUsefulLine(sentence) || (sleep ? sleepText(sleep) : "有记录")
    const stickers = String(meta.stickers || meta.表情 || "")
      .split(/[,，、]/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)

    entries.push({
      date,
      title,
      sleep,
      mood: meta.mood || meta.心情 || "",
      weather: meta.weather || meta.天气 || "",
      tags: meta.tags || meta.标签 || "",
      stickers,
      sentence,
      together,
      remember,
      notes,
    })
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date))
}

function monthKey(date) {
  return date.slice(0, 7)
}

function makeMonthTitle(year, month) {
  const english = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  )
  return {
    english,
    chinese: `${year}年${month}月`,
  }
}

function calendarAttribute(entry) {
  if (!entry) {
    return { key: "empty", label: "" }
  }

  if (entry.sleep) {
    return { key: "rest", label: "休息" }
  }

  return { key: "note", label: "记录" }
}

function makeCalendarDay(date, day, entry, outside = false) {
  if (outside) {
    return '<span class="couple-day is-empty"></span>'
  }

  const attribute = calendarAttribute(entry)
  const sleepTime = entry?.sleep ? sleepTimes(entry.sleep).join(" / ") : ""
  const dataAttributes = [
    "data-calendar-day",
    `data-calendar-date="${escapeHtml(date)}"`,
    `data-calendar-attribute="${escapeHtml(attribute.key)}"`,
    `data-calendar-has-sleep="${entry?.sleep ? "true" : "false"}"`,
    sleepTime ? `data-calendar-sleep-time="${escapeHtml(sleepTime)}"` : "",
  ]
    .filter(Boolean)
    .join(" ")
  const attributeChip = attribute.label
    ? `    <span class="calendar-attribute-chip calendar-attribute-${escapeHtml(attribute.key)}">${escapeHtml(attribute.label)}</span>`
    : ""
  const dayHead = (extra = "") =>
    [
      '  <span class="couple-day-head">',
      `    <b>${day}</b>`,
      attributeChip,
      extra,
      "  </span>",
    ]
      .filter(Boolean)
      .join("\n")
  const commentButton = [
    `  <button class="calendar-comment-trigger" type="button" data-calendar-comment-open data-calendar-date="${escapeHtml(date)}" aria-label="编辑 ${escapeHtml(date)} 的评论">`,
    '    <span class="calendar-comment-dot" aria-hidden="true"></span>',
    '    <span class="calendar-comment-icon" aria-hidden="true">记</span>',
    "  </button>",
  ].join("\n")

  if (!entry) {
    return [
      `<div class="couple-day" ${dataAttributes}>`,
      dayHead(),
      commentButton,
      "</div>",
    ].join("\n")
  }

  const sleepLabel = sleepTime ? `    <span class="calendar-sleep-pill">${escapeHtml(sleepTime)}</span>` : ""
  const summary =
    noteItems(entry.notes).slice(0, 2).join(" / ") ||
    firstUsefulLine(entry.sentence) ||
    firstUsefulLine(entry.together) ||
    firstUsefulLine(entry.remember) ||
    (!entry.sleep ? entry.title : "")
  const detail = firstNonEmpty([entry.mood, entry.tags, entry.weather])
  return [
    `<div class="couple-day has-note is-${attribute.key}-day" ${dataAttributes}>`,
    `  <a class="couple-day-link" href="#${date}">`,
    dayHead(sleepLabel).replace(/^/gm, "  "),
    summary ? `    <strong class="calendar-whisper-preview">${escapeHtml(summary)}</strong>` : "",
    detail ? `    <em>${escapeHtml(detail)}</em>` : "",
    "  </a>",
    commentButton,
    "</div>",
  ]
    .filter(Boolean)
    .join("\n")
}

function makeMonthCalendar(key, entriesByDate) {
  const [year, month] = key.split("-").map(Number)
  const title = makeMonthTitle(year, month)
  const firstDay = new Date(year, month - 1, 1)
  const leading = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const filled = leading + daysInMonth
  const trailing = (7 - (filled % 7)) % 7
  const days = []

  for (let index = 0; index < leading; index += 1) {
    days.push(makeCalendarDay("", "", null, true))
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = isoDate(year, month, day)
    days.push(makeCalendarDay(date, day, entriesByDate.get(date)))
  }

  for (let index = 0; index < trailing; index += 1) {
    days.push(makeCalendarDay("", "", null, true))
  }

  return [
    `<div class="couple-calendar" data-sticker-board data-sticker-board-key="${escapeHtml(key)}" data-sticker-board-label="${escapeHtml(monthDisplayLabel(key))}" data-sticker-board-control="${monthInputId(key)}">`,
    '  <div class="couple-calendar-top">',
    `    <p>${escapeHtml(title.english)}</p>`,
    `    <h2>${escapeHtml(title.chinese)}</h2>`,
    "    <span>把我们的小日常，一格一格收起来。</span>",
    "  </div>",
    '  <div class="couple-calendar-grid">',
    '    <div class="couple-weekday">一</div>',
    '    <div class="couple-weekday">二</div>',
    '    <div class="couple-weekday">三</div>',
    '    <div class="couple-weekday">四</div>',
    '    <div class="couple-weekday">五</div>',
    '    <div class="couple-weekday">六</div>',
    '    <div class="couple-weekday">日</div>',
    ...days.map((day) => day.replace(/^/gm, "    ")),
    "  </div>",
    "</div>",
  ].join("\n")
}

function monthInputId(key) {
  return `couple-month-${key}`
}

function monthDisplayLabel(key) {
  const [year, month] = key.split("-").map(Number)
  return `${year}年${month}月`
}

function makeMonthNav(key, months) {
  const [year, month] = key.split("-").map(Number)
  const index = months.indexOf(key)
  const previous = months[index - 1]
  const next = months[index + 1]
  const previousControl = previous
    ? `<label class="month-turn" for="${monthInputId(previous)}">上一月</label>`
    : '<span class="month-turn is-disabled">上一月</span>'
  const nextControl = next
    ? `<label class="month-turn" for="${monthInputId(next)}">下一月</label>`
    : '<span class="month-turn is-disabled">下一月</span>'

  return [
    '<div class="couple-month-nav">',
    `  ${previousControl}`,
    `  <strong>${year}年${month}月</strong>`,
    `  ${nextControl}`,
    "</div>",
  ].join("\n")
}

function makeMonthBlock(entries, wallStickerFiles) {
  if (entries.length === 0) {
    return [
      MONTH_START_MARKER,
      '<div class="couple-sticker-empty">还没有每日记录。先编辑 `content/Our Calendar/每日记录编辑本.md`。</div>',
      MONTH_END_MARKER,
    ].join("\n")
  }

  const entriesByDate = new Map(entries.map((entry) => [entry.date, entry]))
  const months = [...new Set(entries.map((entry) => monthKey(entry.date)))]
  const defaultMonth = months.at(-1)
  const dynamicStyles = [
    ".couple-month-pager .couple-month-slide { display: none; }",
    ...months.map(
      (key) =>
        `#${monthInputId(key)}:checked ~ .couple-month-slides .couple-month-slide[data-month="${key}"] { display: block; }`,
    ),
    ...months.map(
      (key) =>
        `#${monthInputId(key)}:checked ~ .couple-month-tabs label[for="${monthInputId(key)}"] { background: #2f6b5b; color: white; border-color: #2f6b5b; }`,
    ),
  ]

  return [
    MONTH_START_MARKER,
    '<div class="calendar-sticker-wall" data-sticker-wall data-sticker-storage-key="qinzi27-calendar-sticker-wall-v1">',
    '  <div class="sticker-category-filter calendar-sticker-category-filter" data-sticker-categories aria-label="Calendar sticker categories"></div>',
    '  <div class="sticker-wall-toolbar calendar-sticker-toolbar" aria-label="Calendar sticker controls">',
    '    <button type="button" data-sticker-add>随机贴一张</button>',
    '    <button type="button" data-sticker-burst>撒在日历上</button>',
    '    <label class="sticker-upload-button">',
    "      上传暂存",
    '      <input type="file" accept="image/gif,image/png,image/jpeg,image/webp,image/svg+xml,image/avif" multiple data-sticker-upload />',
    "    </label>",
    '    <button type="button" data-sticker-clear-uploads>清空暂存</button>',
    '    <button type="button" data-sticker-clear>清空我的本月贴纸</button>',
    "  </div>",
    '  <div class="sticker-stage calendar-sticker-stage" data-sticker-stage aria-label="Uploaded calendar sticker staging area"></div>',
    '  <div class="sticker-month-preview" data-sticker-month-preview aria-label="Monthly sticker preview"></div>',
    makeWallAssetScript(wallStickerFiles).replace(/^/gm, "  "),
    '<div class="couple-month-pager">',
    "<style>",
    ...dynamicStyles,
    "</style>",
    ...months.map(
      (key) =>
        `<input class="couple-month-toggle" type="radio" name="couple-month-page" id="${monthInputId(key)}"${key === defaultMonth ? " checked" : ""} />`,
    ),
    '  <div class="couple-month-tabs" aria-label="月份">',
    ...months.map((key) => {
      const [, month] = key.split("-").map(Number)
      return `    <label for="${monthInputId(key)}">${month}月</label>`
    }),
    "  </div>",
    '  <div class="couple-month-slides calendar-sticker-board">',
    ...months.map(
      (key) =>
        [
          `    <section class="couple-month-slide" data-month="${key}">`,
          makeMonthNav(key, months).replace(/^/gm, "      "),
          makeMonthCalendar(key, entriesByDate).replace(/^/gm, "      "),
          "    </section>",
        ].join("\n"),
    ),
    "  </div>",
    "</div>",
    "</div>",
    MONTH_END_MARKER,
  ].join("\n")
}

function makeStickerBlock(imageFiles) {
  if (imageFiles.length === 0) {
    return [
      STICKER_START_MARKER,
      '<div class="couple-sticker-empty">',
      "把 PNG、JPG、WebP、GIF、SVG 图片放进 `content/assets/couple-calendar-stickers/`，下次预览或构建时会自动显示在这里。",
      "</div>",
      STICKER_END_MARKER,
    ].join("\n")
  }

  const figures = imageFiles.map((filePath) => {
    const src = publicStickerPath(filePath)
    const name = humanName(filePath)

    return [
      '  <figure class="couple-sticker">',
      `    <img src="${src}" alt="${escapeHtml(name)}" loading="lazy" decoding="async" />`,
      `    <figcaption>${escapeHtml(name)}</figcaption>`,
      "  </figure>",
    ].join("\n")
  })

  return [
    STICKER_START_MARKER,
    `<div class="couple-sticker-board" data-sticker-count="${imageFiles.length}">`,
    ...figures,
    "</div>",
    STICKER_END_MARKER,
  ].join("\n")
}

function makeEntryStickers(entry, stickerIndex) {
  const stickers = entry.stickers
    .map((name) => stickerIndex.get(name))
    .filter(Boolean)

  if (stickers.length === 0) {
    return ""
  }

  return [
    '<div class="daily-entry-stickers">',
    ...stickers.map(
      (sticker) =>
        `  <img class="inline-sticker" src="${sticker.src}" alt="${escapeHtml(sticker.name)}" loading="lazy" decoding="async" />`,
    ),
    "</div>",
    "",
  ].join("\n")
}

function makeMetaLine(entry) {
  const items = [
    entry.mood ? `心情：${entry.mood}` : "",
    entry.weather ? `天气：${entry.weather}` : "",
    entry.tags ? `标签：${entry.tags}` : "",
  ].filter(Boolean)

  if (items.length === 0) {
    return ""
  }

  return `<p class="daily-entry-meta">${escapeHtml(items.join(" · "))}</p>\n\n`
}

function noteItems(value) {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
}

function makeWhisperBlock(entry) {
  const items = noteItems(entry.notes)

  if (items.length === 0) {
    return ""
  }

  return [
    '<div class="daily-whispers">',
    "  <p>碎碎念</p>",
    "  <ul>",
    ...items.map((item) => `    <li>${escapeHtml(item)}</li>`),
    "  </ul>",
    "</div>",
  ].join("\n")
}

function makeEntryBlock(entries, stickerIndex) {
  if (entries.length === 0) {
    return [ENTRY_START_MARKER, "还没有每日记录。", ENTRY_END_MARKER].join("\n")
  }

  const blocks = entries
    .slice()
    .reverse()
    .map((entry) => {
      const lines = [`## ${entry.date}`, ""]
      const metaLine = makeMetaLine(entry).trimEnd()
      const stickerLine = makeEntryStickers(entry, stickerIndex).trimEnd()

      if (metaLine) {
        lines.push(metaLine, "")
      }

      if (stickerLine) {
        lines.push(stickerLine, "")
      }

      if (entry.sleep) {
        lines.push(`<p class="sleep-entry">${escapeHtml(sleepText(entry.sleep))}</p>`)
        const whisperBlock = makeWhisperBlock(entry)
        if (whisperBlock) {
          lines.push("", whisperBlock)
        }
        return lines.join("\n")
      }

      if (entry.sentence) {
        lines.push("### 今天的一句话", "", entry.sentence)
      }

      if (entry.together) {
        lines.push("", "### 我们一起", "", entry.together)
      }

      if (entry.remember) {
        lines.push("", "### 想记住", "", entry.remember)
      }

      const whisperBlock = makeWhisperBlock(entry)
      if (whisperBlock) {
        lines.push("", whisperBlock)
      }

      return lines.join("\n")
    })

  return [ENTRY_START_MARKER, ...blocks, ENTRY_END_MARKER].join("\n\n")
}

function replaceMarkedBlock(source, startMarker, endMarker, nextBlock) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Missing marker pair: ${startMarker} / ${endMarker}`)
  }

  return (
    source.slice(0, start).trimEnd() +
    "\n\n" +
    nextBlock +
    "\n\n" +
    source.slice(end + endMarker.length).trimStart()
  )
}

function removeCalendarStickerSection(source) {
  const start = source.indexOf(STICKER_START_MARKER)
  const end = source.indexOf(STICKER_END_MARKER, start)

  if (start === -1 || end === -1 || end < start) {
    return source
  }

  const before = source.slice(0, start)
  const sectionHeading = before.match(/\n##\s+表情包装饰\s*\n\s*$/)
  const sectionStart = sectionHeading ? before.length - sectionHeading[0].length : start
  const sectionEnd = end + STICKER_END_MARKER.length

  return `${source.slice(0, sectionStart).trimEnd()}\n\n${source.slice(sectionEnd).trimStart()}`
}

function updateCalendarPage({ monthBlock, entryBlock }) {
  let source = fs.readFileSync(CALENDAR_PAGE, "utf8")
  source = replaceMarkedBlock(source, MONTH_START_MARKER, MONTH_END_MARKER, monthBlock)
  source = replaceMarkedBlock(source, ENTRY_START_MARKER, ENTRY_END_MARKER, entryBlock)
  source = removeCalendarStickerSection(source)
  fs.writeFileSync(CALENDAR_PAGE, source, "utf8")
}

ensureDirs()
const imageFiles = walkImages(STICKER_DIR).sort((a, b) => a.localeCompare(b, "zh-CN"))
const wallStickerFiles = dedupeWallStickerFiles(walkImages(WALL_STICKER_DIR))
const stickerIndex = makeStickerIndex(imageFiles)
const entries = parseEntries(readDailyLog())

updateCalendarPage({
  monthBlock: makeMonthBlock(entries, wallStickerFiles),
  entryBlock: makeEntryBlock(entries, stickerIndex),
})

console.log(`Couple calendar generated: ${entries.length} day(s), ${imageFiles.length} sticker(s)`)
