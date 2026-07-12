import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  ROOT,
  isPathInside,
  resolveCalendarSourcePaths,
  validateCalendarSourcePaths,
} from "./calendar-source-paths.mjs"

test("calendar source paths default to the ignored private checkout", () => {
  const paths = resolveCalendarSourcePaths({})
  assert.equal(paths.privateRepoDir, path.join(ROOT, "_local", "calendar-content"))
  assert.equal(paths.dailyLog, path.join(ROOT, "_local", "calendar-content", "calendar", "daily-log.md"))
  assert.equal(paths.template, path.join(ROOT, "scripts", "templates", "our-calendar-index.md"))
  assert.equal(paths.output, path.join(ROOT, "content", "Our Calendar", "index.md"))
})

test("calendar source paths accept explicit CI locations", () => {
  const paths = resolveCalendarSourcePaths({
    CALENDAR_PRIVATE_REPO_DIR: "_local/ci-calendar",
    CALENDAR_LOG_PATH: "_local/ci-calendar/calendar/daily-log.md",
  })
  assert.equal(paths.privateRepoDir, path.join(ROOT, "_local", "ci-calendar"))
  assert.equal(paths.dailyLog, path.join(ROOT, "_local", "ci-calendar", "calendar", "daily-log.md"))
})

test("calendar source validation accepts a regular file inside a private repository", (context) => {
  const privateRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), "qinzi27-calendar-paths-"))
  context.after(() => fs.rmSync(privateRepoDir, { recursive: true, force: true }))
  const calendarDir = path.join(privateRepoDir, "calendar")
  const dailyLog = path.join(calendarDir, "daily-log.md")
  fs.mkdirSync(calendarDir)
  fs.writeFileSync(dailyLog, "## 2000-01-01\n", "utf8")

  const validated = validateCalendarSourcePaths({
    ...resolveCalendarSourcePaths({ CALENDAR_PRIVATE_REPO_DIR: privateRepoDir, CALENDAR_LOG_PATH: dailyLog }),
  })
  assert.equal(validated.privateRepoDir, fs.realpathSync.native(privateRepoDir))
  assert.equal(validated.dailyLog, fs.realpathSync.native(dailyLog))
})

test("calendar source validation rejects a source outside the private repository", (context) => {
  const privateRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), "qinzi27-calendar-private-"))
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "qinzi27-calendar-outside-"))
  context.after(() => fs.rmSync(privateRepoDir, { recursive: true, force: true }))
  context.after(() => fs.rmSync(outsideDir, { recursive: true, force: true }))
  const outsideLog = path.join(outsideDir, "daily-log.md")
  fs.writeFileSync(outsideLog, "## 2000-01-01\n", "utf8")

  assert.throws(
    () =>
      validateCalendarSourcePaths({
        ...resolveCalendarSourcePaths({ CALENDAR_PRIVATE_REPO_DIR: privateRepoDir, CALENDAR_LOG_PATH: outsideLog }),
      }),
    /must stay inside its private repository/,
  )
})

test("path containment rejects siblings and the parent itself", () => {
  const parent = path.join(ROOT, "_local", "calendar-content")
  assert.equal(isPathInside(parent, path.join(parent, "calendar", "daily-log.md")), true)
  assert.equal(isPathInside(parent, parent), false)
  assert.equal(isPathInside(parent, path.join(ROOT, "_local", "calendar-content-copy", "daily-log.md")), false)
})
