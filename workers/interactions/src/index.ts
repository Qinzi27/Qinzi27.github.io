export type D1Result<T = unknown> = {
  results?: T[]
  meta?: {
    changes?: number
  }
}

export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

export type D1Database = {
  prepare(query: string): D1PreparedStatement
}

type CloudflareSubtleCrypto = SubtleCrypto & {
  timingSafeEqual(left: ArrayBuffer | ArrayBufferView, right: ArrayBuffer | ArrayBufferView): boolean
}

export type Env = {
  DB: D1Database
  ADMIN_TOKEN?: string
  VISITOR_SIGNING_SECRET?: string
  CALENDAR_ACCESS_TOKEN?: string
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

type StickerPageRow = {
  key: string
  label: string
  status: string
  sort_order: number
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

type CouplePlanRow = {
  id: string
  board_key: string
  title: string
  scheduled_date: string
  person: string
  plan_status: string
  notes: string
  asset_name: string
  asset_src: string
  asset_category: string
  asset_category_label: string
  asset_pack: string
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
const maxStickerPageLabelLength = 80
const maxStickerPageKeyLength = 64
const maxPlanTitleLength = 120
const maxPlanPersonLength = 40
const maxPlanNotesLength = 2000
const adminVisitorId = "admin"
const calendarEditorVisitorId = "calendar-editor"
const visitorTokenVersion = "v1"
const visitorTokenMaxLength = 160
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const textEncoder = new TextEncoder()

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("Origin") ?? "*"
  const allowed = (env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (allowed.includes("*") || origin === "*") {
    return "*"
  }

  return allowed.includes(origin) ? origin : (allowed[0] ?? "*")
}

function corsHeaders(request: Request, env: Env) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request, env),
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Visitor-Token,X-Calendar-Token",
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

function isOwnerManagedStickerBoard(boardKey: string) {
  return /^\d{4}-\d{2}$/.test(boardKey)
}

function cleanDate(value: unknown) {
  const date = cleanText(value, "date", 10, { required: true })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, "date must be YYYY-MM-DD.")
  }
  return date
}

function cleanOptionalDate(value: unknown) {
  const date = cleanText(value, "scheduledDate", 10)
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, "scheduledDate must be empty or YYYY-MM-DD.")
  }
  return date
}

function cleanPlanStatus(value: unknown) {
  const status = cleanText(value, "status", 16, { required: true })
  if (!["planned", "in-progress", "done"].includes(status)) {
    throw new HttpError(400, "status must be planned, in-progress, or done.")
  }
  return status
}

function cleanBoardKey(value: unknown) {
  const key = cleanText(value, "boardKey", maxBoardLength, { required: true })
  if (!/^[\w:.-]+$/.test(key)) {
    throw new HttpError(400, "boardKey contains unsupported characters.")
  }
  return key
}

function cleanStickerPageKey(value: unknown, { required = false } = {}) {
  const key = cleanText(value, "key", maxStickerPageKeyLength, { required })
  if (key && !/^[\w.-]+$/.test(key)) {
    throw new HttpError(400, "key contains unsupported characters.")
  }
  if (key === "default") {
    throw new HttpError(400, "default is reserved for the main sticker wall.")
  }
  return key
}

function makeStickerPageKey(label: string) {
  const slug = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)

  return `${slug || "wall"}-${crypto.randomUUID().slice(0, 8)}`
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

function cleanPlanAsset(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      name: "",
      src: "",
      category: "",
      categoryLabel: "",
      pack: "",
    }
  }

  const asset = value as Record<string, unknown>
  const src = cleanText(asset.src, "asset.src", maxAssetLength)
  if (!src) {
    return {
      name: "",
      src: "",
      category: "",
      categoryLabel: "",
      pack: "",
    }
  }

  return {
    name: cleanText(asset.name, "asset.name", 140, { required: true }),
    src: cleanAssetSrc(src),
    category: cleanText(asset.category, "asset.category", 96),
    categoryLabel: cleanText(asset.categoryLabel, "asset.categoryLabel", 140),
    pack: cleanText(asset.pack, "asset.pack", 140),
  }
}

function visitorSigningSecret(env: Env) {
  const secret = env.VISITOR_SIGNING_SECRET || env.ADMIN_TOKEN
  if (!secret) {
    throw new HttpError(503, "Visitor sessions are not configured.")
  }
  return secret
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null
  }

  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

