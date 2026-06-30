const state = {
  entries: [],
  mode: "sleep",
  today: "",
}

const form = document.querySelector("#entry-form")
const fields = {
  date: document.querySelector("#date"),
  sleep: document.querySelector("#sleep"),
  title: document.querySelector("#title"),
  mood: document.querySelector("#mood"),
  weather: document.querySelector("#weather"),
  tags: document.querySelector("#tags"),
  stickers: document.querySelector("#stickers"),
  whispers: document.querySelector("#whispers"),
  sentence: document.querySelector("#sentence"),
  together: document.querySelector("#together"),
  remember: document.querySelector("#remember"),
  generate: document.querySelector("#generate"),
}

const preview = document.querySelector("#markdown-preview")
const recentList = document.querySelector("#recent-list")
const saveMessage = document.querySelector("#save-message")
const connectionStatus = document.querySelector("#connection-status")
const saveButton = document.querySelector("#save-button")
const commitMessage = document.querySelector("#commit-message")
const runCheck = document.querySelector("#run-check")
const gitStatus = document.querySelector("#git-status")
const pushMessage = document.querySelector("#push-message")
const pushButton = document.querySelector("#push-button")

function formPayload() {
  return {
    mode: state.mode,
    date: fields.date.value,
    sleep: fields.sleep.value,
    title: fields.title.value,
    mood: fields.mood.value,
    weather: fields.weather.value,
    tags: fields.tags.value,
    stickers: fields.stickers.value,
    whispers: fields.whispers.value,
    sentence: fields.sentence.value,
    together: fields.together.value,
    remember: fields.remember.value,
    generate: fields.generate.checked,
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || "请求失败")
  }
  return payload
}

function setMessage(text, kind = "") {
  saveMessage.textContent = text
  saveMessage.className = `save-message${kind ? ` is-${kind}` : ""}`
}

function setConnection(text, kind = "") {
  connectionStatus.textContent = text
  connectionStatus.className = `status-chip${kind ? ` is-${kind}` : ""}`
}

function setPushMessage(text, kind = "") {
  pushMessage.textContent = text
  pushMessage.className = `save-message${kind ? ` is-${kind}` : ""}`
}

function setMode(nextMode) {
  state.mode = nextMode
  document.querySelectorAll(".mode-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === nextMode)
  })

  fields.sleep.placeholder = nextMode === "note" ? "可留空" : "01:20左右"
  if (nextMode === "note" && !fields.title.value.trim() && !fields.sleep.value.trim()) {
    fields.title.placeholder = "可留空，碎碎念会显示在日期下面"
  } else {
    fields.title.placeholder = "可留空，优先使用碎碎念作为日历摘要"
  }
  updatePreview()
}

function entryAttributeLabel(entry) {
  return entry.attributeLabel || (entry.sleep ? "休息" : "记录")
}

function entryMetaParts(entry) {
  const attribute = entryAttributeLabel(entry)
  const sleep = entry.sleepTime || entry.sleep
  return [
    entry.date,
    sleep ? `${attribute} ${sleep}` : attribute,
    entry.noteCount ? `碎碎念 ${entry.noteCount} 条` : "",
  ].filter(Boolean)
}

function renderRecentEntries(entries) {
  recentList.innerHTML = ""
  if (entries.length === 0) {
    recentList.innerHTML = '<p class="save-message">还没有读到记录。</p>'
    return
  }

  entries.slice(0, 8).forEach((entry) => {
    const item = document.createElement("article")
    item.className = `recent-item is-${entry.attribute || (entry.sleep ? "rest" : "note")}-entry`

    const title = document.createElement("strong")
    title.textContent = entry.title || entry.excerpt || entryAttributeLabel(entry)

    const meta = document.createElement("span")
    meta.className = "recent-meta"
    meta.textContent = entryMetaParts(entry).join(" · ")

    item.append(title, meta)
    recentList.append(item)
  })
}

function formatGitStatus(payload) {
  const lines = [
    `branch: ${payload.branchLine || payload.branch || "(unknown)"}`,
    payload.aheadBehind ? `sync: ${payload.aheadBehind}` : "sync: clean with upstream or unknown",
    payload.upstream ? `upstream: ${payload.upstream}` : "upstream: not set",
    payload.remote ? `remote: ${payload.remote}` : "remote: not set",
    "",
    "changes:",
  ]

  if (!payload.changes || payload.changes.length === 0) {
    lines.push("  clean")
  } else {
    payload.changes.forEach((change) => {
      lines.push(`  ${change.code} ${change.path}`)
    })
  }

  return lines.join("\n")
}

