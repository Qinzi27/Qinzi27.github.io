import assert from "node:assert/strict"
import test from "node:test"

import {
  DAILY_PUBLISH_PATHS,
  PRIVATE_CALENDAR_REPOSITORY,
  assertPublishCommitBoundary,
  assertPrivatePublishBaseline,
  assertOnlyDailyPublishPaths,
  createDailyPublishRunner,
  createExclusiveRunner,
  findUnexpectedPublishPaths,
  parseGitHubRepository,
  parseNullSeparatedPaths,
  pollGitHubPagesDeployment,
} from "./daily-log-publish.mjs"

const DAILY_LOG = "calendar/daily-log.md"
const BASELINE_SHA = "1111111111111111111111111111111111111111"
const PRIVATE_SHA = "0123456789abcdef0123456789abcdef01234567"

function commandOutput(command = "mock") {
  return { command, stdout: "ok", stderr: "" }
}

function makeRunnerDependencies(overrides = {}) {
  const changedPathResponses = [[DAILY_LOG], [DAILY_LOG], [DAILY_LOG], []]
  let changedPathCall = 0
  let gitSummaryCall = 0
  let headShaCall = 0
  let upstreamShaCall = 0

  return {
    syncCalendar: async () => commandOutput("generate calendar"),
    runProjectCheck: async () => commandOutput("project check"),
    listChangedPaths: async () => changedPathResponses[changedPathCall++] ?? [],
    stagePaths: async () => commandOutput("git add"),
    listStagedPaths: async () => [DAILY_LOG],
    commit: async () => commandOutput("git commit"),
    getGitSummary: async () => ({
      branch: "main",
      branchLine: "main...origin/main",
      remote: "https://github.com/Qinzi27/Qinzi27-calendar-content.git",
      upstream: "origin/main",
      aheadBehind: "",
      aheadCount: gitSummaryCall++ === 0 ? 0 : 1,
      changes: [],
    }),
    validateBaseline: async (summary, expectedAheadCount = 0) =>
      assertPrivatePublishBaseline(summary, undefined, expectedAheadCount),
    push: async () => commandOutput("git push"),
    getHeadSha: async () => (headShaCall++ === 0 ? BASELINE_SHA : PRIVATE_SHA),
    getUpstreamSha: async () => (upstreamShaCall++ < 2 ? BASELINE_SHA : PRIVATE_SHA),
    countCommitsBetween: async () => 1,
    listCommittedPaths: async () => [DAILY_LOG],
    pollDeployment: async () => ({
      status: "success",
      conclusion: "success",
      workflowStatus: "completed",
      runUrl: "https://github.com/Qinzi27/Qinzi27.github.io/actions/runs/123",
      message: "GitHub Pages 构建与部署成功。",
    }),
    ...overrides,
  }
}

test("daily publish path audit accepts only the private canonical source", () => {
  assert.deepEqual(DAILY_PUBLISH_PATHS, [DAILY_LOG])
  assert.deepEqual(parseNullSeparatedPaths(`${DAILY_LOG}\0`), [DAILY_LOG])
  assert.deepEqual(findUnexpectedPublishPaths([DAILY_LOG, "README.md", "tools\\helper.js"]), [
    "README.md",
    "tools/helper.js",
  ])
  assert.deepEqual(assertOnlyDailyPublishPaths([DAILY_LOG]), [DAILY_LOG])
})

test("daily publish path audit reports every unrelated change", () => {
  assert.throws(
    () => assertOnlyDailyPublishPaths([DAILY_LOG, "README.md", "scripts/other.mjs"]),
    (error) => {
      assert.equal(error.code, "UNRELATED_CHANGES")
      assert.deepEqual(error.unexpectedPaths, ["README.md", "scripts/other.mjs"])
      assert.match(error.message, /README\.md/)
      return true
    },
  )
})

test("exclusive runner rejects a concurrent push and releases the lock", async () => {
  let releaseFirst
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve
  })
  let calls = 0
  const coordinator = createExclusiveRunner(async () => {
    calls += 1
    if (calls === 1) {
      await firstGate
    }
    return calls
  })

  const first = coordinator.run()
  await Promise.resolve()
  const second = await coordinator.run()

  assert.equal(second.accepted, false)
  assert.equal(second.error.code, "PUSH_IN_PROGRESS")
  assert.equal(coordinator.running, true)

  releaseFirst()
  assert.deepEqual(await first, { accepted: true, value: 1 })
  assert.equal(coordinator.running, false)
  assert.deepEqual(await coordinator.run(), { accepted: true, value: 2 })
})

