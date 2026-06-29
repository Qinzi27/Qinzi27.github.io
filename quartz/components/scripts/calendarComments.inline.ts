type CalendarCommentMap = Record<string, string>

const calendarCommentStorageKey = "qinzi27-calendar-day-comments-v1"

function readCalendarComments(): CalendarCommentMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(calendarCommentStorageKey) ?? "{}") as CalendarCommentMap
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveCalendarComments(comments: CalendarCommentMap) {
  localStorage.setItem(calendarCommentStorageKey, JSON.stringify(comments))
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
  textarea.placeholder = "写给这一天"
  textarea.rows = 7

  const actions = document.createElement("div")
  actions.className = "calendar-comment-actions"

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
  card.append(title, textarea, actions)
  editor.append(backdrop, card)
  return editor
}

function setEditorDate(editor: HTMLElement, date: string, comments: CalendarCommentMap) {
  const title = editor.querySelector<HTMLElement>(".calendar-comment-title")
  const textarea = editor.querySelector<HTMLTextAreaElement>("[data-calendar-comment-text]")
  editor.dataset.calendarCommentDate = date

  if (title) {
    title.textContent = dateLabel(date)
  }

  if (textarea) {
    textarea.value = comments[date] ?? ""
  }
}

function applyCalendarCommentMarkers(root: ParentNode, comments: CalendarCommentMap) {
  root.querySelectorAll<HTMLElement>("[data-calendar-day][data-calendar-date]").forEach((day) => {
    const date = day.dataset.calendarDate ?? ""
    const hasComment = Boolean(comments[date]?.trim())
    const trigger = day.querySelector<HTMLButtonElement>("[data-calendar-comment-open]")

    day.classList.toggle("has-comment", hasComment)

    if (trigger) {
      trigger.setAttribute(
        "aria-label",
        hasComment ? `编辑 ${dateLabel(date)} 的评论，已有评论` : `编辑 ${dateLabel(date)} 的评论`,
      )
    }
  })
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

  const closeEditor = () => {
    editor.hidden = true
  }

  const openEditor = (date: string) => {
    comments = readCalendarComments()
    setEditorDate(editor, date, comments)
    editor.hidden = false
    editor.querySelector<HTMLTextAreaElement>("[data-calendar-comment-text]")?.focus()
  }

  root.addEventListener("click", (event) => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    const openButton = target.closest<HTMLElement>("[data-calendar-comment-open]")
    if (openButton && root.contains(openButton)) {
      event.preventDefault()
      event.stopPropagation()
      const date = openButton.dataset.calendarDate ?? openButton.closest<HTMLElement>("[data-calendar-day]")?.dataset.calendarDate
      if (date) {
        openEditor(date)
      }
      return
    }

    if (target.closest("[data-calendar-comment-close]")) {
      event.preventDefault()
      closeEditor()
      return
    }

    if (target.closest("[data-calendar-comment-save]")) {
      event.preventDefault()
      const date = editor.dataset.calendarCommentDate
      const textarea = editor.querySelector<HTMLTextAreaElement>("[data-calendar-comment-text]")
      if (!date || !textarea) {
        return
      }

      const value = textarea.value.trim()
      comments = readCalendarComments()

      if (value) {
        comments[date] = value
      } else {
        delete comments[date]
      }

      saveCalendarComments(comments)
      applyCalendarCommentMarkers(root, comments)
      closeEditor()
      return
    }

    if (target.closest("[data-calendar-comment-delete]")) {
      event.preventDefault()
      const date = editor.dataset.calendarCommentDate
      if (!date) {
        return
      }

      comments = readCalendarComments()
      delete comments[date]
      saveCalendarComments(comments)
      applyCalendarCommentMarkers(root, comments)
      closeEditor()
    }
  })

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !editor.hidden) {
      closeEditor()
    }
  })

  window.addEventListener("storage", (event) => {
    if (event.key === calendarCommentStorageKey) {
      comments = readCalendarComments()
      applyCalendarCommentMarkers(root, comments)
    }
  })
}

document.addEventListener("nav", initCalendarComments)
new MutationObserver(initCalendarComments).observe(document.body, { childList: true, subtree: true })
initCalendarComments()
