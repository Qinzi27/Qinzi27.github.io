type CouplePlanAsset = {
  name: string
  src: string
  category?: string
  categoryLabel?: string
  pack?: string
}

type CouplePlan = {
  id: string
  boardKey: string
  title: string
  scheduledDate?: string
  person?: string
  planStatus: "planned" | "in-progress" | "done"
  notes?: string
  asset?: CouplePlanAsset | null
  createdAt?: string
  updatedAt?: string
}

type CouplePlanInteractionsClient = {
  enabled: boolean
  calendarAccess: () => boolean
  listPlans: (boardKey: string) => Promise<CouplePlan[]>
  createPlan: (payload: Record<string, unknown>) => Promise<CouplePlan | null>
  updatePlan: (id: string, payload: Record<string, unknown>) => Promise<CouplePlan | null>
  deletePlan: (id: string) => Promise<void>
}

const planStatusLabels: Record<CouplePlan["planStatus"], string> = {
  planned: "计划中",
  "in-progress": "进行中",
  done: "已完成",
}
const planAssetPageSize = 48

function getCouplePlanClient() {
  return (window as Window & { QinziInteractions?: CouplePlanInteractionsClient }).QinziInteractions
}

function readCouplePlanAssets(root: HTMLElement): CouplePlanAsset[] {
  const marker = root.querySelector<HTMLScriptElement>("script[data-plan-assets]")
  if (!marker?.textContent) {
    return []
  }

  try {
    const parsed = JSON.parse(marker.textContent) as CouplePlanAsset[]
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((asset) => typeof asset.name === "string" && typeof asset.src === "string")
  } catch {
    return []
  }
}

function couplePlanDateLabel(value?: string) {
  if (!value) {
    return "日期待定"
  }

  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) {
    return value
  }
  return `${year}年${month}月${day}日`
}

function compareCouplePlans(left: CouplePlan, right: CouplePlan) {
  if (left.planStatus === "done" && right.planStatus !== "done") {
    return 1
  }
  if (left.planStatus !== "done" && right.planStatus === "done") {
    return -1
  }

  const leftDate = left.scheduledDate || "9999-12-31"
  const rightDate = right.scheduledDate || "9999-12-31"
  return (
    leftDate.localeCompare(rightDate) || (left.createdAt ?? "").localeCompare(right.createdAt ?? "")
  )
}

