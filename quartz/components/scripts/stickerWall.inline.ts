type StickerAsset = {
  name: string
  src: string
  category?: string
  categoryLabel?: string
  pack?: string
}

type PlacedSticker = StickerAsset & {
  id: string
  x: number
  y: number
  size: number
  rotation: number
  remote?: boolean
  status?: string
  visitorId?: string
}

type StickerBoardState = {
  board: HTMLElement
  controlId: string
  key: string
  label: string
  layer: HTMLElement
  stickers: PlacedSticker[]
  storageKey: string
}

type StickerInteractionsClient = {
  apiBase: string
  enabled: boolean
  visitorId: () => string
  ownerKey: () => string
  setOwnerKey: (value: string) => void
  clearOwnerKey: () => void
  listStickers: (boardKey: string) => Promise<PlacedSticker[]>
  createSticker: (payload: Record<string, unknown>, options?: { owner?: boolean }) => Promise<PlacedSticker | null>
  updateSticker: (
    id: string,
    payload: Record<string, unknown>,
    options?: { owner?: boolean },
  ) => Promise<PlacedSticker | null>
  deleteSticker: (id: string, options?: { owner?: boolean }) => Promise<void>
}

const stickerWallStorageKey = "qinzi27-sticker-wall-v1"
const maxUploadBytes = 700_000

function getStorageKey(root: HTMLElement) {
  return root.dataset.stickerStorageKey || stickerWallStorageKey
}

function readStickerAssets(root: Element): StickerAsset[] {
  const script =
    root.querySelector<HTMLScriptElement>("script[data-sticker-assets]") ??
    root.ownerDocument.querySelector<HTMLScriptElement>("script[data-sticker-assets]")
  if (!script?.textContent) {
    return []
  }

  try {
    const parsed = JSON.parse(script.textContent) as StickerAsset[]
    return parsed.filter((asset) => typeof asset.name === "string" && typeof asset.src === "string")
  } catch {
    return []
  }
}