test("exclusive runner releases the lock when the task throws", async () => {
  let fail = true
  const coordinator = createExclusiveRunner(async () => {
    if (fail) {
      fail = false
      throw new Error("expected failure")
    }
    return "recovered"
  })

  await assert.rejects(coordinator.run(), /expected failure/)
  assert.equal(coordinator.running, false)
  assert.deepEqual(await coordinator.run(), {
    accepted: true,
    value: "recovered",
  })
})

test("daily publish runner refuses unrelated work before generating or pushing", async () => {
  let generated = false
  let pushed = false
  const runner = createDailyPublishRunner(
    makeRunnerDependencies({
      listChangedPaths: async () => [DAILY_LOG, "quartz/styles/custom.scss", "README.md"],
      syncCalendar: async () => {
        generated = true
        return commandOutput()
      },
      push: async () => {
        pushed = true
        return commandOutput()
      },
    }),
  )

  const result = await runner({ message: "Update journal", runCheck: true })

  assert.equal(result.ok, false)
  assert.equal(result.code, "UNRELATED_CHANGES")
  assert.equal(result.gitPushed, false)
  assert.deepEqual(result.unexpectedPaths, ["quartz/styles/custom.scss", "README.md"])
  assert.equal(generated, false)
  assert.equal(pushed, false)
})

test("daily publish runner stages exactly the private source and confirms Pages", async () => {
  let stagedPaths = null
  let committedMessage = ""
  let pushed = false
  let pushedSha = ""
  const runner = createDailyPublishRunner(
    makeRunnerDependencies({
      stagePaths: async (paths) => {
        stagedPaths = [...paths]
        return commandOutput("git add -- calendar paths")
      },
      commit: async (message) => {
        committedMessage = message
        return commandOutput("git commit")
      },
      push: async ({ sha }) => {
        pushed = true
        pushedSha = sha
        return commandOutput("git push")
      },
    }),
  )

  const result = await runner({
    message: "Update journal safely",
    runCheck: true,
  })

  assert.deepEqual(stagedPaths, DAILY_PUBLISH_PATHS)
  assert.equal(committedMessage, "Update journal safely")
  assert.equal(pushed, true)
  assert.equal(pushedSha, PRIVATE_SHA)
  assert.equal(result.ok, true)
  assert.equal(result.code, "PAGES_DEPLOYED")
  assert.equal(result.gitPushed, true)
  assert.equal(result.git.sha, PRIVATE_SHA)
  assert.equal(result.deployment.status, "success")
  assert.match(result.deployment.runUrl, /actions\/runs\/123/)
})

test("daily publish runner safely redeploys an unchanged private commit", async () => {
  let pushedSha = ""
  const runner = createDailyPublishRunner(
    makeRunnerDependencies({
      listChangedPaths: async () => [],
      listStagedPaths: async () => [],
      getGitSummary: async () => ({
        branch: "main",
        branchLine: "main...origin/main",
        remote: "https://github.com/Qinzi27/Qinzi27-calendar-content.git",
        upstream: "origin/main",
        aheadBehind: "",
        aheadCount: 0,
        changes: [],
      }),
      getHeadSha: async () => BASELINE_SHA,
      getUpstreamSha: async () => BASELINE_SHA,
      countCommitsBetween: async () => 0,
      listCommittedPaths: async () => [],
      push: async ({ sha }) => {
        pushedSha = sha
        return commandOutput("git push exact SHA")
      },
    }),
  )

  const result = await runner({ message: "Redeploy unchanged journal", runCheck: false })

  assert.equal(result.ok, true)
  assert.equal(result.git.sha, BASELINE_SHA)
  assert.equal(pushedSha, BASELINE_SHA)
})

test("daily publish runner accepts a centralized path boundary override", async () => {
  const privateRepoPaths = ["private-log/daily.md"]
  let stagedPaths = null
  let changedPathCall = 0
  const runner = createDailyPublishRunner(
    makeRunnerDependencies({
      publishPaths: privateRepoPaths,
      listChangedPaths: async () => (changedPathCall++ < 3 ? privateRepoPaths : []),
      listStagedPaths: async () => privateRepoPaths,
      listCommittedPaths: async () => privateRepoPaths,
      stagePaths: async (paths) => {
        stagedPaths = [...paths]
        return commandOutput()
      },
    }),
  )

  const result = await runner({ message: "Publish private source boundary", runCheck: false })

  assert.equal(result.ok, true)
  assert.deepEqual(stagedPaths, privateRepoPaths)
})

