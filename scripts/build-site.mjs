import { loadLocalSiteEnvironment, prepareSite, runNode, validateSiteEnvironment } from "./site-workflow.mjs"

loadLocalSiteEnvironment()

// Protected content and its shared editor token must both exist before any
// generated files are written. Secret values are never included in logs.
if (!validateSiteEnvironment("Local build")) {
  process.exit(1)
}

await prepareSite()
await runNode(["./quartz/bootstrap-cli.mjs", "build"])
