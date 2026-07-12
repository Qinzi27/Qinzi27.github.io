import { randomUUID } from "node:crypto"

const DEFAULT_SITE_REPOSITORY = "Qinzi27/Qinzi27.github.io"
const DEFAULT_WORKFLOW_FILE = "deploy.yml"
export const PRIVATE_CALENDAR_REPOSITORY = "Qinzi27/Qinzi27-calendar-content"

// The GUI commits only the canonical source inside the private content repo.
// Generated Markdown remains ignored in the public site checkout.
export const DAILY_PUBLISH_PATHS = Object.freeze(["calendar/daily-log.md"])

function normalizeGitPath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
}

export function parseNullSeparatedPaths(source) {
  return String(source ?? "")
    .split("\0")
    .map(normalizeGitPath)
    .filter(Boolean)
}

export function uniqueGitPaths(paths) {
  return [...new Set(paths.map(normalizeGitPath).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "zh-CN"),
  )
}

export function findUnexpectedPublishPaths(paths, allowedPaths = DAILY_PUBLISH_PATHS) {
  const allowed = new Set(allowedPaths.map(normalizeGitPath))
  return uniqueGitPaths(paths).filter((filePath) => !allowed.has(filePath))
}

export function assertOnlyDailyPublishPaths(paths, allowedPaths = DAILY_PUBLISH_PATHS) {
  const unexpectedPaths = findUnexpectedPublishPaths(paths, allowedPaths)
  if (unexpectedPaths.length === 0) {
    return uniqueGitPaths(paths)
  }

  const error = new Error(
    [
      "检测到日历之外的未提交改动；为避免把大型处理或其他工作混入日记提交，本次推送已停止。",
      ...unexpectedPaths.map((filePath) => `- ${filePath}`),
      "请先单独提交、暂存或撤销这些文件，再重新使用日记 GUI。",
    ].join("\n"),
  )
  error.code = "UNRELATED_CHANGES"
  error.unexpectedPaths = unexpectedPaths
  throw error
}

export function parseGitHubRepository(remoteUrl) {
  const value = String(remoteUrl ?? "").trim()
  if (!value) {
    return null
  }

  const scpMatch = value.match(/^git@github\.com:([^/]+)\/(.+)$/i)
  if (scpMatch) {
    return { owner: scpMatch[1], repo: scpMatch[2].replace(/\.git$/i, "") }
  }

  try {
    const parsed = new URL(value)
    if (parsed.hostname.toLowerCase() !== "github.com") {
      return null
    }

    const [owner, rawRepo] = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/")
    const repo = rawRepo?.replace(/\.git$/i, "")
    return owner && repo ? { owner, repo } : null
  } catch {
    return null
  }
}

export function assertPrivatePublishBaseline(
  summary,
  expectedRepository = PRIVATE_CALENDAR_REPOSITORY,
  expectedAheadCount = 0,
) {
  const repository = parseGitHubRepository(summary?.remote)
  const actualRepository = repository ? `${repository.owner}/${repository.repo}` : ""

  if (summary?.branch !== "main") {
    const error = new Error(`私有日志仓库必须位于 main 分支；当前为 ${summary?.branch || "unknown"}。`)
    error.code = "PRIVATE_BRANCH_MISMATCH"
    throw error
  }

  if (actualRepository.toLowerCase() !== expectedRepository.toLowerCase()) {
    const error = new Error(`私有日志 origin 必须是 ${expectedRepository}；当前为 ${actualRepository || "unknown"}。`)
    error.code = "PRIVATE_REMOTE_MISMATCH"
    throw error
  }

  if (summary?.upstream !== "origin/main") {
    const error = new Error(`私有日志 main 必须跟踪 origin/main；当前为 ${summary?.upstream || "未设置"}。`)
    error.code = "PRIVATE_UPSTREAM_MISMATCH"
    throw error
  }

  if (!Number.isSafeInteger(summary?.aheadCount) || summary.aheadCount !== expectedAheadCount) {
    const error = new Error(
      `私有日志分支的未推送提交数应为 ${expectedAheadCount}，实际为 ${summary?.aheadCount ?? "unknown"}；本次发布已停止。`,
    )
    error.code = "PRIVATE_OUTGOING_COMMITS"
    throw error
  }

  return summary
}

function assertFullCommitSha(value, label) {
  if (!/^[0-9a-f]{40}$/.test(String(value))) {
    const error = new Error(`${label} 不是有效的 40 位 Git 提交 SHA。`)
    error.code = "PRIVATE_COMMIT_BOUNDARY_INVALID"
    throw error
  }
}

