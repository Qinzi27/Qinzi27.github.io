import fs from "node:fs"
import path from "node:path"
import { slugifyFilePath } from "@quartz-community/utils"

const STICKER_DIR = path.resolve("content/assets/stickers")
const PAGE_PATH = path.resolve("content/Sticker Wall.md")
const CATEGORY_PAGE_PATH = path.resolve("content/Sticker Categories.md")
const START_MARKER = "<!-- sticker-wall-assets:start -->"
const END_MARKER = "<!-- sticker-wall-assets:end -->"
const IMAGE_EXTENSIONS = new Set([".gif", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".avif"])
const watchMode = process.argv.includes("--watch")
const PACK_LABELS = new Map([
  ["koonyangi", "Koonyangi"],
  ["mini-mini-somchi-2", "Mini Mini Somchi 2"],
  ["somchi", "Somchi"],
])

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/")
}

function titleFromFile(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function titleFromSlug(slug) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function packFromFile(filePath) {
  const relative = normalizePath(path.relative(STICKER_DIR, filePath))
  return relative.split("/")[0] || "uncategorized"
}

function packLabel(pack) {
  return PACK_LABELS.get(pack) ?? titleFromSlug(pack)
}

function publicAssetPath(filePath) {
  const relative = normalizePath(path.relative(path.resolve("content"), filePath))
  return `/${slugifyFilePath(relative)}`
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, files)
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath)
    }
  }

  return files
}

function makeAsset(filePath) {
  const category = packFromFile(filePath)
  return {
    name: titleFromFile(filePath),
    src: publicAssetPath(filePath),
    category,
    categoryLabel: packLabel(category),
    pack: category,
  }
}

function groupAssetsByCategory(assets) {
  const groups = new Map()
  for (const asset of assets) {
    if (!groups.has(asset.category)) {
      groups.set(asset.category, [])
    }
    groups.get(asset.category).push(asset)
  }
  return [...groups.entries()].map(([category, items]) => ({
    category,
    label: packLabel(category),
    items,
  }))
}

function replaceMarkedBlock(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Missing sticker wall marker block in ${normalizePath(PAGE_PATH)}`)
  }

  return `${source.slice(0, start + startMarker.length)}\n${replacement}\n${source.slice(end)}`
}

function writeFileIfChanged(filePath, content) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : ""
  if (current !== content) {
    fs.writeFileSync(filePath, content, "utf8")
    return true
  }

  return false
}

function makeCategoryPage(assets) {
  const groups = groupAssetsByCategory(assets)
  const indexLinks = groups
    .map(
      (group) =>
        `  <a href="#pack-${escapeHtml(group.category)}">${escapeHtml(group.label)} <span>${group.items.length}</span></a>`,
    )
    .join("\n")
  const sections = groups
    .map((group) => {
      const previews = group.items
        .map(
          (asset) => [
            '      <figure class="sticker-preview">',
            `        <img src="${escapeHtml(asset.src)}" alt="${escapeHtml(asset.name)}" loading="lazy" decoding="async" />`,
            `        <figcaption>${escapeHtml(asset.name)}</figcaption>`,
            "      </figure>",
          ].join("\n"),
        )
        .join("\n")

      return [
        `  <section id="pack-${escapeHtml(group.category)}" class="sticker-category-section">`,
        '    <div class="sticker-category-header">',
        `      <h2>${escapeHtml(group.label)}</h2>`,
        `      <span>${group.items.length} GIFs</span>`,
        "    </div>",
        '    <div class="sticker-preview-grid">',
        previews,
        "    </div>",
        "  </section>",
      ].join("\n")
    })
    .join("\n\n")

  return [
    "---",
    'title: "Sticker Categories"',
    'date: "2026-06-29"',
    'type: "asset-gallery"',
    'tags: ["stickers", "gif", "assets"]',
    'status: "seed"',
    "publish: true",
    'privacy: "public"',
    'description: "Categorized GIF sticker previews for choosing sticker packs."',
    'socialDescription: "Categorized GIF sticker previews for choosing sticker packs."',
    'summary: "A generated gallery of public GIF sticker packs with preview images."',
    "---",
    "",
    "# Sticker Categories",
    "",
    '<p class="sticker-wall-links"><a href="./sticker-wall">打开贴纸墙</a></p>',
    "",
    '<div class="sticker-category-index" aria-label="Sticker category index">',
    indexLinks,
    "</div>",
    "",
    '<div class="sticker-category-gallery">',
    sections,
    "</div>",
    "",
  ].join("\n")
}

function generateStickerWall() {
  const imageFiles = walk(STICKER_DIR).sort((a, b) => a.localeCompare(b))

  // Keep the Markdown page declarative: the script scans asset folders and refreshes
  // only the marked JSON block, so adding a new sticker pack does not require hand edits.
  const assets = imageFiles.map(makeAsset)
  const groups = groupAssetsByCategory(assets)

  const assetBlock = [
    '<script type="application/json" data-sticker-assets>',
    JSON.stringify(assets, null, 2),
    "</script>",
  ].join("\n")

  const source = fs.readFileSync(PAGE_PATH, "utf8")
  const wroteWall = writeFileIfChanged(PAGE_PATH, replaceMarkedBlock(source, START_MARKER, END_MARKER, assetBlock))
  const wroteCategories = writeFileIfChanged(CATEGORY_PAGE_PATH, makeCategoryPage(assets))

  console.log(
    `Sticker wall generated: ${assets.length} asset(s), ${groups.length} category page section(s)` +
      (wroteWall || wroteCategories ? "" : " (no changes)"),
  )
}

generateStickerWall()

if (watchMode) {
  const { watch } = await import("chokidar")
  let timer = undefined

  const scheduleGenerate = () => {
    clearTimeout(timer)
    timer = setTimeout(generateStickerWall, 180)
  }

  const watcher = watch(STICKER_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 80 },
  })

  watcher.on("add", scheduleGenerate)
  watcher.on("change", scheduleGenerate)
  watcher.on("unlink", scheduleGenerate)
  watcher.on("addDir", scheduleGenerate)
  watcher.on("unlinkDir", scheduleGenerate)

  console.log(`Watching sticker assets in ${normalizePath(STICKER_DIR)}`)

  const closeWatcher = async () => {
    clearTimeout(timer)
    await watcher.close()
    process.exit(0)
  }

  process.once("SIGINT", closeWatcher)
  process.once("SIGTERM", closeWatcher)
}
