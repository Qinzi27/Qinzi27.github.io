const state = {
  today: "",
  activeMonth: "",
  activeDate: "",
  entries: [],
  entriesByDate: new Map(),
}

const statusChip = document.querySelector("#calendar-status")
const monthControls = document.querySelector("#month-controls")
const miniCalendar = document.querySelector("#mini-calendar")
const searchInput = document.querySelector("#entry-search")
const searchResults = document.querySelector("#search-results")
const message = document.querySelector("#calendar-message")
const saveButton = document.querySelector("#calendar-save")
const dayTitle = document.querySelector("#day-title")

const fields = {
  date: document.querySelector("#calendar-date"),
  sleep: document.querySelector("#calendar-sleep"),
  title: document.querySelector("#calendar-entry-title"),
  mood: document.querySelector("#calendar-mood"),
  weather: document.querySelector("#calendar-weather"),
  tags: document.querySelector("#calendar-tags"),
  stickers: document.querySelector("#calendar-stickers"),
  whispers: document.querySelector("#calendar-whispers"),
  sentence: document.querySelector("#calendar-sentence"),
  together: document.querySelector("#calendar-together"),
  remember: document.querySelector("#calendar-remember"),
  markdown: document.querySelector("#calendar-markdown"),
  generate: document.querySelector("#calendar-generate"),
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

function setStatus(text, kind = "") {
  statusChip.textContent = text
  statusChip.className = `status-chip${kind ? ` is-${kind}` : ""}`
}

function setMessage(text, kind = "") {
  message.textContent = text
  message.className = `save-message${kind ? ` is-${kind}` : ""}`
}

function pad(value) {
  return String(value).padStart(2, "0")
}

function isoDate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-")
  return `${year}年${Number(month)}月`
}

function normalizeLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
}

function entrySearchText(entry) {
  return [entry.date, entry.title, entry.sleep, entry.attributeLabel, entry.excerpt].filter(Boolean).join(" ").toLowerCase()
}

function entryAttribute(entry) {
  if (!entry) {
    return "empty"
  }
  return entry.attribute || (entry.sleep ? "rest" : "note")
}

function entryAttributeLabel(entry) {
  if (!entry) {
    return "空白"
  }
  return entry.attributeLabel || (entry.sleep ? "休息" : "记录")
}

function entrySleepTime(entry) {
  return entry?.sleepTime || entry?.sleep || ""
}

function entryMetaParts(entry) {
  const attribute = entryAttributeLabel(entry)
  const sleep = entrySleepTime(entry)
  return [
    entry.date,
    sleep ? `${attribute} ${sleep}` : attribute,
    entry.noteCount ? `碎碎念 ${entry.noteCount} 条` : "",
  ].filter(Boolean)
}

function markdownFromFields() {
  const lines = [`## ${fields.date.value}`, ""]
  const meta = [
    ["sleep", fields.sleep.value],
    ["title", fields.title.value],
    ["mood", fields.mood.value],
    ["weather", fields.weather.value],
    ["tags", fields.tags.value],
    ["stickers", fields.stickers.value],
  ]
    .map(([key, value]) => [key, value.trim()])
    .filter(([, value]) => value.length > 0)

  if (meta.length > 0) {
    lines.push(...meta.map(([key, value]) => `${key}: ${value}`), "")
  }

  const whispers = normalizeLines(fields.whispers.value)
  if (whispers.length > 0) {
    lines.push("### 碎碎念", ...whispers.map((line) => `- ${line}`), "")
  }

  for (const [heading, value] of [
    ["今天的一句话", fields.sentence.value],
    ["我们一起", fields.together.value],
    ["想记住", fields.remember.value],
  ]) {
    const text = value.trim()
    if (text.length > 0) {
      lines.push(`### ${heading}`, text, "")
    }
  }

  return `${lines.join("\n").trimEnd()}\n`
}

function fillEntry(entry) {
  fields.date.value = entry.date
  fields.sleep.value = entry.sleep || ""
  fields.title.value = entry.title || ""
  fields.mood.value = entry.mood || ""
  fields.weather.value = entry.weather || ""
  fields.tags.value = entry.tags || ""
  fields.stickers.value = entry.stickers || ""
  fields.whispers.value = entry.whispers || ""
  fields.sentence.value = entry.sentence || ""
  fields.together.value = entry.together || ""
  fields.remember.value = entry.remember || ""
  fields.markdown.value = entry.markdown || markdownFromFields()
  state.activeDate = entry.date
  dayTitle.textContent = `${entry.date} · ${entryAttributeLabel(entry)}`
}

function renderMonthControls(months) {
  monthControls.innerHTML = ""
  months.forEach((month) => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = `month-chip${month === state.activeMonth ? " is-active" : ""}`
    button.textContent = monthLabel(month)
    button.addEventListener("click", () => {
      state.activeMonth = month
      renderMonthControls(months)
      renderCalendar()
    })
    monthControls.append(button)
  })
}