function renderGitStatus(payload) {
  gitStatus.textContent = formatGitStatus(payload)
}

function renderPushResult(payload) {
  const lines = [`result: ${payload.ok ? "success" : "failed"}`, `commit message: ${payload.message}`, ""]

  payload.steps.forEach((step) => {
    lines.push(`[${step.ok === false ? "failed" : "ok"}] ${step.name} ${step.command || ""}`.trim())
    if (step.stdout) {
      lines.push(step.stdout)
    }
    if (step.stderr) {
      lines.push(step.stderr)
    }
    lines.push("")
  })

  if (payload.error) {
    lines.push("error:")
    lines.push(payload.error)
    lines.push("")
  }

  lines.push("final status:")
  lines.push(formatGitStatus(payload.summary))
  gitStatus.textContent = lines.join("\n").trim()
}

async function loadGitStatus() {
  try {
    const payload = await requestJson("/api/git-status")
    renderGitStatus(payload)
    setPushMessage("")
  } catch (error) {
    setPushMessage(error.message, "error")
  }
}

async function loadState() {
  try {
    const payload = await requestJson("/api/state")
    state.entries = payload.entries
    state.today = payload.today
    if (!fields.date.value) {
      fields.date.value = payload.today
    }
    renderRecentEntries(payload.entries)
    setConnection("已连接", "ok")
    updatePreview()
    loadGitStatus()
  } catch (error) {
    setConnection("连接失败", "error")
    setMessage(error.message, "error")
  }
}

async function updatePreview() {
  try {
    const payload = await requestJson("/api/preview", {
      method: "POST",
      body: JSON.stringify(formPayload()),
    })
    preview.textContent = payload.markdown
    const existing = state.entries.find((entry) => entry.date === fields.date.value)
    if (existing) {
      setMessage("这个日期已经有记录；保存时会合并到同一天。")
    } else {
      setMessage("")
    }
  } catch (error) {
    preview.textContent = ""
    setMessage(error.message, "error")
  }
}

function resetForm() {
  form.reset()
  fields.date.value = state.today
  fields.generate.checked = true
  setMode("sleep")
  setMessage("")
  updatePreview()
}

document.querySelectorAll(".mode-tab").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode))
})

form.addEventListener("input", updatePreview)

form.addEventListener("submit", async (event) => {
  event.preventDefault()
  saveButton.disabled = true
  setMessage("正在保存...")
  try {
    const payload = await requestJson("/api/entries", {
      method: "POST",
      body: JSON.stringify(formPayload()),
    })
    preview.textContent = payload.markdown
    setMessage(`已${payload.action === "updated" ? "合并" : "新增"}：${payload.relativePath}；备份：${payload.backupPath}`, "ok")
    await loadState()
  } catch (error) {
    setMessage(error.message, "error")
  } finally {
    saveButton.disabled = false
  }
})

document.querySelector("#reset-button").addEventListener("click", resetForm)
document.querySelector("#refresh-button").addEventListener("click", loadState)
document.querySelector("#git-refresh-button").addEventListener("click", loadGitStatus)
document.querySelector("#copy-button").addEventListener("click", async () => {
  await navigator.clipboard.writeText(preview.textContent)
  setMessage("Markdown 已复制到剪贴板。", "ok")
})

pushButton.addEventListener("click", async () => {
  pushButton.disabled = true
  setPushMessage("正在同步日历、检查、提交并推送...")
  try {
    const payload = await requestJson("/api/push", {
      method: "POST",
      body: JSON.stringify({
        message: commitMessage.value,
        runCheck: runCheck.checked,
      }),
    })
    renderPushResult(payload)
    if (payload.ok) {
      setPushMessage("推送完成。", "ok")
    } else {
      setPushMessage("自动提交或推送失败；上方保留了已完成步骤和当前 Git 状态。", "error")
    }
  } catch (error) {
    setPushMessage(error.message, "error")
    await loadGitStatus()
  } finally {
    pushButton.disabled = false
  }
})

loadState()
