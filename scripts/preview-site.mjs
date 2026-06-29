import { spawn } from "node:child_process"

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"
const previewPort = process.env.QUARTZ_PREVIEW_PORT ?? "8090"
const children = new Set()

function optionsFor(command) {
  return { stdio: "inherit", shell: process.platform === "win32" && command === npmCommand }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, optionsFor(command))
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))
      }
    })
    child.on("error", reject)
  })
}

function start(command, args) {
  const child = spawn(command, args, optionsFor(command))
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

await run(npmCommand, ["run", "generate-calendar"])
await run(npmCommand, ["run", "generate-sticker-wall"])
await run(npmCommand, ["run", "prepublish-check"])
await run(npmCommand, ["run", "install-plugins"])

start(process.execPath, ["./scripts/generate-sticker-wall.mjs", "--watch"])
const server = start(process.execPath, ["./quartz/bootstrap-cli.mjs", "build", "--serve", "--port", previewPort])

server.on("exit", (code) => {
  shutdown()
  process.exit(code ?? 0)
})