function renderCalendar() {
  miniCalendar.innerHTML = ""
  if (!state.activeMonth) {
    return
  }

  const [year, month] = state.activeMonth.split("-").map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const leading = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"]

  weekdays.forEach((name) => {
    const item = document.createElement("div")
    item.className = "weekday-cell"
    item.textContent = name
    miniCalendar.append(item)
  })

  for (let index = 0; index < leading; index += 1) {
    const empty = document.createElement("span")
    empty.className = "day-cell is-empty"
    miniCalendar.append(empty)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = isoDate(year, month, day)
    const entry = state.entriesByDate.get(date)
    const attribute = entryAttribute(entry)
    const button = document.createElement("button")
    button.type = "button"
    button.className = "day-cell"
    button.dataset.calendarDate = date
    button.dataset.calendarAttribute = attribute
    button.dataset.calendarHasSleep = entrySleepTime(entry) ? "true" : "false"
    if (entrySleepTime(entry)) {
      button.dataset.calendarSleepTime = entrySleepTime(entry)
    }
    button.classList.add(`is-${attribute}-day`)
    if (entry) {
      button.classList.add("has-entry")
    }
    if (date === state.today) {
      button.classList.add("is-today")
    }
    if (date === state.activeDate) {
      button.classList.add("is-selected")
    }

    const dayHead = document.createElement("span")
    dayHead.className = "day-head"
    const dayNumber = document.createElement("strong")
    dayNumber.textContent = String(day)
    dayHead.append(dayNumber)

    if (entry) {
      const chip = document.createElement("span")
      chip.className = "day-attribute-chip"
      chip.textContent = entryAttributeLabel(entry)
      dayHead.append(chip)

      const sleep = entrySleepTime(entry)
      if (sleep) {
        const sleepPill = document.createElement("span")
        sleepPill.className = "day-sleep-pill"
        sleepPill.textContent = sleep
        dayHead.append(sleepPill)
      }
    }

    const title = document.createElement("span")
    title.className = "day-title"
    title.textContent = entry?.title || ""
    const meta = document.createElement("em")
    meta.className = "day-preview"
    meta.textContent = entry?.excerpt || ""

    button.append(dayHead)
    if (entry) {
      button.append(title, meta)
    }
    button.addEventListener("click", () => selectDate(date))
    miniCalendar.append(button)
  }
}

function renderSearchResults() {
  const query = searchInput.value.trim().toLowerCase()
  const entries = query
    ? state.entries.filter((entry) => entrySearchText(entry).includes(query)).slice(0, 18)
    : state.entries.slice(0, 10)

  searchResults.innerHTML = ""
  entries.forEach((entry) => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "search-result"

    const title = document.createElement("strong")
    title.textContent = entry.title || entry.excerpt || entryAttributeLabel(entry)
    const meta = document.createElement("span")
    meta.textContent = entryMetaParts(entry).join(" · ")

    button.append(title, meta)
    button.addEventListener("click", () => selectDate(entry.date))
    searchResults.append(button)
  })
}

async function selectDate(date) {
  try {
    const entry = await requestJson(`/api/calendar-entry?date=${encodeURIComponent(date)}`)
    fillEntry(entry)
    state.activeMonth = date.slice(0, 7)
    renderMonthControls(calendarMonths())
    renderCalendar()
    setMessage("")
  } catch (error) {
    setMessage(error.message, "error")
  }
}

function calendarMonths() {
  const months = new Set([state.today.slice(0, 7), ...state.entries.map((entry) => entry.date.slice(0, 7))])
  return [...months].sort()
}

async function loadCalendar() {
  try {
    const payload = await requestJson("/api/calendar")
    state.today = payload.today
    state.entries = payload.entries
    state.entriesByDate = new Map(payload.entries.map((entry) => [entry.date, entry]))
    state.activeMonth = state.activeMonth || payload.today.slice(0, 7)
    setStatus("已连接", "ok")
    renderMonthControls(payload.months)
    renderCalendar()
    renderSearchResults()
    await selectDate(state.activeDate || payload.today)
  } catch (error) {
    setStatus("连接失败", "error")
    setMessage(error.message, "error")
  }
}

document.querySelector("#calendar-refresh").addEventListener("click", loadCalendar)
document.querySelector("#today-button").addEventListener("click", () => selectDate(state.today))
document.querySelector("#rebuild-markdown").addEventListener("click", () => {
  fields.markdown.value = markdownFromFields()
  setMessage("已从表单重新生成 Markdown。", "ok")
})
searchInput.addEventListener("input", renderSearchResults)
fields.date.addEventListener("change", () => selectDate(fields.date.value))

for (const field of [
  fields.sleep,
  fields.title,
  fields.mood,
  fields.weather,
  fields.tags,
  fields.stickers,
  fields.whispers,
  fields.sentence,
  fields.together,
  fields.remember,
]) {
  field.addEventListener("input", () => {
    fields.markdown.value = markdownFromFields()
  })
}

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true
  setMessage("正在保存这一天...")
  try {
    const payload = await requestJson("/api/calendar-entry", {
      method: "POST",
      body: JSON.stringify({
        date: fields.date.value,
        markdown: fields.markdown.value,
        generate: fields.generate.checked,
      }),
    })
    fillEntry(payload.entry)
    setMessage(`已保存：${payload.relativePath}；备份：${payload.backupPath}`, "ok")
    await loadCalendar()
  } catch (error) {
    setMessage(error.message, "error")
  } finally {
    saveButton.disabled = false
  }
})

loadCalendar()
