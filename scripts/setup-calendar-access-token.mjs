import crypto from "node:crypto"
import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"

const localEnvPath = fileURLToPath(new URL("../.env.local", import.meta.url))
const tokenPattern = /^\s*CALENDAR_ACCESS_TOKEN\s*=/m

let source = ""
try {
  source = await fs.readFile(localEnvPath, "utf8")
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error
  }
}

if (tokenPattern.test(source)) {
  console.log("CALENDAR_ACCESS_TOKEN already exists in .env.local; no change was made.")
  process.exit(0)
}

// A separate random token keeps the calendar password out of Worker requests.
// The value is deliberately not printed to terminal output.
const token = crypto.randomBytes(32).toString("base64url")
const prefix = source.length > 0 && !source.endsWith("\n") ? "\n" : ""
await fs.appendFile(localEnvPath, `${prefix}CALENDAR_ACCESS_TOKEN="${token}"\n`, "utf8")
console.log("Created a private CALENDAR_ACCESS_TOKEN in .env.local; its value was not printed.")
