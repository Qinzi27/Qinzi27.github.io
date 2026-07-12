import assert from "node:assert/strict"
import test from "node:test"

import { configureGeneratedCalendarInclude } from "./site-workflow.mjs"

test("site workflow replaces inherited ignored-file patterns with one exact generated page", (context) => {
  const previous = process.env.QUARTZ_INCLUDE_GIT_IGNORED
  context.after(() => {
    if (previous === undefined) {
      delete process.env.QUARTZ_INCLUDE_GIT_IGNORED
    } else {
      process.env.QUARTZ_INCLUDE_GIT_IGNORED = previous
    }
  })

  process.env.QUARTZ_INCLUDE_GIT_IGNORED = "**/*.md\nprivate/secret.md"
  assert.equal(configureGeneratedCalendarInclude(), "Our Calendar/index.md")
  assert.equal(process.env.QUARTZ_INCLUDE_GIT_IGNORED, "Our Calendar/index.md")
})
