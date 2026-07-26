type QinziInteractionSticker = {
  id: string
  boardKey: string
  boardLabel?: string
  storageKey?: string
  name: string
  src: string
  category?: string
  categoryLabel?: string
  pack?: string
  x: number
  y: number
  size: number
  rotation: number
  owned?: boolean
  status?: string
  createdAt?: string
  updatedAt?: string
}

type QinziInteractionComment = {
  id: string
  date: string
  text: string
  owned?: boolean
  status?: string
  createdAt?: string
  updatedAt?: string
}

type QinziInteractionStickerPage = {
  key: string
  label: string
  status?: string
  sortOrder?: number
  createdAt?: string
  updatedAt?: string
}

type QinziInteractionPlan = {
  id: string
  boardKey: string
  title: string
  scheduledDate?: string
  person?: string
  planStatus: "planned" | "in-progress" | "done"
  notes?: string
  asset?: {
    name: string
    src: string
    category?: string
    categoryLabel?: string
    pack?: string
  } | null
  createdAt?: string
  updatedAt?: string
}

type QinziInteractionAccessOptions = {
  owner?: boolean
  calendar?: boolean
}

type QinziInteractionClient = {
  apiBase: string
  enabled: boolean
  visitorId: () => string
  ownerKey: () => string
  calendarAccess: () => boolean
  setOwnerKey: (value: string) => void
  clearOwnerKey: () => void
  request: <T>(path: string, init?: RequestInit) => Promise<T>
  listStickers: (boardKey: string) => Promise<QinziInteractionSticker[]>
  createSticker: (
    payload: Record<string, unknown>,
    options?: QinziInteractionAccessOptions,
  ) => Promise<QinziInteractionSticker | null>
  updateSticker: (
    id: string,
    payload: Record<string, unknown>,
    options?: QinziInteractionAccessOptions,
  ) => Promise<QinziInteractionSticker | null>
  deleteSticker: (id: string, options?: QinziInteractionAccessOptions) => Promise<void>
  listStickerPages: () => Promise<QinziInteractionStickerPage[]>
  createStickerPage: (
    payload: Record<string, unknown>,
    options?: { owner?: boolean },
  ) => Promise<QinziInteractionStickerPage | null>
  listComments: (params: Record<string, string>) => Promise<QinziInteractionComment[]>
  saveComment: (payload: Record<string, unknown>) => Promise<QinziInteractionComment | null>
  listPlans: (boardKey: string) => Promise<QinziInteractionPlan[]>
  createPlan: (payload: Record<string, unknown>) => Promise<QinziInteractionPlan | null>
  updatePlan: (id: string, payload: Record<string, unknown>) => Promise<QinziInteractionPlan | null>
  deletePlan: (id: string) => Promise<void>
}

const qinziInteractionsWindow = window as Window & {
  QINZI_INTERACTIONS_API_BASE?: string
  QinziInteractions?: QinziInteractionClient
}

const qinziInteractionVisitorKey = "qinzi27-interaction-visitor-id-v1"
const qinziInteractionOwnerKey = "qinzi27-interaction-owner-key-v1"
const qinziInteractionVisitorTokenKey = "qinzi27-interaction-visitor-token-v2"
let qinziCalendarAccessToken = ""

function cleanInteractionApiBase(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
}

function makeVisitorId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function getInteractionVisitorId() {
  try {
    const existing = localStorage.getItem(qinziInteractionVisitorKey)
    if (existing) {
      return existing
    }

    const visitorId = makeVisitorId()
    localStorage.setItem(qinziInteractionVisitorKey, visitorId)
    return visitorId
  } catch {
    return "visitor-local"
  }
}

function getInteractionOwnerKey() {
  try {
    const current = sessionStorage.getItem(qinziInteractionOwnerKey)?.trim() ?? ""
    if (current) {
      return current
    }

    // Migrate the previous persistent owner key once, then keep it scoped to
    // the current browser session so it does not remain on disk indefinitely.
    const legacy = localStorage.getItem(qinziInteractionOwnerKey)?.trim() ?? ""
    if (legacy) {
      sessionStorage.setItem(qinziInteractionOwnerKey, legacy)
      localStorage.removeItem(qinziInteractionOwnerKey)
    }
    return legacy
  } catch {
    return ""
  }
}

