import assert from "node:assert/strict"
import test from "node:test"

import worker, { type D1Database, type D1PreparedStatement, type D1Result, type Env } from "./index.ts"

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

type JsonObject = Record<string, unknown>

const timestamp = "2026-07-10 00:00:00"

function clone<T>(value: T): T {
  return structuredClone(value)
}

function asString(value: unknown) {
  return String(value ?? "")
}

function asNumber(value: unknown) {
  return Number(value)
}

class MemoryD1 implements D1Database {
  readonly stickers = new Map<string, StickerRow>()
  readonly comments = new Map<string, CommentRow>()
  readonly plans = new Map<string, CouplePlanRow>()

  prepare(query: string): D1PreparedStatement {
    return new MemoryStatement(this, query.replace(/\s+/g, " ").trim())
  }
}

class MemoryStatement implements D1PreparedStatement {
  private values: unknown[] = []

  constructor(
    private readonly database: MemoryD1,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values
    return this
  }

  async first<T = unknown>(): Promise<T | null> {
    if (this.query === "SELECT * FROM stickers WHERE id = ?") {
      const row = this.database.stickers.get(asString(this.values[0]))
      return row ? (clone(row) as T) : null
    }

    if (this.query === "SELECT * FROM comments WHERE date = ? AND visitor_id = ?") {
      const row = this.database.comments.get(this.commentKey(this.values[0], this.values[1]))
      return row ? (clone(row) as T) : null
    }

    if (this.query === "SELECT * FROM couple_plans WHERE id = ?") {
      const row = this.database.plans.get(asString(this.values[0]))
      return row ? (clone(row) as T) : null
    }

    throw new Error(`Unsupported D1 first() query: ${this.query}`)
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    if (this.query.startsWith("SELECT * FROM stickers WHERE board_key = ?")) {
      const boardKey = asString(this.values[0])
      const viewerVisitorId = asString(this.values[1])
      const rows = [...this.database.stickers.values()]
        .filter(
          (row) =>
            row.board_key === boardKey &&
            (row.status === "approved" ||
              (viewerVisitorId !== "" && row.visitor_id === viewerVisitorId && row.status !== "hidden")),
        )
        .sort((left, right) => left.created_at.localeCompare(right.created_at))
      return { results: rows.map((row) => clone(row) as T) }
    }

    if (this.query === "SELECT * FROM stickers WHERE status = ? ORDER BY created_at DESC LIMIT 200") {
      const status = asString(this.values[0])
      const rows = [...this.database.stickers.values()].filter((row) => row.status === status)
      return { results: rows.map((row) => clone(row) as T) }
    }

    if (this.query === "SELECT * FROM comments WHERE status = ? ORDER BY created_at DESC LIMIT 200") {
      const status = asString(this.values[0])
      const rows = [...this.database.comments.values()].filter((row) => row.status === status)
      return { results: rows.map((row) => clone(row) as T) }
    }

    if (this.query.startsWith("SELECT * FROM comments WHERE ")) {
      let rows = [...this.database.comments.values()]
      if (this.query.includes("WHERE date = ?")) {
        const date = asString(this.values[0])
        rows = rows.filter((row) => row.date === date)
      } else if (this.query.includes("WHERE date LIKE ?")) {
        const prefix = asString(this.values[0]).replace(/%$/, "")
        rows = rows.filter((row) => row.date.startsWith(prefix))
      } else if (this.query.includes("WHERE date >= ? AND date <= ?")) {
        const from = asString(this.values[0])
        const to = asString(this.values[1])
        rows = rows.filter((row) => row.date >= from && row.date <= to)
      }
      rows.sort((left, right) => left.date.localeCompare(right.date) || left.created_at.localeCompare(right.created_at))
      return { results: rows.map((row) => clone(row) as T) }
    }

    if (this.query.startsWith("SELECT * FROM couple_plans WHERE board_key = ?")) {
      const boardKey = asString(this.values[0])
      const rows = [...this.database.plans.values()]
        .filter((row) => row.board_key === boardKey)
        .sort((left, right) => {
          const statusOrder =
            Number(left.plan_status === "done") - Number(right.plan_status === "done")
          if (statusOrder !== 0) {
            return statusOrder
          }
          const leftDate = left.scheduled_date || "9999-12-31"
          const rightDate = right.scheduled_date || "9999-12-31"
          return (
            leftDate.localeCompare(rightDate) || left.created_at.localeCompare(right.created_at)
          )
        })
      return { results: rows.map((row) => clone(row) as T) }
    }

    throw new Error(`Unsupported D1 all() query: ${this.query}`)
  }