async function visitorHmacKey(env: Env) {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(visitorSigningSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

async function signVisitorId(visitorId: string, env: Env) {
  const message = `${visitorTokenVersion}.${visitorId}`
  const signature = await crypto.subtle.sign("HMAC", await visitorHmacKey(env), textEncoder.encode(message))
  return `${message}.${encodeBase64Url(new Uint8Array(signature))}`
}

async function verifyVisitorToken(token: string, env: Env) {
  if (token.length > visitorTokenMaxLength) {
    return null
  }

  const [version, visitorId, encodedSignature, ...extra] = token.split(".")
  if (version !== visitorTokenVersion || !uuidPattern.test(visitorId ?? "") || !encodedSignature || extra.length > 0) {
    return null
  }

  const signature = decodeBase64Url(encodedSignature)
  if (!signature || signature.byteLength !== 32) {
    return null
  }

  const message = `${version}.${visitorId}`
  const valid = await crypto.subtle.verify("HMAC", await visitorHmacKey(env), signature, textEncoder.encode(message))
  return valid ? visitorId : null
}

async function requestVisitorId(request: Request, env: Env, { required = false } = {}) {
  const token = request.headers.get("X-Visitor-Token")?.trim() ?? ""
  if (!token) {
    if (required) {
      throw new HttpError(401, "Visitor token is required.")
    }
    return null
  }

  const visitorId = await verifyVisitorToken(token, env)
  if (!visitorId) {
    throw new HttpError(401, "Visitor token is invalid.")
  }
  return visitorId
}

async function timingSafeTextEqual(left: string, right: string) {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(left)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(right)),
  ])
  const subtle = crypto.subtle as CloudflareSubtleCrypto
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(leftDigest, rightDigest)
  }

  // Node's Web Crypto test runtime does not yet expose Cloudflare's extension.
  // Both inputs are fixed-length SHA-256 digests, so this fallback cannot leak
  // their original lengths and keeps local regression tests representative.
  const leftBytes = new Uint8Array(leftDigest)
  const rightBytes = new Uint8Array(rightDigest)
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index]
  }
  return difference === 0
}

async function isAdmin(request: Request, env: Env) {
  if (!env.ADMIN_TOKEN) {
    return false
  }

  const match = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)
  return match ? timingSafeTextEqual(match[1], env.ADMIN_TOKEN) : false
}

async function requireAdmin(request: Request, env: Env) {
  if (!(await isAdmin(request, env))) {
    throw new HttpError(401, "Admin token is required.")
  }
}

async function isCalendarEditor(request: Request, env: Env) {
  const expected = env.CALENDAR_ACCESS_TOKEN
  const provided = request.headers.get("X-Calendar-Token")?.trim() ?? ""
  if (!expected || !provided || provided.length > 512) {
    return false
  }
  return timingSafeTextEqual(provided, expected)
}

async function requireCalendarAccess(request: Request, env: Env) {
  if (await isAdmin(request, env)) {
    return
  }
  if (!env.CALENDAR_ACCESS_TOKEN) {
    throw new HttpError(503, "Calendar editing is not configured.")
  }
  if (!(await isCalendarEditor(request, env))) {
    throw new HttpError(401, "Calendar access token is required.")
  }
}

