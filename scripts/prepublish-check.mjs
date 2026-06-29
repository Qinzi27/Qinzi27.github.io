import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const CONTENT_DIR = path.resolve("content")

const EXCLUDED_DIRS = new Set([
  "private",
  "drafts",
  "raw",
  "emails",
  "attachments",
  "pdfs",
])

const EXCLUDED_EXTENSIONS = new Set([
  ".pdf",
  ".eml",
  ".msg",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".key",
  ".pem",
  ".p12",
  ".pfx",
])

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".csv",
  ".tsv",
  ".json",
  ".yaml",
  ".yml",
])

const SENSITIVE_PATTERNS = [
  { label: "passport", pattern: /\bpassport\b/i },
  { label: "visa", pattern: /\bvisa\b/i },
  { label: "address", pattern: /\baddress\b/i },
  { label: "phone", pattern: /\bphone\b/i },
  { label: "email", pattern: /\be-?mail\b/i },
  { label: "ID number", pattern: /\bID\s*number\b/i },
  { label: "token", pattern: /\btoken\b/i },
  { label: "API key", pattern: /\bAPI[\s_-]*key\b/i },
  { label: "secret", pattern: /\bsecret\b/i },
  { label: "password", pattern: /\bpassword\b/i },
]

function normalizePath(filePath) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/")
}

function hasExcludedSegment(filePath) {
  const relative = path.relative(CONTENT_DIR, filePath)
  return relative
    .split(path.sep)
    .slice(0, -1)
    .some((segment) => EXCLUDED_DIRS.has(segment.toLowerCase()))
}

function parseMarkdownDocument(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) {
    return {
      frontmatter: {},
      body: source,
      bodyOffset: 0,
    }
  }

  const frontmatter = {}
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!field) {
      continue
    }

    let value = field[2].trim()
    value = value.replace(/^["']|["']$/g, "")

    if (/^(true|false)$/i.test(value)) {
      frontmatter[field[1]] = value.toLowerCase() === "true"
    } else {
      frontmatter[field[1]] = value
    }
  }

  return {
    frontmatter,
    body: source.slice(match[0].length),
    bodyOffset: match[0].length,
  }
}

function getPublishMode(frontmatter) {
  const publish = frontmatter.publish === true || String(frontmatter.publish).toLowerCase() === "true"
  const privacy = String(frontmatter.privacy ?? "").toLowerCase()
  if (!publish) {
    return null
  }

  if (privacy === "public" || privacy === "protected") {
    return privacy
  }

  return null
}

function getLineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length
}

function findSensitiveMatch(source) {
  for (const { label, pattern } of SENSITIVE_PATTERNS) {
    const match = pattern.exec(source)
    if (match) {
      return {
        label,
        index: match.index,
        line: getLineNumber(source, match.index),
      }
    }
  }

  return null
}

function findFrontmatterLine(source, fieldName) {
  const match = source.match(new RegExp(`^${fieldName}\\s*:`, "m"))
  if (!match) {
    return 1
  }

  return getLineNumber(source, match.index)
}

function validateProtectedMarkdown(source, frontmatter, relative) {
  const failures = []
  const hasLiteralPassword =
    typeof frontmatter.password === "string" && frontmatter.password.trim().length > 0
  const hasPasswordEnv =
    typeof frontmatter.passwordEnv === "string" && frontmatter.passwordEnv.trim().length > 0

  if (hasLiteralPassword) {
    failures.push({
      file: relative,
      keyword: "literal password in frontmatter",
      line: findFrontmatterLine(source, "password"),
    })
  }

  if (!hasPasswordEnv) {
    failures.push({
      file: relative,
      keyword: "missing passwordEnv",
      line: findFrontmatterLine(source, "privacy"),
    })
  }

  return failures
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, files)
    } else {
      files.push(fullPath)
    }
  }

  return files
}

const failures = []
const files = walk(CONTENT_DIR)

for (const file of files) {
  const relative = normalizePath(file)
  const extension = path.extname(file).toLowerCase()
  const excludedByFolder = hasExcludedSegment(file)
  const excludedByExtension = EXCLUDED_EXTENSIONS.has(extension)

  if (excludedByFolder || excludedByExtension) {
    continue
  }

  if (!TEXT_EXTENSIONS.has(extension)) {
    continue
  }

  const source = fs.readFileSync(file, "utf8")
  let scanSource = source
  let scanOffset = 0

  if (extension === ".md" || extension === ".mdx") {
    const document = parseMarkdownDocument(source)
    const publishMode = getPublishMode(document.frontmatter)
    if (!publishMode) {
      continue
    }

    if (publishMode === "protected") {
      failures.push(...validateProtectedMarkdown(source, document.frontmatter, relative))
    }

    scanSource = document.body
    scanOffset = document.bodyOffset
  }

  const sensitive = findSensitiveMatch(scanSource)
  if (sensitive) {
    failures.push({
      file: relative,
      keyword: sensitive.label,
      line: getLineNumber(source, scanOffset + sensitive.index),
    })
  }
}

if (failures.length > 0) {
  console.error("\nPRIVACY CHECK FAILED")
  console.error("Sensitive content was detected in a file that could be published.")
  for (const failure of failures) {
    console.error(`- ${failure.file}:${failure.line} matched sensitive keyword "${failure.keyword}"`)
  }
  console.error("\nNo files were deleted. Update the content, set publish: false, set privacy: private, or move it into an excluded folder.")
  process.exit(1)
}

console.log("Privacy check passed: no sensitive keywords found in publishable content.")