  async run(): Promise<D1Result> {
    if (this.query.startsWith("INSERT INTO stickers (")) {
      const row: StickerRow = {
        id: asString(this.values[0]),
        board_key: asString(this.values[1]),
        board_label: asString(this.values[2]),
        storage_key: asString(this.values[3]),
        asset_name: asString(this.values[4]),
        asset_src: asString(this.values[5]),
        category: asString(this.values[6]),
        category_label: asString(this.values[7]),
        pack: asString(this.values[8]),
        x: asNumber(this.values[9]),
        y: asNumber(this.values[10]),
        size: asNumber(this.values[11]),
        rotation: asNumber(this.values[12]),
        visitor_id: asString(this.values[13]),
        status: asString(this.values[14]),
        created_at: timestamp,
        updated_at: timestamp,
      }
      this.database.stickers.set(row.id, row)
      return { meta: { changes: 1 } }
    }

    if (this.query.startsWith("UPDATE stickers SET x = ?")) {
      const id = asString(this.values[4])
      const row = this.database.stickers.get(id)
      if (!row) {
        return { meta: { changes: 0 } }
      }
      row.x = asNumber(this.values[0])
      row.y = asNumber(this.values[1])
      row.size = asNumber(this.values[2])
      row.rotation = asNumber(this.values[3])
      row.updated_at = timestamp
      return { meta: { changes: 1 } }
    }

    if (this.query === "DELETE FROM stickers WHERE id = ?") {
      return {
        meta: {
          changes: this.database.stickers.delete(asString(this.values[0])) ? 1 : 0,
        },
      }
    }

    if (this.query.startsWith("INSERT INTO comments (")) {
      const key = this.commentKey(this.values[1], this.values[2])
      const existing = this.database.comments.get(key)
      const incomingStatus = asString(this.values[4])
      const row: CommentRow = {
        id: existing?.id ?? asString(this.values[0]),
        date: asString(this.values[1]),
        visitor_id: asString(this.values[2]),
        text: asString(this.values[3]),
        status: existing?.status === "hidden" ? incomingStatus : (existing?.status ?? incomingStatus),
        created_at: existing?.created_at ?? timestamp,
        updated_at: timestamp,
      }
      this.database.comments.set(key, row)
      return { meta: { changes: 1 } }
    }

    if (this.query === "DELETE FROM comments WHERE date = ? AND visitor_id = ?") {
      const key = this.commentKey(this.values[0], this.values[1])
      return { meta: { changes: this.database.comments.delete(key) ? 1 : 0 } }
    }

    if (this.query.startsWith("INSERT INTO couple_plans (")) {
      const row: CouplePlanRow = {
        id: asString(this.values[0]),
        board_key: asString(this.values[1]),
        title: asString(this.values[2]),
        scheduled_date: asString(this.values[3]),
        person: asString(this.values[4]),
        plan_status: asString(this.values[5]),
        notes: asString(this.values[6]),
        asset_name: asString(this.values[7]),
        asset_src: asString(this.values[8]),
        asset_category: asString(this.values[9]),
        asset_category_label: asString(this.values[10]),
        asset_pack: asString(this.values[11]),
        created_at: timestamp,
        updated_at: timestamp,
      }
      this.database.plans.set(row.id, row)
      return { meta: { changes: 1 } }
    }

    if (this.query.startsWith("UPDATE couple_plans SET title = ?")) {
      const id = asString(this.values[10])
      const row = this.database.plans.get(id)
      if (!row) {
        return { meta: { changes: 0 } }
      }
      row.title = asString(this.values[0])
      row.scheduled_date = asString(this.values[1])
      row.person = asString(this.values[2])
      row.plan_status = asString(this.values[3])
      row.notes = asString(this.values[4])
      row.asset_name = asString(this.values[5])
      row.asset_src = asString(this.values[6])
      row.asset_category = asString(this.values[7])
      row.asset_category_label = asString(this.values[8])
      row.asset_pack = asString(this.values[9])
      row.updated_at = timestamp
      return { meta: { changes: 1 } }
    }

    if (this.query === "DELETE FROM couple_plans WHERE id = ?") {
      return {
        meta: {
          changes: this.database.plans.delete(asString(this.values[0])) ? 1 : 0,
        },
      }
    }

    throw new Error(`Unsupported D1 run() query: ${this.query}`)
  }