test("daily publish runner catches unrelated work that appears during staging", async () => {
  const changedPathResponses = [[DAILY_LOG], [DAILY_LOG], [DAILY_LOG, "content/Now.md"]]
  let committed = false
  let pushed = false
  const runner = createDailyPublishRunner(
    makeRunnerDependencies({
      listChangedPaths: async () => changedPathResponses.shift() ?? [],
      commit: async () => {
        committed = true
        return commandOutput()
      },
      push: async () => {
        pushed = true
        return commandOutput()
      },
    }),
  )

  const result = await runner({ message: "Update journal", runCheck: true })

  assert.equal(result.code, "UNRELATED_CHANGES")
  assert.deepEqual(result.unexpectedPaths, ["content/Now.md"])
  assert.equal(committed, false)
  assert.equal(pushed, false)
})

test("daily publish runner distinguishes a successful Git push from a failed Pages deployment", async () => {
  const runner = createDailyPublishRunner(
    makeRunnerDependencies({
      pollDeployment: async () => ({
        status: "failure",
        conclusion: "failure",
        workflowStatus: "completed",
        runUrl: "https://github.com/Qinzi27/Qinzi27.github.io/actions/runs/456",
        message: "GitHub Pages 工作流结束，但结果为 failure。",
      }),
    }),
  )

  const result = await runner({ message: "Update journal", runCheck: false })

  assert.equal(result.ok, false)
  assert.equal(result.code, "PAGES_NOT_DEPLOYED")
  assert.equal(result.gitPushed, true)
  assert.equal(result.git.pushed, true)
  assert.equal(result.deployment.status, "failure")
  assert.match(result.error, /failure/)
})

test("GitHub remote parser supports HTTPS and SSH remotes", () => {
  assert.deepEqual(parseGitHubRepository("https://github.com/Qinzi27/Qinzi27.github.io.git"), {
    owner: "Qinzi27",
    repo: "Qinzi27.github.io",
  })
  assert.deepEqual(parseGitHubRepository("git@github.com:Qinzi27/Qinzi27.github.io.git"), {
    owner: "Qinzi27",
    repo: "Qinzi27.github.io",
  })
  assert.equal(parseGitHubRepository("https://example.com/Qinzi27/site.git"), null)
})

test("private publish baseline requires the expected clean main upstream", () => {
  const summary = {
    branch: "main",
    remote: `https://github.com/${PRIVATE_CALENDAR_REPOSITORY}.git`,
    upstream: "origin/main",
    aheadCount: 0,
  }
  assert.equal(assertPrivatePublishBaseline(summary), summary)

  assert.throws(
    () => assertPrivatePublishBaseline({ ...summary, aheadCount: 1 }),
    (error) => error.code === "PRIVATE_OUTGOING_COMMITS",
  )
  assert.throws(
    () => assertPrivatePublishBaseline({ ...summary, aheadCount: null }),
    (error) => error.code === "PRIVATE_OUTGOING_COMMITS",
  )
  assert.throws(
    () => assertPrivatePublishBaseline({ ...summary, aheadCount: Number.NaN }),
    (error) => error.code === "PRIVATE_OUTGOING_COMMITS",
  )
  assert.throws(
    () => assertPrivatePublishBaseline({ ...summary, branch: "feature" }),
    (error) => error.code === "PRIVATE_BRANCH_MISMATCH",
  )
  assert.throws(
    () => assertPrivatePublishBaseline({ ...summary, remote: "https://github.com/Qinzi27/Qinzi27.github.io.git" }),
    (error) => error.code === "PRIVATE_REMOTE_MISMATCH",
  )
  assert.throws(
    () => assertPrivatePublishBaseline({ ...summary, upstream: "backup/main" }),
    (error) => error.code === "PRIVATE_UPSTREAM_MISMATCH",
  )
})

test("private publish boundary permits exactly one canonical commit", () => {
  const nextSha = "abcdef0123456789abcdef0123456789abcdef01"
  assert.deepEqual(
    assertPublishCommitBoundary({
      baselineSha: PRIVATE_SHA,
      upstreamSha: PRIVATE_SHA,
      headSha: nextSha,
      commitCount: 1,
      committedPaths: [DAILY_LOG],
      hadStagedChanges: true,
    }),
    { headSha: nextSha, committedPaths: [DAILY_LOG] },
  )

  assert.throws(
    () =>
      assertPublishCommitBoundary({
        baselineSha: PRIVATE_SHA,
        upstreamSha: PRIVATE_SHA,
        headSha: nextSha,
        commitCount: 2,
        committedPaths: [DAILY_LOG, "README.md"],
        hadStagedChanges: true,
      }),
    (error) => error.code === "UNRELATED_COMMITTED_PATHS",
  )
})