// Verify that this publication created either no commit or exactly one commit
// containing only the canonical private source. The caller then pushes the
// verified SHA explicitly, so a second GUI/external Git process cannot append
// another local commit during the final push window.
export function assertPublishCommitBoundary({
  baselineSha,
  upstreamSha,
  headSha,
  commitCount,
  committedPaths,
  hadStagedChanges,
  allowedPaths = DAILY_PUBLISH_PATHS,
}) {
  assertFullCommitSha(baselineSha, "Baseline SHA")
  assertFullCommitSha(upstreamSha, "Upstream SHA")
  assertFullCommitSha(headSha, "HEAD SHA")

  if (upstreamSha !== baselineSha) {
    const error = new Error("发布期间 origin/main 基线已变化，为避免覆盖或夹带提交，本次推送已停止。")
    error.code = "PRIVATE_BASELINE_MOVED"
    throw error
  }

  if (!Number.isSafeInteger(commitCount) || commitCount < 0) {
    const error = new Error("无法可靠计算私有日志的新提交数，本次推送已停止。")
    error.code = "PRIVATE_COMMIT_COUNT_INVALID"
    throw error
  }

  const normalizedCommittedPaths = uniqueGitPaths(committedPaths ?? [])
  const unexpectedPaths = findUnexpectedPublishPaths(normalizedCommittedPaths, allowedPaths)
  if (unexpectedPaths.length > 0) {
    const error = new Error(`新提交含有日志之外的文件：\n${unexpectedPaths.map((filePath) => `- ${filePath}`).join("\n")}`)
    error.code = "UNRELATED_COMMITTED_PATHS"
    error.unexpectedPaths = unexpectedPaths
    throw error
  }

  if (hadStagedChanges) {
    if (headSha === baselineSha || commitCount !== 1 || normalizedCommittedPaths.length === 0) {
      const error = new Error("发布期间的 Git 提交链不符合“仅一个日志提交”边界，本次推送已停止。")
      error.code = "PRIVATE_COMMIT_BOUNDARY_CHANGED"
      throw error
    }
  } else if (headSha !== baselineSha || commitCount !== 0 || normalizedCommittedPaths.length !== 0) {
    const error = new Error("本次没有日志改动，但 HEAD 在发布期间发生了变化，本次推送已停止。")
    error.code = "PRIVATE_HEAD_CHANGED"
    throw error
  }

  return { headSha, committedPaths: normalizedCommittedPaths }
}

export function createExclusiveRunner(task) {
  let running = false

  return {
    get running() {
      return running
    },

    async run(...args) {
      if (running) {
        return {
          accepted: false,
          error: {
            code: "PUSH_IN_PROGRESS",
            message: "已有一次日志保存或发布正在执行，请等待当前操作完成。",
          },
        }
      }

      running = true
      try {
        return { accepted: true, value: await task(...args) }
      } finally {
        running = false
      }
    },
  }
}

function completedDeployment(run) {
  const success = run.conclusion === "success"
  return {
    status: success ? "success" : "failure",
    conclusion: run.conclusion || "unknown",
    workflowStatus: run.status || "completed",
    runUrl: run.url || "",
    message: success
      ? "GitHub Pages 构建与部署成功。"
      : `GitHub Pages 工作流结束，但结果为 ${run.conclusion || "unknown"}。`,
  }
}