  private commentKey(date: unknown, visitorId: unknown) {
    return `${asString(date)}\u0000${asString(visitorId)}`
  }
}

function makeEnv(database = new MemoryD1(), overrides: Partial<Omit<Env, "DB">> = {}) {
  const env: Env = {
    DB: database,
    ADMIN_TOKEN: "admin-secret",
    VISITOR_SIGNING_SECRET: "visitor-signing-secret",
    CALENDAR_ACCESS_TOKEN: "calendar-secret",
    PUBLIC_WRITE_STATUS: "approved",
    ALLOWED_ORIGINS: "https://example.test",
    ...overrides,
  }
  return { database, env }
}

function apiRequest(
  path: string,
  {
    method = "GET",
    token,
    admin,
    calendar,
    body,
  }: {
    method?: string
    token?: string
    admin?: string
    calendar?: string
    body?: JsonObject
  } = {},
) {
  const headers = new Headers({ Origin: "https://example.test" })
  if (token) {
    headers.set("X-Visitor-Token", token)
  }
  if (admin) {
    headers.set("Authorization", `Bearer ${admin}`)
  }
  if (calendar) {
    headers.set("X-Calendar-Token", calendar)
  }
  if (body !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  return new Request(`https://worker.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function responseJson(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject
}

async function issueVisitorToken(env: Env, suppliedVisitorId = "attacker-controlled") {
  const response = await worker.fetch(
    apiRequest("/api/visitor-session", {
      method: "POST",
      body: { visitorId: suppliedVisitorId },
    }),
    env,
  )
  assert.equal(response.status, 201)
  const payload = await responseJson(response)
  assert.deepEqual(Object.keys(payload), ["token"])
  assert.equal(typeof payload.token, "string")
  return payload.token as string
}

function visitorIdFromToken(token: string) {
  const [, visitorId] = token.split(".")
  assert.match(visitorId, /^[0-9a-f-]{36}$/i)
  return visitorId
}

function stickerPayload(id: string, boardKey = "public-wall"): JsonObject {
  return {
    id,
    boardKey,
    boardLabel: "Public board",
    storageKey: "public-board",
    visitorId: "ignored-body-visitor",
    asset: {
      name: "Test sticker",
      src: "/assets/stickers/test.gif",
      category: "test",
      categoryLabel: "Test",
      pack: "tests",
    },
    x: 25,
    y: 30,
    size: 72,
    rotation: 0,
  }
}

function stickerUpdate(visitorId = "ignored-body-visitor"): JsonObject {
  return { visitorId, x: 40, y: 45, size: 80, rotation: 5 }
}

function planPayload(overrides: JsonObject = {}): JsonObject {
  return {
    boardKey: "our-plans",
    title: "Visit the museum",
    scheduledDate: "2026-08-02",
    person: "我们一起",
    status: "planned",
    notes: "Book tickets before Friday.",
    asset: {
      name: "Test sticker",
      src: "/assets/stickers/test.gif",
      category: "test",
      categoryLabel: "Test",
      pack: "tests",
    },
    ...overrides,
  }
}

function objectAt(value: unknown, key: string) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value))
  return (value as JsonObject)[key]
}

test("visitor sessions are Worker-issued, forged tokens fail, and the admin secret is a compatibility fallback", async () => {
  const { env } = makeEnv()
  const token = await issueVisitorToken(env)
  assert.match(token, /^v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/i)
  assert.notEqual(visitorIdFromToken(token), "attacker-controlled")

  const [version, visitorId, signature] = token.split(".")
  const forgedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`
  const forgedResponse = await worker.fetch(
    apiRequest("/api/stickers", {
      method: "POST",
      token: `${version}.${visitorId}.${forgedSignature}`,
      body: stickerPayload("forged-token"),
    }),
    env,
  )
  assert.equal(forgedResponse.status, 401)

  const bodyOnlyResponse = await worker.fetch(
    apiRequest("/api/stickers", {
      method: "POST",
      body: { ...stickerPayload("body-only"), visitorId },
    }),
    env,
  )
  assert.equal(bodyOnlyResponse.status, 401)

  const { env: fallbackEnv } = makeEnv(new MemoryD1(), {
    VISITOR_SIGNING_SECRET: undefined,
  })
  const fallbackToken = await issueVisitorToken(fallbackEnv)
  const fallbackWrite = await worker.fetch(
    apiRequest("/api/stickers", {
      method: "POST",
      token: fallbackToken,
      body: stickerPayload("fallback-secret"),
    }),
    fallbackEnv,
  )
  assert.equal(fallbackWrite.status, 201)

  const preflight = await worker.fetch(apiRequest("/api/stickers", { method: "OPTIONS" }), env)
  assert.match(preflight.headers.get("Access-Control-Allow-Headers") ?? "", /X-Visitor-Token/)
  assert.match(preflight.headers.get("Access-Control-Allow-Headers") ?? "", /X-Calendar-Token/)
})

test("public sticker responses expose owned without leaking visitorId or trusting query/body identity", async () => {
  const { database, env } = makeEnv()
  const token = await issueVisitorToken(env)
  const visitorId = visitorIdFromToken(token)

  const createResponse = await worker.fetch(
    apiRequest("/api/stickers", {
      method: "POST",
      token,
      body: stickerPayload("public-owned"),
    }),
    env,
  )
  assert.equal(createResponse.status, 201)
  const createPayload = await responseJson(createResponse)
  const createdSticker = objectAt(createPayload, "sticker") as JsonObject
  assert.equal(createdSticker.owned, true)
  assert.equal("visitorId" in createdSticker, false)
  assert.equal(database.stickers.get("public-owned")?.visitor_id, visitorId)

  const anonymousResponse = await worker.fetch(
    apiRequest(`/api/stickers?board=public-wall&visitorId=${encodeURIComponent(visitorId)}`),
    env,
  )
  assert.equal(anonymousResponse.status, 200)
  const anonymousPayload = await responseJson(anonymousResponse)
  const anonymousStickers = anonymousPayload.stickers as JsonObject[]
  assert.equal(anonymousStickers[0].owned, false)
  assert.equal("visitorId" in anonymousStickers[0], false)
  assert.equal(JSON.stringify(anonymousPayload).includes(visitorId), false)

  const ownedResponse = await worker.fetch(apiRequest("/api/stickers?board=public-wall", { token }), env)
  const ownedPayload = await responseJson(ownedResponse)
  const ownedStickers = ownedPayload.stickers as JsonObject[]
  assert.equal(ownedStickers[0].owned, true)
  assert.equal("visitorId" in ownedStickers[0], false)
})

test("a signed visitor can update and delete only their own public stickers", async () => {
  const { env } = makeEnv()
  const ownerToken = await issueVisitorToken(env)
  const otherToken = await issueVisitorToken(env)
  const ownerVisitorId = visitorIdFromToken(ownerToken)

  const createResponse = await worker.fetch(
    apiRequest("/api/stickers", {
      method: "POST",
      token: ownerToken,
      body: stickerPayload("ownership-check"),
    }),
    env,
  )
  assert.equal(createResponse.status, 201)

  const otherUpdate = await worker.fetch(
    apiRequest("/api/stickers/ownership-check", {
      method: "PATCH",
      token: otherToken,
      body: stickerUpdate(ownerVisitorId),
    }),
    env,
  )
  assert.equal(otherUpdate.status, 404)

  const otherDelete = await worker.fetch(
    apiRequest(`/api/stickers/ownership-check?visitorId=${encodeURIComponent(ownerVisitorId)}`, {
      method: "DELETE",
      token: otherToken,
    }),
    env,
  )
  assert.equal(otherDelete.status, 404)

  const ownerUpdate = await worker.fetch(
    apiRequest("/api/stickers/ownership-check", {
      method: "PATCH",
      token: ownerToken,
      body: stickerUpdate(),
    }),
    env,
  )
  assert.equal(ownerUpdate.status, 200)
  const updatePayload = await responseJson(ownerUpdate)
  const updatedSticker = objectAt(updatePayload, "sticker") as JsonObject
  assert.equal(updatedSticker.owned, true)
  assert.equal("visitorId" in updatedSticker, false)

  const ownerDelete = await worker.fetch(
    apiRequest("/api/stickers/ownership-check", {
      method: "DELETE",
      token: ownerToken,
    }),
    env,
  )
  assert.equal(ownerDelete.status, 200)
})

test("calendar password holders can edit calendar data without receiving admin access", async () => {
  const { database, env } = makeEnv()
  const visitorToken = await issueVisitorToken(env)

  const calendarCreate = await worker.fetch(
    apiRequest("/api/stickers", {
      method: "POST",
      calendar: "calendar-secret",
      body: stickerPayload("calendar-owned", "2026-07"),
    }),
    env,
  )
  assert.equal(calendarCreate.status, 201)
  assert.equal(database.stickers.get("calendar-owned")?.visitor_id, "calendar-editor")

  const calendarRequests = [
    apiRequest("/api/stickers?board=2026-07", { token: visitorToken }),
    apiRequest("/api/stickers", {
      method: "POST",
      token: visitorToken,
      body: stickerPayload("calendar-blocked", "2026-07"),
    }),
    apiRequest("/api/stickers/calendar-owned", {
      method: "PATCH",
      token: visitorToken,
      body: stickerUpdate(),
    }),
    apiRequest("/api/stickers/calendar-owned", {
      method: "DELETE",
      token: visitorToken,
    }),
  ]
  for (const request of calendarRequests) {
    const response = await worker.fetch(request, env)
    assert.equal(response.status, 401)
  }

  const commentReadWithoutAdmin = await worker.fetch(
    apiRequest("/api/comments?date=2026-07-10", { token: visitorToken }),
    env,
  )
  assert.equal(commentReadWithoutAdmin.status, 401)
  const commentWriteWithoutAdmin = await worker.fetch(
    apiRequest("/api/comments", {
      method: "POST",
      token: visitorToken,
      body: { date: "2026-07-10", text: "blocked", visitorId: "forged" },
    }),
    env,
  )
  assert.equal(commentWriteWithoutAdmin.status, 401)

  const wrongCalendarToken = await worker.fetch(
    apiRequest("/api/stickers?board=2026-07", { calendar: "wrong-calendar-secret" }),
    env,
  )
  assert.equal(wrongCalendarToken.status, 401)

  const missingFilter = await worker.fetch(apiRequest("/api/comments", { calendar: "calendar-secret" }), env)
  assert.equal(missingFilter.status, 400)
  const incompleteRange = await worker.fetch(
    apiRequest("/api/comments?from=2026-07-01", { calendar: "calendar-secret" }),
    env,
  )
  assert.equal(incompleteRange.status, 400)

  const calendarComment = await worker.fetch(
    apiRequest("/api/comments", {
      method: "POST",
      calendar: "calendar-secret",
      body: {
        date: "2026-07-10",
        text: "shared note",
        visitorId: "ignored-comment-visitor",
      },
    }),
    env,
  )
  assert.equal(calendarComment.status, 200)
  const commentPayload = await responseJson(calendarComment)
  const comment = objectAt(commentPayload, "comment") as JsonObject
  assert.equal(comment.owned, true)
  assert.equal("visitorId" in comment, false)
  assert.equal(database.comments.get("2026-07-10\u0000calendar-editor")?.visitor_id, "calendar-editor")

  const calendarCommentList = await worker.fetch(
    apiRequest("/api/comments?month=2026-07", { calendar: "calendar-secret" }),
    env,
  )
  assert.equal(calendarCommentList.status, 200)
  const commentListPayload = await responseJson(calendarCommentList)
  const comments = commentListPayload.comments as JsonObject[]
  assert.equal(comments[0].owned, true)
  assert.equal("visitorId" in comments[0], false)

  const calendarList = await worker.fetch(
    apiRequest("/api/stickers?board=2026-07", { calendar: "calendar-secret" }),
    env,
  )
  assert.equal(calendarList.status, 200)
  const calendarListPayload = await responseJson(calendarList)
  const calendarStickers = calendarListPayload.stickers as JsonObject[]
  assert.equal(calendarStickers[0].owned, true)

  const calendarUpdate = await worker.fetch(
    apiRequest("/api/stickers/calendar-owned", {
      method: "PATCH",
      calendar: "calendar-secret",
      body: stickerUpdate(),
    }),
    env,
  )
  assert.equal(calendarUpdate.status, 200)

  const calendarDelete = await worker.fetch(
    apiRequest("/api/stickers/calendar-owned", {
      method: "DELETE",
      calendar: "calendar-secret",
    }),
    env,
  )
  assert.equal(calendarDelete.status, 200)

  const calendarCannotModerate = await worker.fetch(
    apiRequest("/api/admin/items?status=approved", { calendar: "calendar-secret" }),
    env,
  )
  assert.equal(calendarCannotModerate.status, 401)
  const calendarCannotCreatePages = await worker.fetch(
    apiRequest("/api/sticker-pages", {
      method: "POST",
      calendar: "calendar-secret",
      body: { label: "Forbidden" },
    }),
    env,
  )
  assert.equal(calendarCannotCreatePages.status, 401)

  const moderationResponse = await worker.fetch(
    apiRequest("/api/admin/items?status=approved", { admin: "admin-secret" }),
    env,
  )
  assert.equal(moderationResponse.status, 200)
  const moderationPayload = await responseJson(moderationResponse)
  const moderationComments = moderationPayload.comments as JsonObject[]
  assert.equal(moderationComments[0].visitorId, "calendar-editor")

  const adminCalendarCreate = await worker.fetch(
    apiRequest("/api/stickers", {
      method: "POST",
      admin: "admin-secret",
      body: stickerPayload("admin-calendar", "2026-07"),
    }),
    env,
  )
  assert.equal(adminCalendarCreate.status, 201)

  const adminCalendarDelete = await worker.fetch(
    apiRequest("/api/stickers/admin-calendar", {
      method: "DELETE",
      admin: "admin-secret",
    }),
    env,
  )
  assert.equal(adminCalendarDelete.status, 200)
})

test("calendar password holders share private plans with validated image assets", async () => {
  const { database, env } = makeEnv()
  const visitorToken = await issueVisitorToken(env)

  const blockedRequests = [
    apiRequest("/api/plans?board=our-plans", { token: visitorToken }),
    apiRequest("/api/plans", {
      method: "POST",
      token: visitorToken,
      body: planPayload(),
    }),
  ]
  for (const request of blockedRequests) {
    const response = await worker.fetch(request, env)
    assert.equal(response.status, 401)
  }

  const createResponse = await worker.fetch(
    apiRequest("/api/plans", {
      method: "POST",
      calendar: "calendar-secret",
      body: planPayload(),
    }),
    env,
  )
  assert.equal(createResponse.status, 201)
  const createPayload = await responseJson(createResponse)
  const createdPlan = objectAt(createPayload, "plan") as JsonObject
  const planId = String(createdPlan.id)
  assert.match(planId, /^[0-9a-f-]{36}$/i)
  assert.equal(createdPlan.planStatus, "planned")
  assert.equal(
    objectAt(createdPlan, "asset") && (objectAt(createdPlan, "asset") as JsonObject).src,
    "/assets/stickers/test.gif",
  )
  assert.equal(database.plans.get(planId)?.person, "我们一起")

  const listResponse = await worker.fetch(
    apiRequest("/api/plans?board=our-plans", { calendar: "calendar-secret" }),
    env,
  )
  assert.equal(listResponse.status, 200)
  const listPayload = await responseJson(listResponse)
  assert.equal((listPayload.plans as JsonObject[]).length, 1)

  const updateResponse = await worker.fetch(
    apiRequest(`/api/plans/${planId}`, {
      method: "PATCH",
      calendar: "calendar-secret",
      body: planPayload({
        title: "Museum visit completed",
        status: "done",
        asset: null,
      }),
    }),
    env,
  )
  assert.equal(updateResponse.status, 200)
  const updatePayload = await responseJson(updateResponse)
  const updatedPlan = objectAt(updatePayload, "plan") as JsonObject
  assert.equal(updatedPlan.planStatus, "done")
  assert.equal(updatedPlan.asset, null)

  const invalidStatus = await worker.fetch(
    apiRequest(`/api/plans/${planId}`, {
      method: "PATCH",
      calendar: "calendar-secret",
      body: planPayload({ status: "hidden" }),
    }),
    env,
  )
  assert.equal(invalidStatus.status, 400)

  const invalidAsset = await worker.fetch(
    apiRequest(`/api/plans/${planId}`, {
      method: "PATCH",
      calendar: "calendar-secret",
      body: planPayload({
        asset: { name: "External", src: "https://example.test/private.png" },
      }),
    }),
    env,
  )
  assert.equal(invalidAsset.status, 400)

  const blockedDelete = await worker.fetch(
    apiRequest(`/api/plans/${planId}`, {
      method: "DELETE",
      token: visitorToken,
    }),
    env,
  )
  assert.equal(blockedDelete.status, 401)

  const deleteResponse = await worker.fetch(
    apiRequest(`/api/plans/${planId}`, {
      method: "DELETE",
      calendar: "calendar-secret",
    }),
    env,
  )
  assert.equal(deleteResponse.status, 200)
  assert.equal(database.plans.size, 0)
})
