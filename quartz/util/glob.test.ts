import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { glob } from "./glob"

test("glob explicitly includes one generated file without exposing other gitignored files", async (context) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "quartz-explicit-glob-"))
  context.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  fs.writeFileSync(path.join(cwd, ".gitignore"), "generated.md\nprivate.md\n", "utf8")
  fs.writeFileSync(path.join(cwd, "generated.md"), "generated", "utf8")
  fs.writeFileSync(path.join(cwd, "private.md"), "private", "utf8")
  fs.writeFileSync(path.join(cwd, "public.md"), "public", "utf8")

  const files = await glob("**/*.*", cwd, [], ["generated.md"])
  const plainFiles = files.map(String)
  assert.equal(plainFiles.includes("generated.md"), true)
  assert.equal(plainFiles.includes("public.md"), true)
  assert.equal(plainFiles.includes("private.md"), false)
})

test("glob rejects an explicit include that escapes the content directory", async () => {
  await assert.rejects(glob("**/*.*", process.cwd(), [], ["../private.md"]), /must be one exact file/)
})

test("glob rejects wildcard and Windows-absolute ignored-file includes", async () => {
  await assert.rejects(glob("**/*.*", process.cwd(), [], ["**/*.md"]), /must be one exact file/)
  await assert.rejects(
    glob("**/*.*", process.cwd(), [], ["C:\\private\\calendar.md"]),
    /must be one exact file/,
  )
})
