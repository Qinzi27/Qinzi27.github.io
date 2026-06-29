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

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function makeSticker(asset: StickerAsset, x?: number, y?: number): PlacedSticker {
  return {
    ...asset,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    x: x ?? randomBetween(8, 78),
    y: y ?? randomBetween(8, 72),
    size: randomBetween(66, 112),
    rotation: randomBetween(-12, 12),
  }
}

function renderSticker(
  layer: HTMLElement,
  bounds: HTMLElement,
  storageKey: string,
  sticker: PlacedSticker,
  stickers: PlacedSticker[],
) {
  const item = document.createElement("button")
  item.type = "button"
  item.className = "sticker-wall-item"
  item.dataset.stickerId = sticker.id
  item.ariaLabel = sticker.name
  item.style.left = `${sticker.x}%`
  item.style.top = `${sticker.y}%`
  item.style.width = `${sticker.size}px`
  item.style.transform = `rotate(${sticker.rotation}deg)`

  const image = document.createElement("img")
  image.src = sticker.src
  image.alt = sticker.name
  image.loading = "lazy"
  image.decoding = "async"
  item.append(image)
  layer.append(item)

  let activePointer: number | null = null

  item.addEventListener("pointerdown", (event) => {
    activePointer = event.pointerId
    item.setPointerCapture(activePointer)
    item.classList.add("is-dragging")
  })

  item.addEventListener("pointermove", (event) => {
    if (activePointer !== event.pointerId) {
      return
    }

    const rect = bounds.getBoundingClientRect()
    sticker.x = Math.max(0, Math.min(92, ((event.clientX - rect.left) / rect.width) * 100))
    sticker.y = Math.max(0, Math.min(88, ((event.clientY - rect.top) / rect.height) * 100))
    item.style.left = `${sticker.x}%`
    item.style.top = `${sticker.y}%`
  })

  item.addEventListener("pointerup", (event) => {
    if (activePointer !== event.pointerId) {
      return
    }

    activePointer = null
    item.classList.remove("is-dragging")
    savePlacedStickers(storageKey, stickers)
  })

  item.addEventListener("dblclick", () => {
    const index = stickers.findIndex((current) => current.id === sticker.id)
    if (index >= 0) {
      stickers.splice(index, 1)
      savePlacedStickers(storageKey, stickers)
      item.remove()
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

function renderUploadStage(
  stage: HTMLElement | null,
  storageKey: string,
  uploadedAssets: StickerAsset[],
  addSticker: (asset: StickerAsset) => void,
  onUploadedAssetsChanged?: () => void,
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

    item.addEventListener("click", () => addSticker(asset))
    item.addEventListener("dblclick", () => {
      const index = uploadedAssets.findIndex((current) => current.src === asset.src)
      if (index >= 0) {
        uploadedAssets.splice(index, 1)
        saveUploadedAssets(storageKey, uploadedAssets)
        onUploadedAssetsChanged?.()
        renderUploadStage(stage, storageKey, uploadedAssets, addSticker, onUploadedAssetsChanged)
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

  const board = root.querySelector<HTMLElement>("[data-sticker-board]")
  const addButton = root.querySelector<HTMLButtonElement>("[data-sticker-add]")
  const burstButton = root.querySelector<HTMLButtonElement>("[data-sticker-burst]")
  const clearButton = root.querySelector<HTMLButtonElement>("[data-sticker-clear]")
  const clearUploadsButton = root.querySelector<HTMLButtonElement>("[data-sticker-clear-uploads]")
  const uploadInput = root.querySelector<HTMLInputElement>("[data-sticker-upload]")
  const stage = root.querySelector<HTMLElement>("[data-sticker-stage]")
  const categoryFilter = root.querySelector<HTMLElement>("[data-sticker-categories]")
  const storageKey = getStorageKey(root)
  const baseAssets = readStickerAssets(root)
  const uploadedAssets = readUploadedAssets(storageKey)
  const stickers = readPlacedStickers(storageKey)
  let selectedCategory = "all"

  if (!board || !addButton || !burstButton || !clearButton || baseAssets.length === 0) {
    return
  }

  const stickerBoard = board
  const stickerLayer = getStickerLayer(stickerBoard)
  root.dataset.stickerInitialized = "true"
  stickerLayer.innerHTML = ""
  stickers.forEach((sticker) => renderSticker(stickerLayer, stickerBoard, storageKey, sticker, stickers))

  function addSticker(asset: StickerAsset, x?: number, y?: number) {
    const sticker = makeSticker(asset, x, y)
    stickers.push(sticker)
    renderSticker(stickerLayer, stickerBoard, storageKey, sticker, stickers)
    savePlacedStickers(storageKey, stickers)
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

  function addRandomSticker(x?: number, y?: number) {
    const assets = getAvailableAssets()
    const asset = assets[Math.floor(Math.random() * assets.length)]
    if (!asset) {
      return
    }

    addSticker(asset, x, y)
  }

  updateCategoryFilter()
  renderUploadStage(stage, storageKey, uploadedAssets, addSticker, updateCategoryFilter)
  addButton.addEventListener("click", () => addRandomSticker())

  burstButton.addEventListener("click", () => {
    for (let index = 0; index < 8; index += 1) {
      addRandomSticker()
    }
  })

  clearButton.addEventListener("click", () => {
    stickers.splice(0, stickers.length)
    savePlacedStickers(storageKey, stickers)
    stickerLayer.innerHTML = ""
  })

  clearUploadsButton?.addEventListener("click", () => {
    uploadedAssets.splice(0, uploadedAssets.length)
    saveUploadedAssets(storageKey, uploadedAssets)
    updateCategoryFilter()
    renderUploadStage(stage, storageKey, uploadedAssets, addSticker, updateCategoryFilter)
  })

  uploadInput?.addEventListener("change", async () => {
    const files = [...(uploadInput.files ?? [])]
    const assets = await Promise.all(files.map((file) => readUploadedFile(file)))
    for (const asset of assets) {
      if (asset) {
        uploadedAssets.push(asset)
      }
    }
    saveUploadedAssets(storageKey, uploadedAssets)
    updateCategoryFilter()
    renderUploadStage(stage, storageKey, uploadedAssets, addSticker, updateCategoryFilter)
    uploadInput.value = ""
  })

  stickerBoard.addEventListener("dblclick", (event) => {
    if (event.target !== stickerBoard) {
      return
    }

    const rect = stickerBoard.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    addRandomSticker(x, y)
  })
}

function initStickerWalls() {
  document.querySelectorAll<HTMLElement>("[data-sticker-wall]").forEach((root) => initStickerWall(root))
}

document.addEventListener("nav", initStickerWalls)
new MutationObserver(initStickerWalls).observe(document.body, { childList: true, subtree: true })
initStickerWalls()
