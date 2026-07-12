type CalendarComment = {
  id: string
  date: string
  text: string
  owned?: boolean
  // Local-only legacy field. Remote responses now expose `owned` instead of
  // leaking a visitor identifier.
  visitorId?: string
  status?: string
  createdAt?: string
  updatedAt?: string
}

type CalendarCommentMap = Record<string, CalendarComment[]>

type CalendarInteractionsClient = {
  enabled: boolean
  visitorId: () => string
  calendarAccess: () => boolean
  listComments: (params: Record<string, string>) => Promise<CalendarComment[]>
  saveComment: (payload: Record<string, unknown>) => Promise<CalendarComment | null>
}

const calendarCommentStorageKey = "qinzi27-calendar-day-comments-v1"

function readCalendarComments(): CalendarCommentMap {
  try {
    const current = sessionStorage.getItem(calendarCommentStorageKey)
    const legacy = localStorage.getItem(calendarCommentStorageKey)
    if (!current && legacy) {
      sessionStorage.setItem(calendarCommentStorageKey, legacy)
    }
    if (legacy) {
      localStorage.removeItem(calendarCommentStorageKey)
    }

    const parsed = JSON.parse(current ?? legacy ?? "{}") as Record<string, string | CalendarComment[]>
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([date, value]) => [
        date,
        Array.isArray(value)
          ? value
          : String(value || "").trim()
            ? [
                {
                  id: `local-${date}`,
                  date,
                  text: String(value),
                  visitorId: getCalendarVisitorId() || "local",
                },
              ]
            : [],
      ]),
    )
  } catch {
    return {}
  }
}

function saveCalendarComments(comments: CalendarCommentMap) {
  sessionStorage.setItem(calendarCommentStorageKey, JSON.stringify(comments))
  localStorage.removeItem(calendarCommentStorageKey)
}

function getCalendarInteractionsClient() {
  return (window as Window & { QinziInteractions?: CalendarInteractionsClient }).QinziInteractions
}

function getCalendarVisitorId() {
  return getCalendarInteractionsClient()?.visitorId() ?? "local"
}

function dateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  if (!year || !month || !day) {
    return date
  }

  return `${year}年${month}月${day}日`
}

function makeCommentEditor() {
  const editor = document.createElement("div")
  editor.className = "calendar-comment-editor"
  editor.hidden = true
  editor.setAttribute("role", "presentation")

  const backdrop = document.createElement("button")
  backdrop.type = "button"
  backdrop.className = "calendar-comment-backdrop"
  backdrop.dataset.calendarCommentClose = ""
  backdrop.ariaLabel = "关闭评论编辑"

  const card = document.createElement("section")
  card.className = "calendar-comment-card"
  card.setAttribute("role", "dialog")
  card.setAttribute("aria-modal", "true")

  const title = document.createElement("h3")
  title.className = "calendar-comment-title"
  title.id = "calendar-comment-title"
  card.setAttribute("aria-labelledby", title.id)

  const textarea = document.createElement("textarea")
  textarea.className = "calendar-comment-text"
  textarea.dataset.calendarCommentText = ""
  textarea.placeholder = "写给这一天；输入日历密码并解锁后可共享保存"
  textarea.rows = 7

  const list = document.createElement("div")
  list.className = "calendar-comment-list"
  list.dataset.calendarCommentList = ""

  const actions = document.createElement("div")
  actions.className = "calendar-comment-actions"

  const status = document.createElement("p")
  status.className = "calendar-comment-status"
  status.dataset.calendarCommentStatus = ""
  status.setAttribute("aria-live", "polite")

  const saveButton = document.createElement("button")
  saveButton.type = "button"
  saveButton.dataset.calendarCommentSave = ""
  saveButton.textContent = "保存"

  const deleteButton = document.createElement("button")
  deleteButton.type = "button"
  deleteButton.dataset.calendarCommentDelete = ""
  deleteButton.textContent = "删除"

  const closeButton = document.createElement("button")
  closeButton.type = "button"
  closeButton.dataset.calendarCommentClose = ""
  closeButton.textContent = "关闭"

  actions.append(saveButton, deleteButton, closeButton)
  card.append(title, list, textarea, status, actions)
  editor.append(backdrop, card)
  return editor
}

