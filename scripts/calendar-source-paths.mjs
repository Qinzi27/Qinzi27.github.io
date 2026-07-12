import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function resolveFromRoot(value) {
  return path.resolve(ROOT, value)
}

export function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath)
  return relative.length > 0 && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export function resolveCalendarSourcePaths(env = process.env) {
  const privateRepoDir = resolveFromRoot(env.CALENDAR_PRIVATE_REPO_DIR?.trim() || "_local/calendar-content")
  const dailyLog = resolveFromRoot(
    env.CALENDAR_LOG_PATH?.trim() || path.join(privateRepoDir, "calendar", "daily-log.md"),
  )

  return {
    privateRepoDir,
    dailyLog,
    template: path.join(ROOT, "scripts", "templates", "our-calendar-index.md"),
    output: path.join(ROOT, "content", "Our Calendar", "index.md"),
  }
}

function requireRegularFile(filePath, label) {
  let stats
  try {
    stats = fs.statSync(filePath)
  } catch {
    throw new Error(`${label} does not exist: ${filePath}`)
  }

  if (!stats.isFile()) {
    throw new Error(`${label} is not a regular file: ${filePath}`)
  }
}

export function validateCalendarSourcePaths(paths) {
  requireRegularFile(paths.dailyLog, "Private calendar source")
  requireRegularFile(paths.template, "Calendar template")

  const privateRepoReal = fs.realpathSync.native(paths.privateRepoDir)
  const dailyLogReal = fs.realpathSync.native(paths.dailyLog)
  const contentReal = fs.realpathSync.native(path.join(ROOT, "content"))

  if (!isPathInside(privateRepoReal, dailyLogReal)) {
    throw new Error(`Private calendar source must stay inside its private repository: ${paths.dailyLog}`)
  }

  if (isPathInside(contentReal, dailyLogReal) || dailyLogReal === contentReal) {
    throw new Error(`Private calendar source cannot be read from publishable content/: ${paths.dailyLog}`)
  }

  if (path.resolve(paths.output) === path.resolve(paths.dailyLog) || path.resolve(paths.output) === path.resolve(paths.template)) {
    throw new Error("Calendar source, template, and generated output must be separate files.")
  }

  return {
    ...paths,
    privateRepoDir: privateRepoReal,
    dailyLog: dailyLogReal,
  }
}