test("daily publish runner blocks an external commit inserted during the build", async () => {
  const insertedSha = "abcdef0123456789abcdef0123456789abcdef01"
  let headCall = 0
  let pushed = false
  const runner = createDailyPublishRunner(
    makeRunnerDependencies({
      getHeadSha: async () => (headCall++ === 0 ? BASELINE_SHA : insertedSha),
      countCommitsBetween: async () => 2,
      listCommittedPaths: async () => [DAILY_LOG, "README.md"],
      push: async () => {
        pushed = true
        return commandOutput("git push")
      },
    }),
  )

  const result = await runner({ message: "Block inserted commit", runCheck: true })

  assert.equal(result.ok, false)
  assert.equal(result.code, "UNRELATED_COMMITTED_PATHS")
  assert.equal(pushed, false)
})

test("Pages dispatcher waits for the matching private SHA and returns the workflow URL", async () => {
  let clock = 0
  let listCount = 0
  const workflowUrl = "https://github.com/Qinzi27/Qinzi27.github.io/actions/runs/789"
  let requestId = ""

  const result = await pollGitHubPagesDeployment({
    sha: PRIVATE_SHA,
    timeoutMs: 1_000,
    pollIntervalMs: 100,
    now: () => clock,
    sleep: async (delay) => {
      clock += delay
    },
    runGh: async (args) => {
      if (args[0] === "workflow") {
        assert.deepEqual(args.slice(0, 3), ["workflow", "run", "deploy.yml"])
        assert.ok(args.includes(`calendar_ref=${PRIVATE_SHA}`))
        requestId = args.find((value) => value.startsWith("request_id="))?.slice("request_id=".length) ?? ""
        assert.match(requestId, /^gui-[0-9a-f-]{36}$/)
        return commandOutput("gh workflow run")
      }
      listCount += 1
      assert.deepEqual(args.slice(0, 3), ["run", "list", "--repo"])
      const oldCompletedRun = {
        displayTitle: `Deploy Quartz site · ${PRIVATE_SHA}`,
        status: "completed",
        conclusion: "success",
        url: "https://github.com/Qinzi27/Qinzi27.github.io/actions/runs/old",
      }
      const currentRun = {
        displayTitle: `Deploy Quartz site · ${PRIVATE_SHA} · ${requestId}`,
        status: listCount < 3 ? "in_progress" : "completed",
        conclusion: listCount < 3 ? null : "success",
        url: workflowUrl,
      }
      const runs = listCount === 1 ? [oldCompletedRun] : [oldCompletedRun, currentRun]
      return { command: "gh run list", stdout: JSON.stringify(runs), stderr: "" }
    },
  })

  assert.equal(listCount, 3)
  assert.equal(result.status, "success")
  assert.equal(result.conclusion, "success")
  assert.equal(result.runUrl, workflowUrl)
})

test("Pages dispatcher returns a run URL when the workflow fails", async () => {
  const workflowUrl = "https://github.com/Qinzi27/Qinzi27.github.io/actions/runs/999"
  let requestId = ""
  const result = await pollGitHubPagesDeployment({
    sha: PRIVATE_SHA,
    timeoutMs: 0,
    runGh: async (args) => {
      if (args[0] === "workflow") {
        requestId = args.find((value) => value.startsWith("request_id="))?.slice("request_id=".length) ?? ""
        return commandOutput("gh workflow run")
      }
      return {
        command: "gh run list",
        stdout: JSON.stringify([
          {
            displayTitle: `Deploy Quartz site · ${PRIVATE_SHA} · ${requestId}`,
            status: "completed",
            conclusion: "failure",
            url: workflowUrl,
          },
        ]),
        stderr: "",
      }
    },
  })

  assert.equal(result.status, "failure")
  assert.equal(result.conclusion, "failure")
  assert.equal(result.runUrl, workflowUrl)
})

test("Pages dispatcher reports a failed workflow dispatch after the private push", async () => {
  const result = await pollGitHubPagesDeployment({
    sha: PRIVATE_SHA,
    runGh: async () => {
      throw new Error("gh is not authenticated")
    },
  })

  assert.equal(result.status, "dispatch_failed")
  assert.match(result.message, /私有日志已推送/)
  assert.match(result.message, /not authenticated/)
})