function setEditorDate(editor: HTMLElement, date: string, comments: CalendarCommentMap) {
  const title = editor.querySelector<HTMLElement>(".calendar-comment-title")
  const list = editor.querySelector<HTMLElement>("[data-calendar-comment-list]")
  const textarea = editor.querySelector<HTMLTextAreaElement>("[data-calendar-comment-text]")
  const dateComments = comments[date] ?? []
  const visitorId = getCalendarVisitorId()
  const ownComment = dateComments.find((comment) => comment.owned === true || comment.visitorId === visitorId)
  editor.dataset.calendarCommentDate = date

  if (title) {
    title.textContent = dateComments.length > 0 ? `${dateLabel(date)} · ${dateComments.length}条` : dateLabel(date)
  }

  if (list) {
    list.innerHTML = ""
    if (dateComments.length === 0) {
      const empty = document.createElement("p")
      empty.className = "calendar-comment-empty"
      empty.textContent = "还没有共享留言。"
      list.append(empty)
    } else {
      dateComments.forEach((comment) => {
        const item = document.createElement("article")
        item.className = "calendar-comment-item"
        const isOwn = comment.owned === true || comment.visitorId === visitorId
        if (isOwn) {
          item.classList.add("is-mine")
        }

        const text = document.createElement("p")
        text.textContent = comment.text

        const meta = document.createElement("span")
        meta.textContent = isOwn ? "我写的" : "共享留言"

        item.append(text, meta)
        list.append(item)
      })
    }
  }

  if (textarea) {
    textarea.value = ownComment?.text ?? ""
  }
}

function applyCalendarCommentMarkers(root: ParentNode, comments: CalendarCommentMap) {
  root.querySelectorAll<HTMLElement>("[data-calendar-day][data-calendar-date]").forEach((day) => {
    const date = day.dataset.calendarDate ?? ""
    const count = comments[date]?.filter((comment) => comment.text.trim()).length ?? 0
    const hasComment = count > 0
    const trigger = day.querySelector<HTMLButtonElement>("[data-calendar-comment-open]")

    day.classList.toggle("has-comment", hasComment)

    if (trigger) {
      trigger.setAttribute(
        "aria-label",
        hasComment ? `编辑 ${dateLabel(date)} 的评论，已有 ${count} 条评论` : `编辑 ${dateLabel(date)} 的评论`,
      )
    }
  })
}

function dateRange(root: ParentNode) {
  const dates = [...root.querySelectorAll<HTMLElement>("[data-calendar-day][data-calendar-date]")]
    .map((day) => day.dataset.calendarDate ?? "")
    .filter(Boolean)
    .sort()

  return {
    from: dates[0] ?? "",
    to: dates[dates.length - 1] ?? "",
  }
}

function groupComments(comments: CalendarComment[]) {
  const grouped: CalendarCommentMap = {}
  comments.forEach((comment) => {
    if (!grouped[comment.date]) {
      grouped[comment.date] = []
    }
    grouped[comment.date].push(comment)
  })
  return grouped
}

async function readRemoteComments(root: ParentNode) {
  const client = getCalendarInteractionsClient()
  if (!client?.enabled) {
    return null
  }

  const range = dateRange(root)
  if (!range.from || !range.to) {
    return null
  }

  const comments = await client.listComments(range)
  return groupComments(comments)
}