function readPlacedStickers(storageKey: string): PlacedSticker[] {
  // GitHub Pages cannot persist visitor edits by itself, so this stores each
  // visitor's sticker placement locally until a shared backend is added.
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as PlacedSticker[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function savePlacedStickers(storageKey: string, stickers: PlacedSticker[]) {
  localStorage.setItem(storageKey, JSON.stringify(stickers))
}

function getUploadStorageKey(storageKey: string) {
  return `${storageKey}:uploads`
}

function readUploadedAssets(storageKey: string): StickerAsset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(getUploadStorageKey(storageKey)) ?? "[]") as StickerAsset[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveUploadedAssets(storageKey: string, assets: StickerAsset[]) {
  localStorage.setItem(getUploadStorageKey(storageKey), JSON.stringify(assets))
}

function getStickerInteractionsClient() {
  return (window as Window & { QinziInteractions?: StickerInteractionsClient }).QinziInteractions
}

function getStickerVisitorId() {
  return getStickerInteractionsClient()?.visitorId() ?? ""
}

function canShareAsset(asset: StickerAsset) {
  return asset.src.startsWith("/assets/stickers/") || asset.src.startsWith("/assets/couple-calendar-stickers/")
}

function canEditSticker(sticker: PlacedSticker, ownerOnly = false, ownerUnlocked = false) {
  if (ownerOnly) {
    return ownerUnlocked
  }

  const visitorId = getStickerVisitorId()
  return !sticker.visitorId || !visitorId || sticker.visitorId === visitorId
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function stickerTransform(rotation: number) {
  return `translate(-50%, -50%) rotate(${rotation}deg)`
}

function moveStickerToPointer(sticker: PlacedSticker, item: HTMLElement, bounds: HTMLElement, event: PointerEvent) {
  const rect = bounds.getBoundingClientRect()
  sticker.x = Math.max(4, Math.min(96, ((event.clientX - rect.left) / rect.width) * 100))
  sticker.y = Math.max(4, Math.min(96, ((event.clientY - rect.top) / rect.height) * 100))
  item.style.left = `${sticker.x}%`
  item.style.top = `${sticker.y}%`
}

function makeSticker(asset: StickerAsset, x?: number, y?: number): PlacedSticker {
  return {
    ...asset,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    x: x ?? randomBetween(8, 78),
    y: y ?? randomBetween(8, 72),
    size: randomBetween(66, 112),
    rotation: randomBetween(-12, 12),
    visitorId: getStickerVisitorId() || undefined,
  }
}

function remoteStickerPayload(state: StickerBoardState, sticker: PlacedSticker) {
  return {
    id: sticker.id,
    boardKey: state.key,
    boardLabel: state.label,
    storageKey: state.storageKey,
    asset: {
      name: sticker.name,
      src: sticker.src,
      category: sticker.category,
      categoryLabel: sticker.categoryLabel,
      pack: sticker.pack,
    },
    x: sticker.x,
    y: sticker.y,
    size: sticker.size,
    rotation: sticker.rotation,
  }
}

function normalizeRemoteSticker(sticker: PlacedSticker): PlacedSticker {
  return {
    name: sticker.name,
    src: sticker.src,
    category: sticker.category || undefined,
    categoryLabel: sticker.categoryLabel || undefined,
    pack: sticker.pack || undefined,
    id: sticker.id,
    x: sticker.x,
    y: sticker.y,
    size: sticker.size,
    rotation: sticker.rotation,
    visitorId: sticker.visitorId,
    status: sticker.status,
    remote: true,
  }
}

function renderSticker(
  layer: HTMLElement,
  bounds: HTMLElement,
  storageKey: string,
  sticker: PlacedSticker,
  stickers: PlacedSticker[],
  ownerOnly = false,
  ownerUnlocked = false,
  onStickersChanged?: () => void,
  onStickerMoved?: (sticker: PlacedSticker) => void,
  onStickerDeleted?: (sticker: PlacedSticker) => void,
) {
  const editable = canEditSticker(sticker, ownerOnly, ownerUnlocked)
  const item = document.createElement("button")
  item.type = "button"
  item.className = "sticker-wall-item"
  item.classList.toggle("is-readonly", !editable)
  item.dataset.stickerId = sticker.id
  item.ariaLabel = sticker.name
  item.title = editable ? sticker.name : ownerOnly ? "开启我的编辑后可调整" : "只能移动或删除自己贴的贴纸"
  item.style.left = `${sticker.x}%`
  item.style.top = `${sticker.y}%`
  item.style.width = `${sticker.size}px`
  item.style.transform = stickerTransform(sticker.rotation)

  const image = document.createElement("img")
  image.src = sticker.src
  image.alt = sticker.name
  image.loading = "lazy"
  image.decoding = "async"
  item.append(image)
  layer.append(item)

  let activePointer: number | null = null

  item.addEventListener("pointerdown", (event) => {
    if (!canEditSticker(sticker, ownerOnly, ownerUnlocked)) {
      return
    }

    event.preventDefault()
    activePointer = event.pointerId
    item.setPointerCapture(activePointer)
    item.classList.add("is-dragging")
    moveStickerToPointer(sticker, item, bounds, event)
  })

  item.addEventListener("pointermove", (event) => {
    if (activePointer !== event.pointerId) {
      return
    }

    event.preventDefault()
    moveStickerToPointer(sticker, item, bounds, event)
  })

  item.addEventListener("pointerup", (event) => {
    if (activePointer !== event.pointerId) {
      return
    }

    event.preventDefault()
    activePointer = null
    item.classList.remove("is-dragging")
    savePlacedStickers(storageKey, stickers)
    onStickerMoved?.(sticker)
  })

  item.addEventListener("dblclick", () => {
    if (!canEditSticker(sticker, ownerOnly, ownerUnlocked)) {
      return
    }

    const index = stickers.findIndex((current) => current.id === sticker.id)
    if (index >= 0) {
      stickers.splice(index, 1)
      savePlacedStickers(storageKey, stickers)
      item.remove()
      onStickerDeleted?.(sticker)
      onStickersChanged?.()
    }
  })
}

function getStickerLayer(board: HTMLElement) {
  const existing = board.querySelector<HTMLElement>(":scope > .sticker-wall-layer")
  if (existing) {
    return existing
  }

  const layer = document.createElement("div")
  layer.className = "sticker-wall-layer"
  board.append(layer)
  return layer
}

function getBoardState(rootStorageKey: string, board: HTMLElement, index: number, totalBoards: number): StickerBoardState {
  const key = board.dataset.stickerBoardKey || (totalBoards === 1 ? "default" : `board-${index + 1}`)
  const storageKey = board.dataset.stickerBoardKey ? `${rootStorageKey}:${key}` : rootStorageKey
  const label = board.dataset.stickerBoardLabel || key

  return {
    board,
    controlId: board.dataset.stickerBoardControl || "",
    key,
    label,
    layer: getStickerLayer(board),
    stickers: readPlacedStickers(storageKey),
    storageKey,
  }
}

function isVisibleBoard(board: HTMLElement) {
  const rect = board.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function getAssetCategory(asset: StickerAsset) {
  return asset.category || asset.pack || "uncategorized"
}

function getAssetCategoryLabel(asset: StickerAsset) {
  return asset.categoryLabel || asset.category || asset.pack || "Uncategorized"
}

function makeCategoryOptions(baseAssets: StickerAsset[]) {
  const categories = new Map<string, { label: string; count: number }>()

  baseAssets.forEach((asset) => {
    const category = getAssetCategory(asset)
    const current = categories.get(category)
    if (current) {
      current.count += 1
      return
    }

    categories.set(category, {
      label: getAssetCategoryLabel(asset),
      count: 1,
    })
  })

  return [...categories.entries()].map(([category, value]) => ({
    category,
    ...value,
  }))
}

function renderCategoryFilter(
  container: HTMLElement | null,
  baseAssets: StickerAsset[],
  uploadedAssets: StickerAsset[],
  selectedCategory: string,
  onSelect: (category: string) => void,
) {
  if (!container) {
    return
  }

  const options = [
    { category: "all", label: "全部", count: baseAssets.length + uploadedAssets.length },
    ...makeCategoryOptions(baseAssets),
    ...(uploadedAssets.length > 0 ? [{ category: "uploaded", label: "暂存", count: uploadedAssets.length }] : []),
  ]

  container.innerHTML = ""
  options.forEach((option) => {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "sticker-category-button"
    button.textContent = `${option.label} (${option.count})`
    button.setAttribute("aria-pressed", selectedCategory === option.category ? "true" : "false")

    if (selectedCategory === option.category) {
      button.classList.add("is-active")
    }

    button.addEventListener("click", () => onSelect(option.category))
    container.append(button)
  })
}

function renderMonthPreview(
  container: HTMLElement | null,
  states: StickerBoardState[],
  activeState: StickerBoardState,
  onSelect: (state: StickerBoardState) => void,
) {
  if (!container || states.length <= 1) {
    return
  }

  container.innerHTML = ""
  states.forEach((state) => {
    const item = document.createElement("button")
    item.type = "button"
    item.className = "sticker-month-preview-item"
    item.setAttribute("aria-pressed", state.key === activeState.key ? "true" : "false")

    if (state.key === activeState.key) {
      item.classList.add("is-active")
    }

    const label = document.createElement("span")
    label.className = "sticker-month-preview-label"
    label.textContent = state.label

    const count = document.createElement("span")
    count.className = "sticker-month-preview-count"
    count.textContent = `${state.stickers.length}张`

    const thumbs = document.createElement("span")
    thumbs.className = "sticker-month-preview-thumbs"
    const previewStickers = state.stickers.slice(-3)

    if (previewStickers.length === 0) {
      const empty = document.createElement("span")
      empty.className = "sticker-month-preview-empty"
      empty.textContent = "空"
      thumbs.append(empty)
    } else {
      previewStickers.forEach((sticker) => {
        const image = document.createElement("img")
        image.src = sticker.src
        image.alt = sticker.name
        image.loading = "lazy"
        image.decoding = "async"
        thumbs.append(image)
      })
    }

    item.append(label, count, thumbs)
    item.addEventListener("click", () => onSelect(state))
    container.append(item)
  })
}

function renderUploadStage(
  stage: HTMLElement | null,
  storageKey: string,
  uploadedAssets: StickerAsset[],
  addSticker: (asset: StickerAsset) => void,
  onUploadedAssetsChanged?: () => void,
  canUseStage = () => true,
) {
  if (!stage) {
    return
  }

  stage.innerHTML = ""
  uploadedAssets.forEach((asset) => {
    const item = document.createElement("button")
    item.type = "button"
    item.className = "sticker-stage-item"
    item.ariaLabel = asset.name

    const image = document.createElement("img")
    image.src = asset.src
    image.alt = asset.name
    image.loading = "lazy"
    image.decoding = "async"
    item.append(image)

    item.addEventListener("click", () => {
      if (canUseStage()) {
        addSticker(asset)
      }
    })
    item.addEventListener("dblclick", () => {
      if (!canUseStage()) {
        return
      }

      const index = uploadedAssets.findIndex((current) => current.src === asset.src)
      if (index >= 0) {
        uploadedAssets.splice(index, 1)
        saveUploadedAssets(storageKey, uploadedAssets)
        onUploadedAssetsChanged?.()
        renderUploadStage(stage, storageKey, uploadedAssets, addSticker, onUploadedAssetsChanged, canUseStage)
      }
    })

    stage.append(item)
  })
}

function readUploadedFile(file: File): Promise<StickerAsset | null> {
  if (!file.type.startsWith("image/") || file.size > maxUploadBytes) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      const src = typeof reader.result === "string" ? reader.result : ""
      resolve(src ? { name: file.name, src } : null)
    })
    reader.addEventListener("error", () => resolve(null))
    reader.readAsDataURL(file)
  })
}

