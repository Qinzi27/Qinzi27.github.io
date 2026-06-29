type D1Result<T = unknown> = {
  results?: T[]
  meta?: {
    changes?: number
  }
}

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

type D1Database = {
  prepare(query: string): D1PreparedStatement
}

type Env = {
  DB: D1Database
  ADMIN_TOKEN?: string
  ALLOWED_ORIGINS?: string
  PUBLIC_WRITE_STATUS?: string
}

type StickerRow = {
  id: string
  board_key: string
  board_label: string | null
  storage_key: string | null
  asset_name: string
  asset_src: string
  category: string | null
  category_label: string | null
  pack: string | null
  x: number
  y: number
  size: number
  rotation: number
  visitor_id: string
  status: string
  created_at: string
  updated_at: string
}

type CommentRow = {
  id: string
  date: string
  visitor_id: string
  text: string
  status: string
  created_at: string
  updated_at: string
}

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const jsonContentType = "application/json; charset=utf-8"
const maxTextLength = 800
const maxBoardLength = 96
const maxAssetLength = 280
const maxVisitorLength = 80

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("Origin") ?? "*"
  const allowed = (env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (allowed.includes("*") || origin === "*") {
    return "*"
  }

  return allowed.includes(origin) ? origin : allowed[0] ?? "*"
}

function corsHeaders(request: Request, env: Env) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request, env),
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
}

function json(request: Request, env: Env, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": jsonContentType,
      "Cache-Control": "no-store",
    },
  })
}

async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  const contentType = request.headers.get("Content-Type") ?? ""
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.")
  }

  return (await request.json()) as T
}

function cleanText(value: unknown, name: string, maxLength: number, { required = false } = {}) {
  const text = String(value ?? "").trim()
  if (required && !text) {
    throw new HttpError(400, `${name} is required.`)
  }
  if (text.length > maxLength) {
    throw new HttpError(400, `${name} is too long.`)
  }
  return text
}

function cleanNumber(value: unknown, name: string, min: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new HttpError(400, `${name} must be between ${min} and ${max}.`)
  }
  return number
}

function cleanStatus(value: unknown) {
  const status = cleanText(value, "status", 16, { required: true })
  if (!["pending", "approved", "hidden"].includes(status)) {
    throw new HttpError(400, "status must be pending, approved, or hidden.")
  }
  return status
}

function publicWriteStatus(env: Env) {
  return env.PUBLIC_WRITE_STATUS === "pending" ? "pending" : "approved"
}

function cleanDate(value: unknown) {
  const date = cleanText(value, "date", 10, { required: true })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, "date must be YYYY-MM-DD.")
  }
  return date
}

function cleanBoardKey(value: unknown) {
  const key = cleanText(value, "boardKey", maxBoardLength, { required: true })
  if (!/^[\w:.-]+$/.test(key)) {
    throw new HttpError(400, "boardKey contains unsupported characters.")
  }
  return key
}

function cleanVisitorId(value: unknown, { required = true } = {}) {
  const visitorId = cleanText(value, "visitorId", maxVisitorLength, { required })
  if (visitorId && !/^[\w:.-]+$/.test(visitorId)) {
    throw new HttpError(400, "visitorId contains unsupported characters.")
  }
  return visitorId
}

function cleanStickerId(value: unknown) {
  const id = cleanText(value, "id", 96)
  if (id && !/^[\w:.-]+$/.test(id)) {
    throw new HttpError(400, "id contains unsupported characters.")
  }
  return id || crypto.randomUUID()
}

function cleanAssetSrc(value: unknown) {
  const src = cleanText(value, "asset.src", maxAssetLength, { required: true })
  const allowed = src.startsWith("/assets/stickers/") || src.startsWith("/assets/couple-calendar-stickers/")
  if (!allowed) {
    throw new HttpError(400, "Only public site sticker assets can be shared.")
  }
  return src
}

function isAdmin(request: Request, env: Env) {
  const token = env.ADMIN_TOKEN
  if (!token) {
    return false
  }

  const header = request.headers.get("Authorization") ?? ""
  return header.replace(/^Bearer\s+/i, "") === token
}

function requireAdmin(request: Request, env: Env) {
  if (!isAdmin(request, env)) {
    throw new HttpError(401, "Admin token is required.")
  }
}