function setInteractionOwnerKey(value: string) {
  sessionStorage.setItem(qinziInteractionOwnerKey, value.trim())
  localStorage.removeItem(qinziInteractionOwnerKey)
  document.dispatchEvent(new CustomEvent<{}>("qinzi-owner-access-changed", { detail: {} }))
}

function clearInteractionOwnerKey() {
  sessionStorage.removeItem(qinziInteractionOwnerKey)
  localStorage.removeItem(qinziInteractionOwnerKey)
  document.dispatchEvent(new CustomEvent<{}>("qinzi-owner-access-changed", { detail: {} }))
}

function dispatchCalendarAccessChanged() {
  document.dispatchEvent(new CustomEvent<{}>("qinzi-calendar-access-changed", { detail: {} }))
}

function captureCalendarAccessToken() {
  const marker = document.querySelector<HTMLElement>("[data-calendar-access-token]")
  if (!marker) {
    return false
  }

  const token = marker.getAttribute("data-calendar-access-token")?.trim() ?? ""
  marker.remove()
  if (!token) {
    return false
  }

  const changed = token !== qinziCalendarAccessToken
  qinziCalendarAccessToken = token
  if (changed) {
    dispatchCalendarAccessChanged()
  }
  return true
}

function hasCalendarAccess() {
  captureCalendarAccessToken()
  return Boolean(qinziCalendarAccessToken)
}

function getInteractionVisitorToken() {
  try {
    return localStorage.getItem(qinziInteractionVisitorTokenKey)?.trim() ?? ""
  } catch {
    return ""
  }
}

function setInteractionVisitorToken(value: string) {
  try {
    localStorage.setItem(qinziInteractionVisitorTokenKey, value.trim())
  } catch {
    // A token can still be used for this page load when storage is unavailable.
  }
}

function ownerRequestHeaders(enabled?: boolean) {
  const key = enabled ? getInteractionOwnerKey() : ""
  return key ? { Authorization: `Bearer ${key}` } : undefined
}

function calendarRequestHeaders() {
  captureCalendarAccessToken()
  if (!qinziCalendarAccessToken) {
    throw new Error("Unlock the protected calendar before using shared calendar editing.")
  }
  return { "X-Calendar-Token": qinziCalendarAccessToken }
}

function mergeInteractionHeaders(...groups: Array<Record<string, string> | undefined>) {
  const merged = Object.assign({}, ...groups.filter(Boolean)) as Record<string, string>
  return Object.keys(merged).length > 0 ? merged : undefined
}

const qinziInteractionsApiBase = cleanInteractionApiBase(qinziInteractionsWindow.QINZI_INTERACTIONS_API_BASE)
let qinziVisitorTokenPromise: Promise<string> | null = null

