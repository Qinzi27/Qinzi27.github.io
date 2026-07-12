import { loadLocalSiteEnvironment, prepareSite, startNode, validateSiteEnvironment } from "./site-workflow.mjs"

// Local preview settings stay in the ignored .env.local file. Existing shell
// variables keep precedence, so CI and one-off overrides continue to work.
loadLocalSiteEnvironment()

// Fail early instead of discovering missing protected-page settings near the
// end of the first preview build.
if (!validateSiteEnvironment("Local preview")) {
  process.exit(1)
}

const previewPort = process.env.QUARTZ_PREVIEW_PORT ?? "8090"
const children = new Set()

function start(args) {
  const child = startNode(args)
  children.add(child)
  child.on("exit", () => children.delete(child))
  return child
}

function shutdown() {
  for (const child of children) {
    child.kill()
  }
}

process.once("SIGINT", () => {
  shutdown()
  process.exit(0)
})
process.once("SIGTERM", () => {
  shutdown()
  process.exit(0)
})

await prepareSite()

start(["./scripts/generate-sticker-wall.mjs", "--watch"])
const server = start(["./quartz/bootstrap-cli.mjs", "build", "--serve", "--port", previewPort])

server.on("exit", (code) => {
  shutdown()
  process.exit(code ?? 0)
})
