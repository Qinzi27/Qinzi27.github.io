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
  visitorId?: string
  status?: string
  createdAt?: string
  updatedAt?: string
}

type QinziInteractionComment = {
  id: string
  date: string
  text: string
  visitorId?: string
  status?: string
  createdAt?: string
  updatedAt?: string
}

type QinziInteractionClient = {
  apiBase: string
  enabled: boolean
  visitorId: () => string
  request: <T>(path: string, init?: RequestInit) => Promise<T>
  listStickers: (boardKey: string) => Promise<QinziInteractionSticker[]>
  createSticker: (payload: Record<string, unknown>) => Promise<QinziInteractionSticker | null>
  updateSticker: (id: string, payload: Record<string, unknown>) => Promise<QinziInteractionSticker | null>
  deleteSticker: (id: string) => Promise<void>
  listComments: (params: Record<string, string>) => Promise<QinziInteractionComment[]>
  saveComment: (payload: Record<string, unknown>) => Promise<QinziInteractionComment | null>
}

const qinziInteractionsWindow = window as Window & {
  QINZI_INTERACTIONS_API_BASE?: string
  QinziInteractions?: QinziInteractionClient
}

const qinziInteractionVisitorKey = "qinzi27-interaction-visitor-id-v1"

function cleanInteractionApiBase(value: unknown) {
  return String(value || "").trim().replace(/\/+$/, "")
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

const qinziInteractionsApiBase = cleanInteractionApiBase(qinziInteractionsWindow.QINZI_INTERACTIONS_API_BASE)

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
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }

  if (!response.ok) {
    throw new Error(payload.error || "Shared interactions request failed.")
  }

  return payload as T
}

qinziInteractionsWindow.QinziInteractions = {
  apiBase: qinziInteractionsApiBase,
  enabled: Boolean(qinziInteractionsApiBase),
  visitorId: getInteractionVisitorId,
  request: qinziInteractionRequest,
  async listStickers(boardKey: string) {
    const visitorId = encodeURIComponent(getInteractionVisitorId())
    const board = encodeURIComponent(boardKey)
    const payload = await qinziInteractionRequest<{ stickers: QinziInteractionSticker[] }>(
      `/api/stickers?board=${board}&visitorId=${visitorId}`,
    )
    return payload.stickers ?? []
  },
  async createSticker(payload: Record<string, unknown>) {
    const response = await qinziInteractionRequest<{ sticker: QinziInteractionSticker | null }>("/api/stickers", {
      method: "POST",
      body: JSON.stringify({ ...payload, visitorId: getInteractionVisitorId() }),
    })
    return response.sticker ?? null
  },
  async updateSticker(id: string, payload: Record<string, unknown>) {
    const response = await qinziInteractionRequest<{ sticker: QinziInteractionSticker | null }>(
      `/api/stickers/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ ...payload, visitorId: getInteractionVisitorId() }),
      },
    )
    return response.sticker ?? null
  },
  async deleteSticker(id: string) {
    const visitorId = encodeURIComponent(getInteractionVisitorId())
    await qinziInteractionRequest(`/api/stickers/${encodeURIComponent(id)}?visitorId=${visitorId}`, {
      method: "DELETE",
    })
  },
  async listComments(params: Record<string, string>) {
    const searchParams = new URLSearchParams(params)
    searchParams.set("visitorId", getInteractionVisitorId())
    const payload = await qinziInteractionRequest<{ comments: QinziInteractionComment[] }>(
      `/api/comments?${searchParams.toString()}`,
    )
    return payload.comments ?? []
  },
  async saveComment(payload: Record<string, unknown>) {
    const response = await qinziInteractionRequest<{ comment?: QinziInteractionComment | null; deleted?: boolean }>(
      "/api/comments",
      {
        method: "POST",
        body: JSON.stringify({ ...payload, visitorId: getInteractionVisitorId() }),
      },
    )
    return response.comment ?? null
  },
}