function mapSticker(row: StickerRow) {
  return {
    id: row.id,
    boardKey: row.board_key,
    boardLabel: row.board_label ?? "",
    storageKey: row.storage_key ?? "",
    name: row.asset_name,
    src: row.asset_src,
    category: row.category ?? "",
    categoryLabel: row.category_label ?? "",
    pack: row.pack ?? "",
    x: row.x,
    y: row.y,
    size: row.size,
    rotation: row.rotation,
    visitorId: row.visitor_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapComment(row: CommentRow) {
  return {
    id: row.id,
    date: row.date,
    text: row.text,
    visitorId: row.visitor_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function listStickers(request: Request, env: Env, url: URL) {
  const boardKey = cleanBoardKey(url.searchParams.get("board"))
  const visitorId = cleanVisitorId(url.searchParams.get("visitorId"), { required: false })
  const rows = await env.DB.prepare(
    `
      SELECT *
      FROM stickers
      WHERE board_key = ?
        AND (status = 'approved' OR (? <> '' AND visitor_id = ? AND status <> 'hidden'))
      ORDER BY created_at ASC
      LIMIT 500
    `,
  )
    .bind(boardKey, visitorId, visitorId)
    .all<StickerRow>()

  return json(request, env, 200, { stickers: (rows.results ?? []).map(mapSticker) })
}

async function createSticker(request: Request, env: Env) {
  const payload = await readJson<Record<string, unknown>>(request)
  const asset = (payload.asset && typeof payload.asset === "object" ? payload.asset : {}) as Record<string, unknown>
  const id = cleanStickerId(payload.id)
  const boardKey = cleanBoardKey(payload.boardKey)
  const visitorId = cleanVisitorId(payload.visitorId)
  const status = publicWriteStatus(env)

  await env.DB.prepare(
    `
      INSERT INTO stickers (
        id, board_key, board_label, storage_key, asset_name, asset_src,
        category, category_label, pack, x, y, size, rotation, visitor_id, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      id,
      boardKey,
      cleanText(payload.boardLabel, "boardLabel", maxBoardLength),
      cleanText(payload.storageKey, "storageKey", maxBoardLength),
      cleanText(asset.name, "asset.name", 140, { required: true }),
      cleanAssetSrc(asset.src),
      cleanText(asset.category, "asset.category", 96),
      cleanText(asset.categoryLabel, "asset.categoryLabel", 140),
      cleanText(asset.pack, "asset.pack", 140),
      cleanNumber(payload.x, "x", 0, 100),
      cleanNumber(payload.y, "y", 0, 100),
      cleanNumber(payload.size, "size", 32, 180),
      cleanNumber(payload.rotation, "rotation", -45, 45),
      visitorId,
      status,
    )
    .run()

  const row = await env.DB.prepare("SELECT * FROM stickers WHERE id = ?").bind(id).first<StickerRow>()
  return json(request, env, 201, { sticker: row ? mapSticker(row) : null })
}

async function updateSticker(request: Request, env: Env, id: string) {
  const payload = await readJson<Record<string, unknown>>(request)
  const admin = isAdmin(request, env)
  const visitorId = cleanVisitorId(payload.visitorId, { required: !admin })

  const result = await env.DB.prepare(
    `
      UPDATE stickers
      SET x = ?, y = ?, size = ?, rotation = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND (visitor_id = ? OR ? = 1)
    `,
  )
    .bind(
      cleanNumber(payload.x, "x", 0, 100),
      cleanNumber(payload.y, "y", 0, 100),
      cleanNumber(payload.size, "size", 32, 180),
      cleanNumber(payload.rotation, "rotation", -45, 45),
      id,
      visitorId,
      admin ? 1 : 0,
    )
    .run()

  if ((result.meta?.changes ?? 0) === 0) {
    throw new HttpError(404, "Sticker was not found or cannot be edited by this visitor.")
  }

  const row = await env.DB.prepare("SELECT * FROM stickers WHERE id = ?").bind(id).first<StickerRow>()
  return json(request, env, 200, { sticker: row ? mapSticker(row) : null })
}

async function deleteSticker(request: Request, env: Env, id: string, url: URL) {
  const admin = isAdmin(request, env)
  const visitorId = cleanVisitorId(url.searchParams.get("visitorId"), { required: !admin })
  const result = await env.DB.prepare("DELETE FROM stickers WHERE id = ? AND (visitor_id = ? OR ? = 1)")
    .bind(id, visitorId, admin ? 1 : 0)
    .run()

  if ((result.meta?.changes ?? 0) === 0) {
    throw new HttpError(404, "Sticker was not found or cannot be deleted by this visitor.")
  }

  return json(request, env, 200, { ok: true })
}

async function listComments(request: Request, env: Env, url: URL) {
  const visitorId = cleanVisitorId(url.searchParams.get("visitorId"), { required: false })
  const date = url.searchParams.get("date")
  const month = url.searchParams.get("month")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")

  let where = "status = 'approved' OR (? <> '' AND visitor_id = ? AND status <> 'hidden')"
  const values: unknown[] = [visitorId, visitorId]

  if (date) {
    where = `date = ? AND (${where})`
    values.unshift(cleanDate(date))
  } else if (month) {
    const monthText = cleanText(month, "month", 7, { required: true })
    if (!/^\d{4}-\d{2}$/.test(monthText)) {
      throw new HttpError(400, "month must be YYYY-MM.")
    }
    where = `date LIKE ? AND (${where})`
    values.unshift(`${monthText}-%`)
  } else if (from || to) {
    const fromDate = cleanDate(from)
    const toDate = cleanDate(to)
    where = `date >= ? AND date <= ? AND (${where})`
    values.unshift(fromDate, toDate)
  }

  const rows = await env.DB.prepare(
    `
      SELECT *
      FROM comments
      WHERE ${where}
      ORDER BY date ASC, created_at ASC
      LIMIT 500
    `,
  )
    .bind(...values)
    .all<CommentRow>()

  return json(request, env, 200, { comments: (rows.results ?? []).map(mapComment) })
}

async function saveComment(request: Request, env: Env) {
  const payload = await readJson<Record<string, unknown>>(request)
  const date = cleanDate(payload.date)
  const visitorId = cleanVisitorId(payload.visitorId)
  const text = cleanText(payload.text, "text", maxTextLength)

  if (!text) {
    await env.DB.prepare("DELETE FROM comments WHERE date = ? AND visitor_id = ?").bind(date, visitorId).run()
    return json(request, env, 200, { deleted: true })
  }

  const status = publicWriteStatus(env)
  await env.DB.prepare(
    `
      INSERT INTO comments (id, date, visitor_id, text, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(date, visitor_id) DO UPDATE SET
        text = excluded.text,
        status = CASE WHEN comments.status = 'hidden' THEN excluded.status ELSE comments.status END,
        updated_at = CURRENT_TIMESTAMP
    `,
  )
    .bind(crypto.randomUUID(), date, visitorId, text, status)
    .run()

  const row = await env.DB.prepare("SELECT * FROM comments WHERE date = ? AND visitor_id = ?")
    .bind(date, visitorId)
    .first<CommentRow>()
  return json(request, env, 200, { comment: row ? mapComment(row) : null })
}

async function listAdminItems(request: Request, env: Env, url: URL) {
  requireAdmin(request, env)
  const status = cleanStatus(url.searchParams.get("status") ?? "pending")
  const [stickers, comments] = await Promise.all([
    env.DB.prepare("SELECT * FROM stickers WHERE status = ? ORDER BY created_at DESC LIMIT 200")
      .bind(status)
      .all<StickerRow>(),
    env.DB.prepare("SELECT * FROM comments WHERE status = ? ORDER BY created_at DESC LIMIT 200")
      .bind(status)
      .all<CommentRow>(),
  ])

  return json(request, env, 200, {
    stickers: (stickers.results ?? []).map(mapSticker),
    comments: (comments.results ?? []).map(mapComment),
  })
}

async function setAdminStatus(request: Request, env: Env, kind: "stickers" | "comments", id: string) {
  requireAdmin(request, env)
  const payload = await readJson<Record<string, unknown>>(request)
  const status = cleanStatus(payload.status)
  const result = await env.DB.prepare(`UPDATE ${kind} SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(status, id)
    .run()

  if ((result.meta?.changes ?? 0) === 0) {
    throw new HttpError(404, "Item was not found.")
  }

  return json(request, env, 200, { ok: true })
}

async function deleteAdminItem(request: Request, env: Env, kind: "stickers" | "comments", id: string) {
  requireAdmin(request, env)
  const result = await env.DB.prepare(`DELETE FROM ${kind} WHERE id = ?`).bind(id).run()
  if ((result.meta?.changes ?? 0) === 0) {
    throw new HttpError(404, "Item was not found.")
  }
  return json(request, env, 200, { ok: true })
}

async function handleRequest(request: Request, env: Env) {
  const url = new URL(request.url)
  const { pathname } = url

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) })
  }

  if (request.method === "GET" && pathname === "/health") {
    return json(request, env, 200, { ok: true })
  }

  if (pathname === "/api/stickers") {
    if (request.method === "GET") {
      return listStickers(request, env, url)
    }
    if (request.method === "POST") {
      return createSticker(request, env)
    }
  }

  const stickerMatch = pathname.match(/^\/api\/stickers\/([^/]+)$/)
  if (stickerMatch) {
    const id = decodeURIComponent(stickerMatch[1])
    if (request.method === "PATCH") {
      return updateSticker(request, env, id)
    }
    if (request.method === "DELETE") {
      return deleteSticker(request, env, id, url)
    }
  }

  if (pathname === "/api/comments") {
    if (request.method === "GET") {
      return listComments(request, env, url)
    }
    if (request.method === "POST") {
      return saveComment(request, env)
    }
  }

  if (request.method === "GET" && pathname === "/api/admin/items") {
    return listAdminItems(request, env, url)
  }

  const adminMatch = pathname.match(/^\/api\/admin\/(stickers|comments)\/([^/]+)$/)
  if (adminMatch) {
    const kind = adminMatch[1] as "stickers" | "comments"
    const id = decodeURIComponent(adminMatch[2])
    if (request.method === "PATCH") {
      return setAdminStatus(request, env, kind, id)
    }
    if (request.method === "DELETE") {
      return deleteAdminItem(request, env, kind, id)
    }
  }

  throw new HttpError(404, "Route not found.")
}

export default {
  async fetch(request: Request, env: Env) {
    try {
      return await handleRequest(request, env)
    } catch (error) {
      if (error instanceof HttpError) {
        return json(request, env, error.status, { error: error.message })
      }

      return json(request, env, 500, { error: error instanceof Error ? error.message : "Unknown error." })
    }
  },
}
