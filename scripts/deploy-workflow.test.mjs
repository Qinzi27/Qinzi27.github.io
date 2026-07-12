import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import test from "node:test"
import YAML from "yaml"

const workflowPath = ".github/workflows/deploy.yml"
const privatePaths = [
  "content/Our Calendar/每日记录编辑本.md",
  "content/Our Calendar/index.md",
]

test("Pages workflow checks out only the private calendar source with a read-only credential", () => {
  const source = fs.readFileSync(workflowPath, "utf8")
  const workflow = YAML.parse(source)
  const build = workflow.jobs.build
  const privateCheckout = build.steps.find((step) => step.name === "Checkout private calendar content")
  const buildQuartz = build.steps.find((step) => step.name === "Build Quartz")
  const upload = build.steps.find((step) => step.name === "Upload artifact")

  assert.equal(Boolean(workflow.on.pull_request_target), false)
  assert.equal(workflow.on.workflow_dispatch.inputs.calendar_ref.required, false)
  assert.equal(workflow.on.workflow_dispatch.inputs.request_id.required, false)
  assert.match(workflow["run-name"], /inputs\.calendar_ref/)
  assert.match(workflow["run-name"], /inputs\.request_id/)
  assert.equal(workflow.permissions, undefined)
  assert.deepEqual(build.permissions, { contents: "read" })
  assert.deepEqual(workflow.jobs.deploy.permissions, { pages: "write", "id-token": "write" })
  assert.equal(privateCheckout.uses, "actions/checkout@v6")
  assert.equal(privateCheckout.with.repository, "Qinzi27/Qinzi27-calendar-content")
  assert.equal(privateCheckout.with["ssh-strict"], true)
  assert.equal(privateCheckout.with["persist-credentials"], false)
  assert.equal(privateCheckout.with["sparse-checkout"].trim(), "calendar/daily-log.md")
  assert.match(privateCheckout.with["ssh-key"], /CALENDAR_CONTENT_READ_KEY/)
  assert.match(buildQuartz.env.CALENDAR_LOG_PATH, /_local\/calendar-content\/calendar\/daily-log\.md/)
  assert.equal(upload.with.path, "public")
})

test("public repository ignores and no longer tracks private calendar Markdown", () => {
  const ignoreSource = fs.readFileSync(".gitignore", "utf8")
  for (const privatePath of privatePaths) {
    assert.match(ignoreSource, new RegExp(privatePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  const tracked = execFileSync("git", ["ls-files", "-z", "--", ...privatePaths], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
  assert.deepEqual(tracked, [])
})
