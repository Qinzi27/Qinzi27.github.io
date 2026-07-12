import fs from "node:fs/promises"
import path from "path"
import { FilePath } from "./path"
import { globby } from "globby"

export function toPosixPath(fp: string): string {
  return fp.replaceAll("\\", "/").split(path.sep).join("/")
}

const GLOB_MAGIC_CHARACTERS = "*?{}[]()!"

function staysInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

async function validateExactGitIgnoredFile(cwd: string, filePath: string): Promise<string> {
  const raw = filePath.trim()
  const normalized = toPosixPath(raw).replace(/^\.\//, "")
  if (
    !normalized ||
    path.isAbsolute(raw) ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(raw) ||
    normalized.split("/").includes("..") ||
    [...GLOB_MAGIC_CHARACTERS].some((character) => normalized.includes(character))
  ) {
    throw new Error(`Explicit gitignored include must be one exact file inside the content directory: ${filePath}`)
  }

  const root = await fs.realpath(cwd)
  const absoluteFile = path.resolve(cwd, ...normalized.split("/"))
  const [realFile, stat] = await Promise.all([fs.realpath(absoluteFile), fs.stat(absoluteFile)])
  if (!staysInside(root, realFile) || !stat.isFile()) {
    throw new Error(`Explicit gitignored include must be one exact file inside the content directory: ${filePath}`)
  }

  return normalized
}

export async function glob(
  pattern: string,
  cwd: string,
  ignorePatterns: string[],
  includeGitIgnoredPaths: string[] = [],
): Promise<FilePath[]> {
  const fps = (
    await globby(pattern, {
      cwd,
      ignore: ignorePatterns,
      gitignore: true,
    })
  ).map(toPosixPath)

  // These are intentionally exact, already-generated regular files. Never
  // pass them through globby: wildcard expansion would turn the exception into
  // a second content-discovery channel that could bypass .gitignore.
  const explicitFiles = await Promise.all(
    includeGitIgnoredPaths.map((filePath) => validateExactGitIgnoredFile(cwd, filePath)),
  )

  return [...new Set([...fps, ...explicitFiles])].sort() as FilePath[]
}