function initCouplePlanner(root: HTMLElement) {
  if (root.dataset.couplePlannerInitialized === "true") {
    return
  }

  const form = root.querySelector<HTMLFormElement>("[data-plan-form]")
  const list = root.querySelector<HTMLElement>("[data-plan-list]")
  const titleInput = root.querySelector<HTMLInputElement>("[data-plan-title]")
  const dateInput = root.querySelector<HTMLInputElement>("[data-plan-date]")
  const personInput = root.querySelector<HTMLInputElement>("[data-plan-person]")
  const statusInput = root.querySelector<HTMLSelectElement>("[data-plan-status]")
  const notesInput = root.querySelector<HTMLTextAreaElement>("[data-plan-notes]")
  const idInput = root.querySelector<HTMLInputElement>("[data-plan-id]")
  const saveButton = root.querySelector<HTMLButtonElement>("[data-plan-save]")
  const formStatus = root.querySelector<HTMLElement>("[data-plan-form-status]")
  const assetSearch = root.querySelector<HTMLInputElement>("[data-plan-asset-search]")
  const assetCategory = root.querySelector<HTMLSelectElement>("[data-plan-asset-category]")
  const assetGrid = root.querySelector<HTMLElement>("[data-plan-asset-grid]")
  const assetMore = root.querySelector<HTMLButtonElement>("[data-plan-asset-more]")
  const selectedAssetView = root.querySelector<HTMLElement>("[data-plan-selected-asset]")
  const boardKey = root.dataset.planBoardKey?.trim() || "our-plans"

  if (
    !form ||
    !list ||
    !titleInput ||
    !dateInput ||
    !personInput ||
    !statusInput ||
    !notesInput ||
    !idInput ||
    !saveButton ||
    !formStatus ||
    !assetSearch ||
    !assetCategory ||
    !assetGrid ||
    !selectedAssetView
  ) {
    return
  }

  root.dataset.couplePlannerInitialized = "true"
  const assets = readCouplePlanAssets(root)
  let plans: CouplePlan[] = []
  let selectedAsset: CouplePlanAsset | null = null
  let activeFilter = "active"
  let visibleAssetCount = planAssetPageSize

  const setFormStatus = (message = "", isError = false) => {
    formStatus.textContent = message
    formStatus.classList.toggle("is-error", isError)
  }

  const renderSelectedAsset = () => {
    selectedAssetView.replaceChildren()
    if (!selectedAsset) {
      const empty = document.createElement("span")
      empty.textContent = "尚未选择图片"
      selectedAssetView.append(empty)
      selectedAssetView.classList.remove("has-asset")
      return
    }

    const image = document.createElement("img")
    image.src = selectedAsset.src
    image.alt = selectedAsset.name
    image.loading = "lazy"

    const label = document.createElement("span")
    label.textContent = `${selectedAsset.name} · ${selectedAsset.categoryLabel || selectedAsset.pack || "素材库"}`
    selectedAssetView.append(image, label)
    selectedAssetView.classList.add("has-asset")
  }

  const filteredAssets = () => {
    const query = assetSearch.value.trim().toLowerCase()
    const category = assetCategory.value
    return assets.filter((asset) => {
      const matchesCategory = category === "all" || (asset.category || asset.pack) === category
      const searchable = [asset.name, asset.category, asset.categoryLabel, asset.pack]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return matchesCategory && (!query || searchable.includes(query))
    })
  }

  const renderAssets = () => {
    const matches = filteredAssets()
    const visible = matches.slice(0, visibleAssetCount)
    assetGrid.replaceChildren()

    if (visible.length === 0) {
      const empty = document.createElement("p")
      empty.className = "couple-plan-empty"
      empty.textContent = "没有找到符合条件的素材。"
      assetGrid.append(empty)
    } else {
      visible.forEach((asset) => {
        const button = document.createElement("button")
        button.type = "button"
        button.className = "couple-plan-asset"
        button.title = asset.name
        button.setAttribute("aria-label", `选择图片 ${asset.name}`)
        button.classList.toggle("is-selected", selectedAsset?.src === asset.src)

        const image = document.createElement("img")
        image.src = asset.src
        image.alt = asset.name
        image.loading = "lazy"
        image.decoding = "async"
        button.append(image)
        button.addEventListener("click", () => {
          selectedAsset = asset
          renderSelectedAsset()
          renderAssets()
        })
        assetGrid.append(button)
      })
    }

    if (assetMore) {
      assetMore.hidden = visible.length >= matches.length
      assetMore.textContent = `显示更多素材（还有 ${Math.max(0, matches.length - visible.length)} 张）`
    }
  }

  const populateAssetCategories = () => {
    const categories = new Map<string, string>()
    assets.forEach((asset) => {
      const key = asset.category || asset.pack || "uncategorized"
      categories.set(key, asset.categoryLabel || asset.pack || "未分类")
    })
    ;[...categories.entries()]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .forEach(([value, label]) => {
        const option = document.createElement("option")
        option.value = value
        option.textContent = label
        assetCategory.append(option)
      })
  }

  const resetForm = () => {
    form.reset()
    idInput.value = ""
    statusInput.value = "planned"
    selectedAsset = null
    renderSelectedAsset()
    renderAssets()
    setFormStatus()
    titleInput.focus()
  }

  const startEditing = (plan: CouplePlan) => {
    idInput.value = plan.id
    titleInput.value = plan.title
    dateInput.value = plan.scheduledDate ?? ""
    personInput.value = plan.person ?? ""
    statusInput.value = plan.planStatus
    notesInput.value = plan.notes ?? ""
    selectedAsset = plan.asset?.src ? plan.asset : null
    renderSelectedAsset()
    renderAssets()
    setFormStatus("正在编辑已有计划。")
    form.scrollIntoView({ behavior: "smooth", block: "start" })
    titleInput.focus()
  }

  const planMatchesFilter = (plan: CouplePlan) => {
    if (activeFilter === "done") {
      return plan.planStatus === "done"
    }
    if (activeFilter === "active") {
      return plan.planStatus !== "done"
    }
    return true
  }

  const makePlanCard = (plan: CouplePlan) => {
    const card = document.createElement("article")
    card.className = `couple-plan-card is-${plan.planStatus}`

    if (plan.asset?.src) {
      const figure = document.createElement("button")
      figure.type = "button"
      figure.className = "couple-plan-card-image"
      figure.title = "查看大图"

      const image = document.createElement("img")
      image.src = plan.asset.src
      image.alt = plan.asset.name || plan.title
      image.loading = "lazy"
      figure.append(image)
      figure.addEventListener("click", () =>
        window.open(plan.asset?.src, "_blank", "noopener,noreferrer"),
      )
      card.append(figure)
    }

    const body = document.createElement("div")
    body.className = "couple-plan-card-body"

    const meta = document.createElement("div")
    meta.className = "couple-plan-card-meta"
    const status = document.createElement("span")
    status.className = "couple-plan-status"
    status.textContent = planStatusLabels[plan.planStatus]
    const date = document.createElement("time")
    date.dateTime = plan.scheduledDate ?? ""
    date.textContent = couplePlanDateLabel(plan.scheduledDate)
    meta.append(status, date)
    if (plan.person) {
      const person = document.createElement("span")
      person.textContent = plan.person
      meta.append(person)
    }

    const heading = document.createElement("h3")
    heading.textContent = plan.title
    body.append(meta, heading)

    if (plan.notes) {
      const notes = document.createElement("p")
      notes.className = "couple-plan-card-notes"
      notes.textContent = plan.notes
      body.append(notes)
    }

    const actions = document.createElement("div")
    actions.className = "couple-plan-card-actions"
    const editButton = document.createElement("button")
    editButton.type = "button"
    editButton.textContent = "编辑"
    editButton.addEventListener("click", () => startEditing(plan))

    const toggleButton = document.createElement("button")
    toggleButton.type = "button"
    toggleButton.textContent = plan.planStatus === "done" ? "恢复为计划中" : "标记完成"
    toggleButton.addEventListener("click", async () => {
      const client = getCouplePlanClient()
      if (!client?.enabled) {
        setFormStatus("共享服务未配置，无法更新计划。", true)
        return
      }
      toggleButton.disabled = true
      try {
        await client.updatePlan(plan.id, {
          ...plan,
          status: plan.planStatus === "done" ? "planned" : "done",
        })
        await loadPlans()
      } catch (error) {
        console.warn("[CouplePlanner] Failed to update plan status", error)
        setFormStatus("更新失败，请重新输入密码解锁后再试。", true)
      } finally {
        toggleButton.disabled = false
      }
    })

    const deleteButton = document.createElement("button")
    deleteButton.type = "button"
    deleteButton.className = "is-danger"
    deleteButton.textContent = "删除"
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm(`确定删除“${plan.title}”吗？此操作会同时影响两个人看到的计划。`)) {
        return
      }
      const client = getCouplePlanClient()
      if (!client?.enabled) {
        setFormStatus("共享服务未配置，无法删除计划。", true)
        return
      }
      deleteButton.disabled = true
      try {
        await client.deletePlan(plan.id)
        if (idInput.value === plan.id) {
          resetForm()
        }
        await loadPlans()
      } catch (error) {
        console.warn("[CouplePlanner] Failed to delete plan", error)
        setFormStatus("删除失败，请重新输入密码解锁后再试。", true)
      } finally {
        deleteButton.disabled = false
      }
    })

    actions.append(editButton, toggleButton, deleteButton)
    body.append(actions)
    card.append(body)
    return card
  }

  const renderPlans = () => {
    list.replaceChildren()
    const visiblePlans = plans.filter(planMatchesFilter).sort(compareCouplePlans)
    if (visiblePlans.length === 0) {
      const empty = document.createElement("p")
      empty.className = "couple-plan-empty"
      empty.textContent =
        activeFilter === "active"
          ? "还没有待完成计划，先记录一件想一起做的事吧。"
          : "这里暂时没有计划。"
      list.append(empty)
      return
    }
    visiblePlans.forEach((plan) => list.append(makePlanCard(plan)))
  }

  const loadPlans = async () => {
    const client = getCouplePlanClient()
    if (!client?.enabled) {
      list.innerHTML = '<p class="couple-plan-empty">共享服务尚未配置。</p>'
      return
    }
    if (!client.calendarAccess()) {
      list.innerHTML = '<p class="couple-plan-empty">请先输入和日历相同的密码解锁页面。</p>'
      return
    }

    root.classList.add("is-loading")
    try {
      plans = await client.listPlans(boardKey)
      renderPlans()
    } catch (error) {
      console.warn("[CouplePlanner] Failed to load plans", error)
      list.innerHTML =
        '<p class="couple-plan-empty is-error">共同计划载入失败，请刷新并重新输入密码。</p>'
    } finally {
      root.classList.remove("is-loading")
    }
  }

  populateAssetCategories()
  renderSelectedAsset()
  renderAssets()

  assetSearch.addEventListener("input", () => {
    visibleAssetCount = planAssetPageSize
    renderAssets()
  })
  assetCategory.addEventListener("change", () => {
    visibleAssetCount = planAssetPageSize
    renderAssets()
  })
  assetMore?.addEventListener("click", () => {
    visibleAssetCount += planAssetPageSize
    renderAssets()
  })
  root.querySelector("[data-plan-asset-clear]")?.addEventListener("click", () => {
    selectedAsset = null
    renderSelectedAsset()
    renderAssets()
  })
  root.querySelector("[data-plan-reset]")?.addEventListener("click", resetForm)

  root.querySelectorAll<HTMLButtonElement>("[data-plan-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.planFilter ?? "active"
      root
        .querySelectorAll("[data-plan-filter]")
        .forEach((item) => item.classList.remove("is-active"))
      button.classList.add("is-active")
      renderPlans()
    })
  })

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    const client = getCouplePlanClient()
    if (!client?.enabled || !client.calendarAccess()) {
      setFormStatus("请先输入和日历相同的密码解锁页面。", true)
      return
    }

    const payload = {
      boardKey,
      title: titleInput.value.trim(),
      scheduledDate: dateInput.value,
      person: personInput.value.trim(),
      status: statusInput.value,
      notes: notesInput.value.trim(),
      asset: selectedAsset,
    }

    saveButton.disabled = true
    setFormStatus("保存中…")
    try {
      if (idInput.value) {
        await client.updatePlan(idInput.value, payload)
      } else {
        await client.createPlan(payload)
      }
      resetForm()
      await loadPlans()
      setFormStatus("已保存，两个人刷新页面后都会看到。")
    } catch (error) {
      console.warn("[CouplePlanner] Failed to save plan", error)
      setFormStatus("保存失败，请重新输入密码解锁后再试。", true)
    } finally {
      saveButton.disabled = false
    }
  })

  const handleCalendarAccess = () => void loadPlans()
  document.addEventListener("qinzi-calendar-access-changed", handleCalendarAccess)
  window.addCleanup(() =>
    document.removeEventListener("qinzi-calendar-access-changed", handleCalendarAccess),
  )
  void loadPlans()
}

function initCouplePlanners() {
  document.querySelectorAll<HTMLElement>("[data-couple-planner]").forEach(initCouplePlanner)
}

document.addEventListener("nav", initCouplePlanners)
new MutationObserver(initCouplePlanners).observe(document.body, {
  childList: true,
  subtree: true,
})
initCouplePlanners()