function initCalendarComments() {
  const root = document.querySelector<HTMLElement>("[data-sticker-wall]")
  if (!root || root.dataset.calendarCommentsInitialized === "true") {
    return
  }

  if (!root.querySelector("[data-calendar-day][data-calendar-date]")) {
    return
  }

  root.dataset.calendarCommentsInitialized = "true"
  const editor = makeCommentEditor()
  root.append(editor)

  let comments = readCalendarComments()
  applyCalendarCommentMarkers(root, comments)
  void readRemoteComments(root)
    .then((remoteComments) => {
      if (!remoteComments) {
        return
      }
      comments = remoteComments
      saveCalendarComments(comments)
      applyCalendarCommentMarkers(root, comments)
    })
    .catch((error) => console.warn("[CalendarComments] Failed to load shared comments", error))

  let lastTrigger: HTMLElement | null = null

  const setEditorStatus = (message = "", isError = false) => {
    const status = editor.querySelector<HTMLElement>("[data-calendar-comment-status]")
    if (!status) {
      return
    }
    status.textContent = message
    status.classList.toggle("is-error", isError)
  }

  const closeEditor = () => {
    editor.hidden = true
    setEditorStatus()
    lastTrigger?.focus()
    lastTrigger = null
  }

  const openEditor = (date: string, trigger: HTMLElement) => {
    comments = readCalendarComments()
    setEditorDate(editor, date, comments)
    lastTrigger = trigger
    setEditorStatus()
    editor.hidden = false
    editor.querySelector<HTMLTextAreaElement>("[data-calendar-comment-text]")?.focus()
  }

  const refreshComments = async () => {
    const remoteComments = await readRemoteComments(root)
    if (remoteComments) {
      comments = remoteComments
      saveCalendarComments(comments)
    } else {
      comments = readCalendarComments()
    }
    applyCalendarCommentMarkers(root, comments)
  }

  root.addEventListener("click", async (event) => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    const openButton = target.closest<HTMLElement>("[data-calendar-comment-open]")
    if (openButton && root.contains(openButton)) {
      event.preventDefault()
      event.stopPropagation()
      const date =
        openButton.dataset.calendarDate ?? openButton.closest<HTMLElement>("[data-calendar-day]")?.dataset.calendarDate
      if (date) {
        openEditor(date, openButton)
      }
      return
    }

    if (target.closest("[data-calendar-comment-close]")) {
      event.preventDefault()
      closeEditor()
      return
    }

    const saveButton = target.closest<HTMLButtonElement>("[data-calendar-comment-save]")
    if (saveButton) {
      event.preventDefault()
      const date = editor.dataset.calendarCommentDate
      const textarea = editor.querySelector<HTMLTextAreaElement>("[data-calendar-comment-text]")
      if (!date || !textarea) {
        return
      }

      const value = textarea.value.trim()
      const client = getCalendarInteractionsClient()

      if (client?.enabled) {
        saveButton.disabled = true
        setEditorStatus("保存中…")
        try {
          await client.saveComment({ date, text: value })
          await refreshComments()
          closeEditor()
        } catch (error) {
          setEditorStatus("保存失败。请重新输入日历密码解锁页面，再重试。", true)
          console.warn("[CalendarComments] Failed to save shared comment", error)
        } finally {
          saveButton.disabled = false
        }
      } else {
        comments = readCalendarComments()
        if (value) {
          comments[date] = [
            {
              id: `local-${date}`,
              date,
              text: value,
              visitorId: getCalendarVisitorId(),
            },
          ]
        } else {
          delete comments[date]
        }
        saveCalendarComments(comments)
        applyCalendarCommentMarkers(root, comments)
        closeEditor()
      }
      return
    }

    const deleteButton = target.closest<HTMLButtonElement>("[data-calendar-comment-delete]")
    if (deleteButton) {
      event.preventDefault()
      const date = editor.dataset.calendarCommentDate
      if (!date) {
        return
      }

      const client = getCalendarInteractionsClient()
      if (client?.enabled) {
        deleteButton.disabled = true
        setEditorStatus("删除中…")
        try {
          await client.saveComment({ date, text: "" })
          await refreshComments()
          closeEditor()
        } catch (error) {
          setEditorStatus("删除失败。请重新输入日历密码解锁页面，再重试。", true)
          console.warn("[CalendarComments] Failed to delete shared comment", error)
        } finally {
          deleteButton.disabled = false
        }
      } else {
        comments = readCalendarComments()
        delete comments[date]
        saveCalendarComments(comments)
        applyCalendarCommentMarkers(root, comments)
        closeEditor()
      }
    }
  })

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !editor.hidden) {
      closeEditor()
    }
  })

  const handleStorage = (event: StorageEvent) => {
    if (event.key === calendarCommentStorageKey) {
      comments = readCalendarComments()
      applyCalendarCommentMarkers(root, comments)
    }
  }
  const handleOwnerAccessChanged = () => {
    void refreshComments().catch((error) => console.warn("[CalendarComments] Failed to refresh owner comments", error))
  }
  window.addEventListener("storage", handleStorage)
  document.addEventListener("qinzi-owner-access-changed", handleOwnerAccessChanged)
  document.addEventListener("qinzi-calendar-access-changed", handleOwnerAccessChanged)
  window.addCleanup(() => window.removeEventListener("storage", handleStorage))
  window.addCleanup(() => document.removeEventListener("qinzi-owner-access-changed", handleOwnerAccessChanged))
  window.addCleanup(() => document.removeEventListener("qinzi-calendar-access-changed", handleOwnerAccessChanged))
}

document.addEventListener("nav", initCalendarComments)
new MutationObserver(initCalendarComments).observe(document.body, {
  childList: true,
  subtree: true,
})
initCalendarComments()