async function qinziInteractionRequest<T>(path: string, init: RequestInit = {}) {
  if (!qinziInteractionsApiBase) {
    throw new Error("Shared interactions API is not configured.")
  }

  const response = await fetch(`${qinziInteractionsApiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }

  if (!response.ok) {
    throw new Error(payload.error || "Shared interactions request failed.")
  }

  return payload as T
}

async function ensureInteractionVisitorToken() {
  const existing = getInteractionVisitorToken()
  if (existing) {
    return existing
  }

  if (!qinziVisitorTokenPromise) {
    qinziVisitorTokenPromise = qinziInteractionRequest<{ token?: string }>("/api/visitor-session", {
      method: "POST",
      body: "{}",
    })
      .then((payload) => {
        const token = String(payload.token ?? "").trim()
        if (!token) {
          throw new Error("Visitor session did not return an edit token.")
        }
        setInteractionVisitorToken(token)
        return token
      })
      .catch((error) => {
        qinziVisitorTokenPromise = null
        throw error
      })
  }

  return qinziVisitorTokenPromise
}

async function visitorRequestHeaders() {
  return { "X-Visitor-Token": await ensureInteractionVisitorToken() }
}

function isOwnerManagedStickerBoard(boardKey: string) {
  return /^\d{4}-\d{2}$/.test(boardKey)
}

qinziInteractionsWindow.QinziInteractions = {
  apiBase: qinziInteractionsApiBase,
  enabled: Boolean(qinziInteractionsApiBase),
  visitorId: getInteractionVisitorId,
  ownerKey: getInteractionOwnerKey,
  calendarAccess: hasCalendarAccess,
  setOwnerKey: setInteractionOwnerKey,
  clearOwnerKey: clearInteractionOwnerKey,
  request: qinziInteractionRequest,
  async listStickers(boardKey: string) {
    const board = encodeURIComponent(boardKey)
    const headers = isOwnerManagedStickerBoard(boardKey) ? calendarRequestHeaders() : await visitorRequestHeaders()
    const payload = await qinziInteractionRequest<{
      stickers: QinziInteractionSticker[]
    }>(`/api/stickers?board=${board}`, { headers })
    return payload.stickers ?? []
  },
  async createSticker(payload: Record<string, unknown>, options) {
    const headers = options?.owner
      ? ownerRequestHeaders(true)
      : options?.calendar
        ? calendarRequestHeaders()
        : mergeInteractionHeaders(await visitorRequestHeaders())
    const response = await qinziInteractionRequest<{
      sticker: QinziInteractionSticker | null
    }>("/api/stickers", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })
    return response.sticker ?? null
  },
  async updateSticker(id: string, payload: Record<string, unknown>, options) {
    const headers = options?.owner
      ? ownerRequestHeaders(true)
      : options?.calendar
        ? calendarRequestHeaders()
        : mergeInteractionHeaders(await visitorRequestHeaders())
    const response = await qinziInteractionRequest<{
      sticker: QinziInteractionSticker | null
    }>(`/api/stickers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    })
    return response.sticker ?? null
  },
  async deleteSticker(id: string, options) {
    const headers = options?.owner
      ? ownerRequestHeaders(true)
      : options?.calendar
        ? calendarRequestHeaders()
        : mergeInteractionHeaders(await visitorRequestHeaders())
    await qinziInteractionRequest(`/api/stickers/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    })
  },
  async listStickerPages() {
    const payload = await qinziInteractionRequest<{
      pages: QinziInteractionStickerPage[]
    }>("/api/sticker-pages")
    return payload.pages ?? []
  },
  async createStickerPage(payload: Record<string, unknown>, options) {
    const response = await qinziInteractionRequest<{
      page: QinziInteractionStickerPage | null
    }>("/api/sticker-pages", {
      method: "POST",
      headers: ownerRequestHeaders(options?.owner),
      body: JSON.stringify(payload),
    })
    return response.page ?? null
  },
  async listComments(params: Record<string, string>) {
    const searchParams = new URLSearchParams(params)
    const payload = await qinziInteractionRequest<{
      comments: QinziInteractionComment[]
    }>(`/api/comments?${searchParams.toString()}`, {
      headers: calendarRequestHeaders(),
    })
    return payload.comments ?? []
  },
  async saveComment(payload: Record<string, unknown>) {
    const response = await qinziInteractionRequest<{
      comment?: QinziInteractionComment | null
      deleted?: boolean
    }>("/api/comments", {
      method: "POST",
      headers: calendarRequestHeaders(),
      body: JSON.stringify(payload),
    })
    return response.comment ?? null
  },
  async listPlans(boardKey: string) {
    const board = encodeURIComponent(boardKey)
    const payload = await qinziInteractionRequest<{
      plans: QinziInteractionPlan[]
    }>(`/api/plans?board=${board}`, {
      headers: calendarRequestHeaders(),
    })
    return payload.plans ?? []
  },
  async createPlan(payload: Record<string, unknown>) {
    const response = await qinziInteractionRequest<{
      plan: QinziInteractionPlan | null
    }>("/api/plans", {
      method: "POST",
      headers: calendarRequestHeaders(),
      body: JSON.stringify(payload),
    })
    return response.plan ?? null
  },
  async updatePlan(id: string, payload: Record<string, unknown>) {
    const response = await qinziInteractionRequest<{
      plan: QinziInteractionPlan | null
    }>(`/api/plans/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: calendarRequestHeaders(),
      body: JSON.stringify(payload),
    })
    return response.plan ?? null
  },
  async deletePlan(id: string) {
    await qinziInteractionRequest(`/api/plans/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: calendarRequestHeaders(),
    })
  },
}

document.addEventListener("render", captureCalendarAccessToken)
const calendarTokenObserver = new MutationObserver(captureCalendarAccessToken)
const observeCalendarTokenMarkers = () => {
  if (!document.body) {
    return
  }
  calendarTokenObserver.observe(document.body, {
    childList: true,
    subtree: true,
  })
  captureCalendarAccessToken()
}
if (document.body) {
  observeCalendarTokenMarkers()
} else {
  document.addEventListener("DOMContentLoaded", observeCalendarTokenMarkers, { once: true })
}