function initStickerWall(root: HTMLElement) {
  // Quartz uses SPA navigation; initialize on every route change and skip when
  // the current page does not contain a sticker wall.
  if (root.dataset.stickerInitialized === "true") {
    return
  }

  const boards = [...root.querySelectorAll<HTMLElement>("[data-sticker-board]")]
  const addButton = root.querySelector<HTMLButtonElement>("[data-sticker-add]")
  const burstButton = root.querySelector<HTMLButtonElement>("[data-sticker-burst]")
  const clearButton = root.querySelector<HTMLButtonElement>("[data-sticker-clear]")
  const clearUploadsButton = root.querySelector<HTMLButtonElement>("[data-sticker-clear-uploads]")
  const uploadInput = root.querySelector<HTMLInputElement>("[data-sticker-upload]")
  const stage = root.querySelector<HTMLElement>("[data-sticker-stage]")
  const categoryFilter = root.querySelector<HTMLElement>("[data-sticker-categories]")
  const monthPreview = root.querySelector<HTMLElement>("[data-sticker-month-preview]")
  const storageKey = getStorageKey(root)
  const baseAssets = readStickerAssets(root)
  const uploadedAssets = readUploadedAssets(storageKey)
  const ownerOnly = root.dataset.stickerOwnerOnly === "true"
  let ownerUnlocked = !ownerOnly
  let selectedCategory = "all"

  if (boards.length === 0 || !addButton || !burstButton || !clearButton || baseAssets.length === 0) {
    return
  }

  const boardStates = boards.map((board, index) => getBoardState(storageKey, board, index, boards.length))
  root.dataset.stickerInitialized = "true"
  createOwnerPanel()
  updateOwnerClass()
  boardStates.forEach((state) => {
    state.layer.innerHTML = ""
    state.stickers.forEach((sticker) => renderStateSticker(state, sticker))
  })

  function hasOwnerAccess() {
    return !ownerOnly || ownerUnlocked
  }

  function ownerRequestOptions() {
    return ownerOnly && ownerUnlocked ? { owner: true } : undefined
  }

  async function validateOwnerKey(key: string) {
    const client = getStickerInteractionsClient()
    if (!client?.enabled || !client.apiBase) {
      return true
    }

    const response = await fetch(`${client.apiBase}/api/admin/items?status=pending`, {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    })
    return response.ok
  }

  function updateOwnerClass() {
    root.classList.toggle("is-owner-only", ownerOnly)
    root.classList.toggle("is-owner-locked", ownerOnly && !ownerUnlocked)
    root.classList.toggle("is-owner-unlocked", ownerOnly && ownerUnlocked)
    ;[addButton, burstButton, clearButton, clearUploadsButton, uploadInput].forEach((control) => {
      if (control) {
        control.toggleAttribute("disabled", ownerOnly && !ownerUnlocked)
      }
    })
  }

  function rerenderStateStickers() {
    boardStates.forEach((state) => {
      state.layer.innerHTML = ""
      state.stickers.forEach((sticker) => renderStateSticker(state, sticker))
    })
  }

  function setOwnerAccess(unlocked: boolean) {
    ownerUnlocked = !ownerOnly || unlocked
    updateOwnerClass()
    rerenderStateStickers()
    updateMonthPreview()
    renderUploadStage(stage, storageKey, uploadedAssets, addSticker, updateCategoryFilter, hasOwnerAccess)
  }

  function createOwnerPanel() {
    if (!ownerOnly || root.querySelector("[data-sticker-owner-panel]")) {
      return
    }

    const panel = document.createElement("div")
    panel.className = "sticker-owner-panel"
    panel.dataset.stickerOwnerPanel = ""

    const label = document.createElement("label")
    label.className = "sticker-owner-key"

    const labelText = document.createElement("span")
    labelText.textContent = "我的编辑"

    const input = document.createElement("input")
    input.type = "password"
    input.autocomplete = "off"
    input.spellcheck = false
    input.placeholder = "管理密钥"
    input.value = getStickerInteractionsClient()?.ownerKey() ?? ""

    label.append(labelText, input)

    const unlockButton = document.createElement("button")
    unlockButton.type = "button"
    unlockButton.textContent = "开启"

    const lockButton = document.createElement("button")
    lockButton.type = "button"
    lockButton.textContent = "退出"

    const status = document.createElement("span")
    status.className = "sticker-owner-status"

    const syncStatus = (message?: string) => {
      status.textContent = message ?? (ownerUnlocked ? "可调整图标" : "只读")
    }

    unlockButton.addEventListener("click", async () => {
      const key = input.value.trim()
      if (!key) {
        setOwnerAccess(false)
        syncStatus()
        return
      }

      unlockButton.disabled = true
      syncStatus("检查中")
      try {
        const valid = await validateOwnerKey(key)
        if (!valid) {
          getStickerInteractionsClient()?.clearOwnerKey()
          setOwnerAccess(false)
          syncStatus("密钥不对")
          return
        }

        getStickerInteractionsClient()?.setOwnerKey(key)
        setOwnerAccess(true)
        syncStatus()
      } catch {
        setOwnerAccess(false)
        syncStatus("连接失败")
      } finally {
        unlockButton.disabled = false
      }
    })

    lockButton.addEventListener("click", () => {
      input.value = ""
      getStickerInteractionsClient()?.clearOwnerKey()
      setOwnerAccess(false)
      syncStatus()
    })

    panel.append(label, unlockButton, lockButton, status)
    root.insertBefore(panel, root.querySelector(".sticker-wall-toolbar") ?? root.firstChild)
    syncStatus()
  }

  function getActiveBoardState() {
    return boardStates.find((state) => isVisibleBoard(state.board)) ?? boardStates[0]
  }

  function selectBoardState(state: StickerBoardState) {
    const control = state.controlId ? document.getElementById(state.controlId) : null
    if (control instanceof HTMLInputElement && control.type === "radio") {
      control.checked = true
      control.dispatchEvent(new Event("change", { bubbles: true }))
    }
    updateMonthPreview()
  }

  function updateMonthPreview() {
    renderMonthPreview(monthPreview, boardStates, getActiveBoardState(), selectBoardState)
  }

  function renderStateSticker(state: StickerBoardState, sticker: PlacedSticker) {
    renderSticker(
      state.layer,
      state.board,
      state.storageKey,
      sticker,
      state.stickers,
      ownerOnly,
      ownerUnlocked,
      updateMonthPreview,
      (changed) => syncRemoteSticker(state, changed),
      (deleted) => deleteRemoteSticker(deleted),
    )
  }

  function syncLocalState(state: StickerBoardState) {
    savePlacedStickers(state.storageKey, state.stickers)
    updateMonthPreview()
  }

  function syncRemoteSticker(state: StickerBoardState, sticker: PlacedSticker) {
    syncLocalState(state)
    const client = getStickerInteractionsClient()
    if (!client?.enabled || !sticker.remote || !canEditSticker(sticker, ownerOnly, ownerUnlocked)) {
      return
    }

    client.updateSticker(sticker.id, remoteStickerPayload(state, sticker), ownerRequestOptions()).catch((error) => {
      console.warn("[StickerWall] Failed to update shared sticker", error)
    })
  }

  function deleteRemoteSticker(sticker: PlacedSticker) {
    const client = getStickerInteractionsClient()
    if (!client?.enabled || !sticker.remote || !canEditSticker(sticker, ownerOnly, ownerUnlocked)) {
      return
    }

    client.deleteSticker(sticker.id, ownerRequestOptions()).catch((error) => {
      console.warn("[StickerWall] Failed to delete shared sticker", error)
    })
  }

  function replaceStateStickers(state: StickerBoardState, nextStickers: PlacedSticker[]) {
    state.stickers.splice(0, state.stickers.length, ...nextStickers)
    state.layer.innerHTML = ""
    state.stickers.forEach((sticker) => renderStateSticker(state, sticker))
    syncLocalState(state)
  }

  async function loadRemoteStickers(state: StickerBoardState) {
    const client = getStickerInteractionsClient()
    if (!client?.enabled) {
      return
    }

    try {
      const remoteStickers = await client.listStickers(state.key)
      replaceStateStickers(state, remoteStickers.map(normalizeRemoteSticker))
    } catch (error) {
      console.warn("[StickerWall] Failed to load shared stickers", error)
    }
  }

  function addSticker(asset: StickerAsset, x?: number, y?: number, state = getActiveBoardState()) {
    if (!hasOwnerAccess()) {
      return
    }

    const sticker = makeSticker(asset, x, y)
    state.stickers.push(sticker)
    renderStateSticker(state, sticker)
    syncLocalState(state)

    const client = getStickerInteractionsClient()
    if (client?.enabled && canShareAsset(asset)) {
      sticker.remote = true
      client
        .createSticker(remoteStickerPayload(state, sticker), ownerRequestOptions())
        .then((remoteSticker) => {
          if (remoteSticker) {
            Object.assign(sticker, normalizeRemoteSticker(remoteSticker))
            syncLocalState(state)
          }
        })
        .catch((error) => {
          sticker.remote = false
          console.warn("[StickerWall] Failed to create shared sticker", error)
        })
    }
  }

  function getAvailableAssets() {
    if (selectedCategory === "uploaded") {
      return uploadedAssets
    }

    if (selectedCategory === "all") {
      return [...baseAssets, ...uploadedAssets]
    }

    return baseAssets.filter((asset) => getAssetCategory(asset) === selectedCategory)
  }

  function updateCategoryFilter() {
    if (selectedCategory === "uploaded" && uploadedAssets.length === 0) {
      selectedCategory = "all"
    }

    const hasSelectedBaseAssets =
      selectedCategory === "all" ||
      selectedCategory === "uploaded" ||
      baseAssets.some((asset) => getAssetCategory(asset) === selectedCategory)

    if (!hasSelectedBaseAssets) {
      selectedCategory = "all"
    }

    renderCategoryFilter(categoryFilter, baseAssets, uploadedAssets, selectedCategory, (category) => {
      selectedCategory = category
      updateCategoryFilter()
    })
  }

  function addRandomSticker(x?: number, y?: number, state = getActiveBoardState()) {
    const assets = getAvailableAssets()
    const asset = assets[Math.floor(Math.random() * assets.length)]
    if (!asset) {
      return
    }

    addSticker(asset, x, y, state)
  }

  updateCategoryFilter()
  updateMonthPreview()
  renderUploadStage(stage, storageKey, uploadedAssets, addSticker, updateCategoryFilter, hasOwnerAccess)
  boardStates.forEach((state) => {
    void loadRemoteStickers(state)
  })
  addButton.addEventListener("click", () => {
    if (hasOwnerAccess()) {
      addRandomSticker()
    }
  })

  burstButton.addEventListener("click", () => {
    if (!hasOwnerAccess()) {
      return
    }

    for (let index = 0; index < 8; index += 1) {
      addRandomSticker()
    }
  })

  clearButton.addEventListener("click", () => {
    if (!hasOwnerAccess()) {
      return
    }

    const state = getActiveBoardState()
    const removed = state.stickers.filter((sticker) => canEditSticker(sticker, ownerOnly, ownerUnlocked))
    const kept = state.stickers.filter((sticker) => !canEditSticker(sticker, ownerOnly, ownerUnlocked))
    replaceStateStickers(state, kept)
    removed.forEach(deleteRemoteSticker)
  })

  clearUploadsButton?.addEventListener("click", () => {
    if (!hasOwnerAccess()) {
      return
    }

    uploadedAssets.splice(0, uploadedAssets.length)
    saveUploadedAssets(storageKey, uploadedAssets)
    updateCategoryFilter()
    renderUploadStage(stage, storageKey, uploadedAssets, addSticker, updateCategoryFilter, hasOwnerAccess)
  })

  uploadInput?.addEventListener("change", async () => {
    if (!hasOwnerAccess()) {
      uploadInput.value = ""
      return
    }

    const files = [...(uploadInput.files ?? [])]
    const assets = await Promise.all(files.map((file) => readUploadedFile(file)))
    for (const asset of assets) {
      if (asset) {
        uploadedAssets.push(asset)
      }
    }
    saveUploadedAssets(storageKey, uploadedAssets)
    updateCategoryFilter()
    renderUploadStage(stage, storageKey, uploadedAssets, addSticker, updateCategoryFilter, hasOwnerAccess)
    uploadInput.value = ""
  })

  root.querySelectorAll<HTMLInputElement>(".couple-month-toggle").forEach((control) => {
    control.addEventListener("change", updateMonthPreview)
  })

  boardStates.forEach((state) => {
    state.board.addEventListener("dblclick", (event) => {
      if (!hasOwnerAccess()) {
        return
      }

      if (event.target !== state.board) {
        return
      }

      const rect = state.board.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * 100
      const y = ((event.clientY - rect.top) / rect.height) * 100
      addRandomSticker(x, y, state)
    })
  })
}

function initStickerWalls() {
  document.querySelectorAll<HTMLElement>("[data-sticker-wall]").forEach((root) => initStickerWall(root))
}

document.addEventListener("nav", initStickerWalls)
new MutationObserver(initStickerWalls).observe(document.body, { childList: true, subtree: true })
initStickerWalls()