function sleepWithTimer(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

export async function pollGitHubPagesDeployment({
  sha,
  siteRepository = DEFAULT_SITE_REPOSITORY,
  workflowFile = DEFAULT_WORKFLOW_FILE,
  timeoutMs = 10 * 60_000,
  pollIntervalMs = 15_000,
  runGh,
  sleep = sleepWithTimer,
  now = Date.now,
}) {
  if (!/^[0-9a-f]{40}$/.test(String(sha))) {
    throw new Error("Private calendar commit SHA must contain 40 lowercase hexadecimal characters.")
  }

  if (typeof runGh !== "function") {
    throw new Error("GitHub CLI runner is required to dispatch the Pages workflow.")
  }

  // A UUID makes every dispatch distinguishable even when the same private
  // commit is published repeatedly. Matching by SHA alone can select an older
  // completed run before the new run has appeared in GitHub's list API.
  const requestId = `gui-${randomUUID()}`

  try {
    await runGh([
      "workflow",
      "run",
      workflowFile,
      "--repo",
      siteRepository,
      "--ref",
      "main",
      "--raw-field",
      `calendar_ref=${sha}`,
      "--raw-field",
      `request_id=${requestId}`,
    ])
  } catch (error) {
    return {
      status: "dispatch_failed",
      conclusion: "",
      workflowStatus: "",
      runUrl: "",
      message: `私有日志已推送，但触发网站构建失败：${error.message || String(error)}`,
    }
  }

  const deadline = now() + timeoutMs
  let latestRun = null
  let latestError = null

  while (true) {
    try {
      const output = await runGh([
        "run",
        "list",
        "--repo",
        siteRepository,
        "--workflow",
        workflowFile,
        "--event",
        "workflow_dispatch",
        "--limit",
        "20",
        "--json",
        "databaseId,status,conclusion,url,createdAt,displayTitle",
      ])
      const runs = JSON.parse(output.stdout || "[]")
      latestRun = runs.find((run) => String(run.displayTitle || "").includes(requestId)) ?? latestRun
      latestError = null

      if (latestRun?.status === "completed") {
        return completedDeployment(latestRun)
      }
    } catch (error) {
      latestError = error
    }

    if (now() >= deadline) {
      return {
        status: "timed_out",
        conclusion: latestRun?.conclusion || "",
        workflowStatus: latestRun?.status || "not_found",
        runUrl: latestRun?.url || "",
        message: latestRun
          ? "Git 已推送，但等待 GitHub Pages 完成超时；可打开工作流链接继续查看。"
          : latestError
            ? `私有日志已推送，但查询网站构建状态持续失败：${latestError.message || String(latestError)}`
            : "私有日志已推送，但在等待时间内没有发现对应私仓提交的网站工作流。",
      }
    }

    await sleep(pollIntervalMs)
  }
}

async function runStep(steps, name, action) {
  try {
    const output = await action()
    steps.push({ name, ok: true, ...output })
    return output
  } catch (error) {
    steps.push({
      name,
      ok: false,
      command: error.command || "",
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || String(error),
      unexpectedPaths: error.unexpectedPaths || [],
    })
    throw error
  }
}

function pathCheckOutput(paths) {
  return {
    command: "git changed-path audit",
    stdout: paths.length > 0 ? paths.join("\n") : "没有未提交改动。",
    stderr: "",
  }
}

function deploymentStep(deployment) {
  const success = deployment.status === "success"
  return {
    name: "触发并等待 Pages 部署",
    ok: success,
    command: deployment.runUrl || "gh workflow run / gh run list",
    stdout: success ? deployment.message : "",
    stderr: success ? "" : deployment.message,
  }
}

export function createDailyPublishRunner(dependencies) {
  const {
    publishPaths = DAILY_PUBLISH_PATHS,
    syncCalendar,
    runProjectCheck,
    listChangedPaths,
    stagePaths,
    listStagedPaths,
    commit,
    getGitSummary,
    validateBaseline,
    push,
    getHeadSha,
    getUpstreamSha,
    countCommitsBetween,
    listCommittedPaths,
    pollDeployment,
  } = dependencies
  const allowedPublishPaths = [...publishPaths]

  return async function runDailyPublish({ message, runCheck = true }) {
    const steps = []
    let git = { pushed: false, sha: "", branch: "", remote: "" }
    let deployment = {
      status: "not_started",
      conclusion: "",
      workflowStatus: "",
      runUrl: "",
      message: "尚未开始检查 GitHub Pages。",
    }

    const safeSummary = async () => {
      try {
        return await getGitSummary()
      } catch {
        return null
      }
    }

    try {
      const baseline = await getGitSummary()
      const baselineSha = await getHeadSha()
      const baselineUpstreamSha = await getUpstreamSha()
      await runStep(steps, "核对私有仓库基线", async () => {
        await validateBaseline(baseline)
        if (baselineSha !== baselineUpstreamSha) {
          const error = new Error("私有日志 HEAD 与 origin/main 不一致，本次发布已停止。")
          error.code = "PRIVATE_BASELINE_SHA_MISMATCH"
          throw error
        }
        assertFullCommitSha(baselineSha, "Baseline SHA")
        return {
          command: "git branch / origin / upstream / outgoing audit",
          stdout: "私有日志 main 与 origin/main 同步，且没有既有未推送提交。",
          stderr: "",
        }
      })

      const initialPaths = await listChangedPaths()
      await runStep(steps, "检查改动范围", async () => {
        assertOnlyDailyPublishPaths(initialPaths, allowedPublishPaths)
        return pathCheckOutput(initialPaths)
      })

      await runStep(steps, "同步日历", syncCalendar)

      if (runCheck) {
        await runStep(steps, "项目检查", runProjectCheck)
      }

      const finalPaths = await listChangedPaths()
      await runStep(steps, "再次检查改动范围", async () => {
        assertOnlyDailyPublishPaths(finalPaths, allowedPublishPaths)
        return pathCheckOutput(finalPaths)
      })

      await runStep(steps, "暂存日历文件", () => stagePaths(allowedPublishPaths))
      const stagedPaths = await listStagedPaths()
      await runStep(steps, "核对暂存内容", async () => {
        assertOnlyDailyPublishPaths(stagedPaths, allowedPublishPaths)
        return pathCheckOutput(stagedPaths)
      })

      const pathsAfterStaging = await listChangedPaths()
      await runStep(steps, "最终检查工作区", async () => {
        assertOnlyDailyPublishPaths(pathsAfterStaging, allowedPublishPaths)
        return pathCheckOutput(pathsAfterStaging)
      })

      if (stagedPaths.length === 0) {
        steps.push({
          name: "创建提交",
          ok: true,
          command: "git commit",
          stdout: "没有新的日历改动，跳过提交。",
          stderr: "",
        })
      } else {
        await runStep(steps, "创建提交", () => commit(message))
      }

      const hadStagedChanges = stagedPaths.length > 0
      const summary = await getGitSummary()
      const remainingPaths = await listChangedPaths()
      await runStep(steps, "推送前复核工作区", async () => {
        if (remainingPaths.length > 0) {
          const error = new Error(`提交后又出现未处理的工作区改动：\n${remainingPaths.map((filePath) => `- ${filePath}`).join("\n")}`)
          error.code = "PRIVATE_WORKTREE_CHANGED"
          error.unexpectedPaths = remainingPaths
          throw error
        }
        const expectedAheadCount = hadStagedChanges ? 1 : 0
        await validateBaseline(summary, expectedAheadCount)
        return pathCheckOutput(remainingPaths)
      })
      const sha = await getHeadSha()
      const upstreamShaBeforePush = await getUpstreamSha()
      const commitCount = await countCommitsBetween(baselineSha, sha)
      const committedPaths = await listCommittedPaths(baselineSha, sha)
      await runStep(steps, "核对待推送提交边界", async () => {
        const verified = assertPublishCommitBoundary({
          baselineSha,
          upstreamSha: upstreamShaBeforePush,
          headSha: sha,
          commitCount,
          committedPaths,
          hadStagedChanges,
          allowedPaths: allowedPublishPaths,
        })
        return {
          command: "git rev-list / git diff baseline..HEAD",
          stdout: hadStagedChanges
            ? `已确认仅有一个日志提交：${verified.headSha}`
            : `没有新提交，继续发布已验证的日志 SHA：${verified.headSha}`,
          stderr: "",
        }
      })
      await runStep(steps, "推送私有日志仓库", () => push({ ...summary, sha }))
      git = {
        pushed: true,
        sha,
        branch: summary.branch,
        remote: summary.remote,
      }

      await runStep(steps, "确认私有远端提交", async () => {
        const upstreamSha = await getUpstreamSha()
        if (upstreamSha !== sha) {
          const error = new Error(`私有日志远端 SHA 与本地不一致：local=${sha}, upstream=${upstreamSha}`)
          error.code = "PRIVATE_UPSTREAM_SHA_MISMATCH"
          throw error
        }
        return {
          command: "git rev-parse HEAD / @{u}",
          stdout: `私有日志已安全推送：${sha}`,
          stderr: "",
        }
      })

      deployment = await pollDeployment({ sha })
      steps.push(deploymentStep(deployment))

      const ok = deployment.status === "success"
      return {
        ok,
        code: ok ? "PAGES_DEPLOYED" : "PAGES_NOT_DEPLOYED",
        error: ok ? "" : deployment.message,
        message,
        gitPushed: true,
        git,
        deployment,
        steps,
        summary: await safeSummary(),
      }
    } catch (error) {
      if (git.pushed && deployment.status === "not_started") {
        deployment = {
          status: "unavailable",
          conclusion: "",
          workflowStatus: "",
          runUrl: "",
          message: "私有日志已推送，但未能完成 GitHub Pages 状态检查。",
        }
      }

      return {
        ok: false,
        code: error.code || "PUBLISH_FAILED",
        error: error.message || String(error),
        unexpectedPaths: error.unexpectedPaths || [],
        message,
        gitPushed: git.pushed,
        git,
        deployment,
        steps,
        summary: await safeSummary(),
      }
    }
  }
}
