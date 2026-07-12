import { spawn } from "node:child_process"
import fs from "node:fs"
import { fileURLToPath } from "node:url"

const siteRoot = fileURLToPath(new URL("../", import.meta.url))
const localEnvPath = fileURLToPath(new URL("../.env.local", import.meta.url))
const generatedCalendarContentPath = "Our Calendar/index.md"

// Local secrets remain in the ignored .env.local file. Node's loader keeps
// values already supplied by the shell or CI, so explicit deployment settings
// continue to take precedence.
export function loadLocalSiteEnvironment() {
  if (fs.existsSync(localEnvPath)) {
    process.loadEnvFile(localEnvPath)
  }
}

export function validateSiteEnvironment(actionLabel) {
  const required = ["PARENT_CALENDAR_PASSWORD", "CALENDAR_ACCESS_TOKEN"]
  const missing = required.filter((name) => !process.env[name]?.trim())
  if (missing.length === 0) {
    return true
  }

  console.error(
    [
      `${actionLabel} is missing required protected-page environment variables: ${missing.join(", ")}.`,
      "Add them to the ignored .env.local file, then run the command again.",
    ].join("\n"),
  )
  return false
}

// All site workflow children are JavaScript entry points. Calling the current
// Node executable directly avoids Windows shell quoting and shell:true warnings.
export function startNode(args) {
  return spawn(process.execPath, args, {
    cwd: siteRoot,
    stdio: "inherit",
    windowsHide: true,
  })
}

export function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = startNode(args)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`node ${args.join(" ")} exited with ${code}`))
      }
    })
    child.on("error", reject)
  })
}

export function configureGeneratedCalendarInclude() {
  // Deliberately overwrite any inherited value: this variable is a narrow
  // build-internal allowlist, not a user-extensible glob configuration.
  process.env.QUARTZ_INCLUDE_GIT_IGNORED = generatedCalendarContentPath
  return generatedCalendarContentPath
}

// Preview and production builds share these preparation steps so generated
// pages and privacy checks cannot silently drift between the two workflows.
export async function prepareSite() {
  // The generated calendar Markdown is intentionally gitignored so plaintext
  // never enters the public repository. Quartz receives one exact, temporary
  // exception while every other gitignored file remains excluded.
  configureGeneratedCalendarInclude()

  await runNode(["./scripts/generate-calendar-stickers.mjs"])
  await runNode(["./scripts/generate-sticker-wall.mjs"])
  await runNode(["./scripts/prepublish-check.mjs"])
  await runNode(["./quartz/bootstrap-cli.mjs", "plugin", "install", "--from-config"])
}