function mapSticker(
  row: StickerRow,
  viewerVisitorId: string | null,
  includeVisitorId = false,
  calendarEditable = false,
) {
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
    owned: calendarEditable || (viewerVisitorId !== null && row.visitor_id === viewerVisitorId),
    ...(includeVisitorId ? { visitorId: row.visitor_id } : {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapStickerPage(row: StickerPageRow) {
  return {
    key: row.key,
    label: row.label,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapComment(row: CommentRow, includeVisitorId = false) {
  return {
    id: row.id,
    date: row.date,
    text: row.text,
    owned: true,
    ...(includeVisitorId ? { visitorId: row.visitor_id } : {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCouplePlan(row: CouplePlanRow) {
  return {
    id: row.id,
    boardKey: row.board_key,
    title: row.title,
    scheduledDate: row.scheduled_date,
    person: row.person,
    planStatus: row.plan_status,
    notes: row.notes,
    asset: row.asset_src
      ? {
          name: row.asset_name,
          src: row.asset_src,
          category: row.asset_category,
          categoryLabel: row.asset_category_label,
          pack: row.asset_pack,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function listStickers(request: Request, env: Env, url: URL) {
  const boardKey = cleanBoardKey(url.searchParams.get("board"))
  const calendarBoard = isOwnerManagedStickerBoard(boardKey)
  const admin = await isAdmin(request, env)
  if (calendarBoard) {
    await requireCalendarAccess(request, env)
  }

  // Ownership comes only from the signed header; body/query visitorId values are intentionally ignored.
  const signedVisitorId = calendarBoard ? null : await requestVisitorId(request, env)
  const viewerVisitorId = calendarBoard
    ? calendarEditorVisitorId
    : (signedVisitorId ?? (admin ? adminVisitorId : null))
  const visibilityVisitorId = viewerVisitorId ?? ""
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
    .bind(boardKey, visibilityVisitorId, visibilityVisitorId)
    .all<StickerRow>()

  return json(request, env, 200, {
    stickers: (rows.results ?? []).map((row) => mapSticker(row, viewerVisitorId, false, calendarBoard)),
  })
}

async function listStickerPages(request: Request, env: Env) {
  const rows = await env.DB.prepare(
    `
      SELECT *
      FROM sticker_pages
      WHERE status = 'active'
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 100
    `,
  ).all<StickerPageRow>()

  return json(request, env, 200, {
    pages: (rows.results ?? []).map(mapStickerPage),
  })
}

async function createStickerPage(request: Request, env: Env) {
  await requireAdmin(request, env)
  const payload = await readJson<Record<string, unknown>>(request)
  const label = cleanText(payload.label, "label", maxStickerPageLabelLength, {
    required: true,
  })
  const key = cleanStickerPageKey(payload.key) || makeStickerPageKey(label)
  const orderRow = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM sticker_pages",
  ).first<{ next_order: number }>()

  await env.DB.prepare(
    `
      INSERT INTO sticker_pages (key, label, sort_order)
      VALUES (?, ?, ?)
    `,
  )
    .bind(key, label, Number(orderRow?.next_order ?? 1))
    .run()

  const row = await env.DB.prepare("SELECT * FROM sticker_pages WHERE key = ?").bind(key).first<StickerPageRow>()
  return json(request, env, 201, { page: row ? mapStickerPage(row) : null })
}

async function createVisitorSession(request: Request, env: Env) {
  const visitorId = crypto.randomUUID()
  const token = await signVisitorId(visitorId, env)
  return json(request, env, 201, { token })
}

async function createSticker(request: Request, env: Env) {
  const payload = await readJson<Record<string, unknown>>(request)
  const asset = (payload.asset && typeof payload.asset === "object" ? payload.asset : {}) as Record<string, unknown>
  const id = cleanStickerId(payload.id)
  const boardKey = cleanBoardKey(payload.boardKey)
  const calendarBoard = isOwnerManagedStickerBoard(boardKey)
  const admin = await isAdmin(request, env)
  if (calendarBoard) {
    await requireCalendarAccess(request, env)
  }

  // Admin writes keep the legacy NOT NULL column populated without requiring a visitor session.
  const signedVisitorId = calendarBoard
    ? null
    : await requestVisitorId(request, env, {
        required: !admin,
      })
  const visitorId = calendarBoard ? calendarEditorVisitorId : (signedVisitorId ?? adminVisitorId)
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
  return json(request, env, 201, {
    sticker: row ? mapSticker(row, visitorId, false, calendarBoard) : null,
  })
}

async function updateSticker(request: Request, env: Env, id: string) {
  const existing = await env.DB.prepare("SELECT * FROM stickers WHERE id = ?").bind(id).first<StickerRow>()

  if (!existing) {
    throw new HttpError(404, "Sticker was not found or cannot be edited by this visitor.")
  }

  const admin = await isAdmin(request, env)
  const calendarBoard = isOwnerManagedStickerBoard(existing.board_key)
  if (calendarBoard) {
    await requireCalendarAccess(request, env)
  }

  const signedVisitorId = calendarBoard
    ? null
    : await requestVisitorId(request, env, {
        required: !admin,
      })
  if (!calendarBoard && !admin && existing.visitor_id !== signedVisitorId) {
    throw new HttpError(404, "Sticker was not found or cannot be edited by this visitor.")
  }

  const payload = await readJson<Record<string, unknown>>(request)
  const result = await env.DB.prepare(
    `
      UPDATE stickers
      SET x = ?, y = ?, size = ?, rotation = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
  )
    .bind(
      cleanNumber(payload.x, "x", 0, 100),
      cleanNumber(payload.y, "y", 0, 100),
      cleanNumber(payload.size, "size", 32, 180),
      cleanNumber(payload.rotation, "rotation", -45, 45),
      id,
    )
    .run()

  if ((result.meta?.changes ?? 0) === 0) {
    throw new HttpError(404, "Sticker was not found or cannot be edited by this visitor.")
  }

  const row = await env.DB.prepare("SELECT * FROM stickers WHERE id = ?").bind(id).first<StickerRow>()
  const viewerVisitorId = calendarBoard
    ? calendarEditorVisitorId
    : (signedVisitorId ?? (admin ? adminVisitorId : null))
  return json(request, env, 200, {
    sticker: row ? mapSticker(row, viewerVisitorId, false, calendarBoard) : null,
  })
}

async function deleteSticker(request: Request, env: Env, id: string) {
  const existing = await env.DB.prepare("SELECT * FROM stickers WHERE id = ?").bind(id).first<StickerRow>()

  if (!existing) {
    throw new HttpError(404, "Sticker was not found or cannot be deleted by this visitor.")
  }

  const admin = await isAdmin(request, env)
  const calendarBoard = isOwnerManagedStickerBoard(existing.board_key)
  if (calendarBoard) {
    await requireCalendarAccess(request, env)
  }

  const signedVisitorId = calendarBoard
    ? null
    : await requestVisitorId(request, env, {
        required: !admin,
      })
  if (!calendarBoard && !admin && existing.visitor_id !== signedVisitorId) {
    throw new HttpError(404, "Sticker was not found or cannot be deleted by this visitor.")
  }

  const result = await env.DB.prepare("DELETE FROM stickers WHERE id = ?").bind(id).run()

  if ((result.meta?.changes ?? 0) === 0) {
    throw new HttpError(404, "Sticker was not found or cannot be deleted by this visitor.")
  }

  return json(request, env, 200, { ok: true })
}

async function listComments(request: Request, env: Env, url: URL) {
  await requireCalendarAccess(request, env)
  const date = url.searchParams.get("date")
  const month = url.searchParams.get("month")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")

  const hasRange = from !== null || to !== null
  const filterCount = Number(date !== null) + Number(month !== null) + Number(hasRange)
  if (filterCount !== 1 || (hasRange && (!from || !to))) {
    throw new HttpError(400, "Provide date, month, or a complete from and to range.")
  }

  let where: string
  let values: unknown[]
  if (date) {
    where = "date = ?"
    values = [cleanDate(date)]
  } else if (month) {
    const monthText = cleanText(month, "month", 7, { required: true })
    if (!/^\d{4}-\d{2}$/.test(monthText)) {
      throw new HttpError(400, "month must be YYYY-MM.")
    }
    where = "date LIKE ?"
    values = [`${monthText}-%`]
  } else {
    const fromDate = cleanDate(from)
    const toDate = cleanDate(to)
    if (fromDate > toDate) {
      throw new HttpError(400, "from must not be after to.")
    }
    where = "date >= ? AND date <= ?"
    values = [fromDate, toDate]
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

  return json(request, env, 200, {
    comments: (rows.results ?? []).map((row) => mapComment(row)),
  })
}

async function saveComment(request: Request, env: Env) {
  await requireCalendarAccess(request, env)
  const payload = await readJson<Record<string, unknown>>(request)
  const date = cleanDate(payload.date)
  // Both password holders edit the same shared note, while the credential still
  // has no access to moderation or sticker-page administration.
  const visitorId = calendarEditorVisitorId
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

function cleanCouplePlanPayload(payload: Record<string, unknown>) {
  return {
    title: cleanText(payload.title, "title", maxPlanTitleLength, {
      required: true,
    }),
    scheduledDate: cleanOptionalDate(payload.scheduledDate),
    person: cleanText(payload.person, "person", maxPlanPersonLength),
    planStatus: cleanPlanStatus(payload.status),
    notes: cleanText(payload.notes, "notes", maxPlanNotesLength),
    asset: cleanPlanAsset(payload.asset),
  }
}

async function listCouplePlans(request: Request, env: Env, url: URL) {
  await requireCalendarAccess(request, env)
  const boardKey = cleanBoardKey(url.searchParams.get("board"))
  const rows = await env.DB.prepare(
    `
      SELECT *
      FROM couple_plans
      WHERE board_key = ?
      ORDER BY
        CASE WHEN plan_status = 'done' THEN 1 ELSE 0 END ASC,
        CASE WHEN scheduled_date = '' THEN 1 ELSE 0 END ASC,
        scheduled_date ASC,
        created_at ASC
      LIMIT 500
    `,
  )
    .bind(boardKey)
    .all<CouplePlanRow>()

  return json(request, env, 200, {
    plans: (rows.results ?? []).map(mapCouplePlan),
  })
}

async function createCouplePlan(request: Request, env: Env) {
  await requireCalendarAccess(request, env)
  const payload = await readJson<Record<string, unknown>>(request)
  const boardKey = cleanBoardKey(payload.boardKey)
  const plan = cleanCouplePlanPayload(payload)
  const id = crypto.randomUUID()

  await env.DB.prepare(
    `
      INSERT INTO couple_plans (
        id, board_key, title, scheduled_date, person, plan_status, notes,
        asset_name, asset_src, asset_category, asset_category_label, asset_pack
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      id,
      boardKey,
      plan.title,
      plan.scheduledDate,
      plan.person,
      plan.planStatus,
      plan.notes,
      plan.asset.name,
      plan.asset.src,
      plan.asset.category,
      plan.asset.categoryLabel,
      plan.asset.pack,
    )
    .run()

  const row = await env.DB.prepare("SELECT * FROM couple_plans WHERE id = ?")
    .bind(id)
    .first<CouplePlanRow>()
  return json(request, env, 201, { plan: row ? mapCouplePlan(row) : null })
}

async function updateCouplePlan(request: Request, env: Env, id: string) {
  await requireCalendarAccess(request, env)
  const existing = await env.DB.prepare("SELECT * FROM couple_plans WHERE id = ?")
    .bind(id)
    .first<CouplePlanRow>()
  if (!existing) {
    throw new HttpError(404, "Plan was not found.")
  }

  const payload = await readJson<Record<string, unknown>>(request)
  const plan = cleanCouplePlanPayload(payload)
  const result = await env.DB.prepare(
    `
      UPDATE couple_plans
      SET
        title = ?,
        scheduled_date = ?,
        person = ?,
        plan_status = ?,
        notes = ?,
        asset_name = ?,
        asset_src = ?,
        asset_category = ?,
        asset_category_label = ?,
        asset_pack = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
  )
    .bind(
      plan.title,
      plan.scheduledDate,
      plan.person,
      plan.planStatus,
      plan.notes,
      plan.asset.name,
      plan.asset.src,
      plan.asset.category,
      plan.asset.categoryLabel,
      plan.asset.pack,
      id,
    )
    .run()

  if ((result.meta?.changes ?? 0) === 0) {
    throw new HttpError(404, "Plan was not found.")
  }

  const row = await env.DB.prepare("SELECT * FROM couple_plans WHERE id = ?")
    .bind(id)
    .first<CouplePlanRow>()
  return json(request, env, 200, { plan: row ? mapCouplePlan(row) : null })
}

async function deleteCouplePlan(request: Request, env: Env, id: string) {
  await requireCalendarAccess(request, env)
  const result = await env.DB.prepare("DELETE FROM couple_plans WHERE id = ?").bind(id).run()
  if ((result.meta?.changes ?? 0) === 0) {
    throw new HttpError(404, "Plan was not found.")
  }
  return json(request, env, 200, { ok: true })
}

async function listAdminItems(request: Request, env: Env, url: URL) {
  await requireAdmin(request, env)
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
    stickers: (stickers.results ?? []).map((row) => mapSticker(row, null, true)),
    comments: (comments.results ?? []).map((row) => mapComment(row, true)),
  })
}

async function setAdminStatus(request: Request, env: Env, kind: "stickers" | "comments", id: string) {
  await requireAdmin(request, env)
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
  await requireAdmin(request, env)
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
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request, env),
    })
  }

  if (request.method === "GET" && pathname === "/health") {
    return json(request, env, 200, { ok: true })
  }

  if (request.method === "POST" && pathname === "/api/visitor-session") {
    return createVisitorSession(request, env)
  }

  if (pathname === "/api/stickers") {
    if (request.method === "GET") {
      return listStickers(request, env, url)
    }
    if (request.method === "POST") {
      return createSticker(request, env)
    }
  }

  if (pathname === "/api/sticker-pages") {
    if (request.method === "GET") {
      return listStickerPages(request, env)
    }
    if (request.method === "POST") {
      return createStickerPage(request, env)
    }
  }

  const stickerMatch = pathname.match(/^\/api\/stickers\/([^/]+)$/)
  if (stickerMatch) {
    const id = decodeURIComponent(stickerMatch[1])
    if (request.method === "PATCH") {
      return updateSticker(request, env, id)
    }
    if (request.method === "DELETE") {
      return deleteSticker(request, env, id)
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

  if (pathname === "/api/plans") {
    if (request.method === "GET") {
      return listCouplePlans(request, env, url)
    }
    if (request.method === "POST") {
      return createCouplePlan(request, env)
    }
  }

  const planMatch = pathname.match(/^\/api\/plans\/([^/]+)$/)
  if (planMatch) {
    const id = decodeURIComponent(planMatch[1])
    if (request.method === "PATCH") {
      return updateCouplePlan(request, env, id)
    }
    if (request.method === "DELETE") {
      return deleteCouplePlan(request, env, id)
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

      return json(request, env, 500, {
        error: error instanceof Error ? error.message : "Unknown error.",
      })
    }
  },
}
