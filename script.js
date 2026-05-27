/**
 * TaskTile — Premium Skeuomorphic To-Do App
 */

const STORAGE_KEY = "tasktile-tasks";
const THEME_KEY = "tasktile-theme";
const VALID_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

(function applyThemeBeforePaint() {
  // Always start in light mode: ignore any previously stored theme value.
  document.documentElement.classList.remove("dark");
})();

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** @typedef {{ id: string, text: string, completed: boolean, createdAt: number, dueDate?: string }} Task */

/** @type {Task[]} */
let tasks = [];
let currentFilter = "all";
let dragSrcId = null;
let editingTaskId = null;
let hasInitialized = false;
let savedTasksSnapshot = "[]";

let taskForm;
let taskInput;
let taskDateInput;
let taskList;
let emptyState;
let remainingCount;
let clearCompletedBtn;
let themeToggle;
let themeIcon;
let tabIndicator;
let filterTabs;
let validationPopup;
let popupBackdrop;
let popupPanel;
let popupMessage;
let popupCloseBtn;
let popupOkBtn;

let popupCloseHandler = null;
let saveTimer = null;
let pendingSave = false;
const CLICK_THROTTLE_MS = 150;
const actionThrottleMap = new Map();

// ─── Init ───────────────────────────────────────────────────────────────────

function cacheDomRefs() {
  taskForm = document.getElementById("task-form");
  taskInput = document.getElementById("task-input");
  taskDateInput = document.getElementById("task-date");
  taskList = document.getElementById("task-list");
  emptyState = document.getElementById("empty-state");
  remainingCount = document.getElementById("remaining-count");
  clearCompletedBtn = document.getElementById("clear-completed");
  themeToggle = document.getElementById("theme-toggle");
  themeIcon = document.getElementById("theme-icon");
  tabIndicator = document.getElementById("tab-indicator");
  filterTabs = document.querySelectorAll(".filter-tab");
  validationPopup = document.getElementById("validation-popup");
  popupBackdrop = document.getElementById("popup-backdrop");
  popupPanel = document.getElementById("popup-panel");
  popupMessage = document.getElementById("popup-message");
  popupCloseBtn = document.getElementById("popup-close");
  popupOkBtn = document.getElementById("popup-ok");
}

function init() {
  if (hasInitialized) return;
  hasInitialized = true;
  cacheDomRefs();
  loadTasks();
  applySavedTheme();
  bindEvents();
  render();
  requestAnimationFrame(updateTabIndicator);
}

function bindEvents() {
  taskForm.addEventListener("submit", handleAddTask);
  document.addEventListener("click", handleGlobalClick, { passive: false });
  window.addEventListener("resize", updateTabIndicator);
  document.addEventListener("visibilitychange", flushPendingSaveOnHidden);
  window.addEventListener("beforeunload", flushPendingSaveSync);
  initPopup();
  bindTaskListEvents();
}

// ─── Storage ──────────────────────────────────────────────────────────────

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    tasks = Array.isArray(parsed) ? parsed.map(sanitizeTask).filter(Boolean) : [];
    savedTasksSnapshot = JSON.stringify(tasks);
  } catch {
    tasks = [];
    savedTasksSnapshot = "[]";
  }
}

function saveTasks() {
  pendingSave = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushPendingSave();
  }, 120);
}

function flushPendingSave() {
  if (!pendingSave) return;
  const snapshot = JSON.stringify(tasks);
  if (snapshot === savedTasksSnapshot) {
    pendingSave = false;
    return;
  }
  localStorage.setItem(STORAGE_KEY, snapshot);
  savedTasksSnapshot = snapshot;
  pendingSave = false;
}

function flushPendingSaveOnHidden() {
  if (document.visibilityState !== "hidden") return;
  flushPendingSave();
}

function flushPendingSaveSync() {
  flushPendingSave();
}

// ─── Theme ──────────────────────────────────────────────────────────────────

function applySavedTheme() {
  const isDark = document.documentElement.classList.contains("dark");
  themeIcon.textContent = isDark ? "☀️" : "🌙";
}

function toggleTheme() {
  const root = document.documentElement;
  const isDark = root.classList.toggle("dark");
  themeIcon.textContent = isDark ? "☀️" : "🌙";
  themeToggle.classList.add("is-bumping");
  setTimeout(() => {
    themeToggle.classList.remove("is-bumping");
  }, 150);
}

// ─── Validation popup ───────────────────────────────────────────────────────

function initPopup() {
  // Click delegation handles popup button interactions.
}

function validateTaskForm() {
  return validateTaskValues(sanitizeTaskText(taskInput.value), sanitizeDueDate(taskDateInput.value), taskInput, taskDateInput);
}

function validateTaskValues(text, dueDate, textField, dateField) {
  const hasTask = text.length > 0;
  const hasDate = dueDate.length > 0;

  if (!hasTask && !hasDate) {
    return {
      valid: false,
      message: "Please enter a task and select a date.",
      focus: textField,
    };
  }
  if (!hasTask) {
    return {
      valid: false,
      message: "Please enter a task before adding.",
      focus: textField,
    };
  }
  if (!hasDate) {
    return {
      valid: false,
      message: "Please select a date for your task.",
      focus: dateField,
    };
  }
  return { valid: true };
}

function showPopup(message) {
  popupMessage.textContent = message;
  validationPopup.classList.remove("hidden");
  validationPopup.classList.add("flex");
  validationPopup.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    validationPopup.classList.add("popup-visible");
  });

  if (popupCloseHandler) {
    document.removeEventListener("keydown", popupCloseHandler);
  }
  popupCloseHandler = (e) => {
    if (e.key === "Escape") hidePopup();
  };
  document.addEventListener("keydown", popupCloseHandler);
}

function hidePopup() {
  validationPopup.classList.remove("popup-visible");

  const onHidden = () => {
    validationPopup.classList.add("hidden");
    validationPopup.classList.remove("flex");
    validationPopup.setAttribute("aria-hidden", "true");
    popupPanel.removeEventListener("transitionend", onHidden);
  };

  popupPanel.addEventListener("transitionend", onHidden, { once: true });

  if (popupCloseHandler) {
    document.removeEventListener("keydown", popupCloseHandler);
    popupCloseHandler = null;
  }
}

// ─── Tasks CRUD ─────────────────────────────────────────────────────────────

function handleAddTask(e) {
  e.preventDefault();
  if (editingTaskId) return;

  const validation = validateTaskForm();
  if (!validation.valid) {
    if (validation.focus) {
      validation.focus.focus();
      pulseInput(validation.focus);
    }
    showPopup(validation.message);
    return;
  }

  const text = sanitizeTaskText(taskInput.value);
  const dueDate = sanitizeDueDate(taskDateInput.value);

  const task = {
    id: generateId(),
    text,
    completed: false,
    createdAt: Date.now(),
    dueDate,
  };

  tasks.unshift(task);
  saveTasks();
  taskInput.value = "";
  taskDateInput.value = "";
  addTaskToDom(task);
  syncMetaUi();
}

function pulseInput(el = taskInput) {
  el.classList.add("is-pulsing");
  setTimeout(() => {
    el.classList.remove("is-pulsing");
  }, 120);
}

function toggleComplete(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks();
  patchTaskInDom(id, { animateCheck: true });
  syncMetaUi();
}

function deleteTask(id) {
  const el = taskList.querySelector(`[data-id="${id}"]`);
  let hasCommitted = false;
  const commitDelete = () => {
    if (hasCommitted) return;
    hasCommitted = true;
    const next = tasks.filter((t) => t.id !== id);
    if (next.length === tasks.length) return;
    tasks = next;
    saveTasks();
    editingTaskId = editingTaskId === id ? null : editingTaskId;
    removeTaskElement(id);
    syncMetaUi();
  };

  if (el) {
    el.classList.add("animate-fade-out");
    el.addEventListener("animationend", commitDelete, { once: true });
    setTimeout(commitDelete, 380);
  } else {
    commitDelete();
  }
}

function startEditTask(id) {
  if (editingTaskId && editingTaskId !== id) {
    patchTaskInDom(editingTaskId);
  }
  editingTaskId = id;
  patchTaskInDom(id);
  requestAnimationFrame(() => {
    const editInput = taskList.querySelector(`[data-id="${id}"] [data-action="edit-text"]`);
    editInput?.focus();
  });
}

function cancelEditTask() {
  if (!editingTaskId) return;
  const prev = editingTaskId;
  editingTaskId = null;
  patchTaskInDom(prev);
}

function saveEditedTask(id, textField, dateField) {
  const text = sanitizeTaskText(textField.value);
  const dueDate = sanitizeDueDate(dateField.value);
  const validation = validateTaskValues(text, dueDate, textField, dateField);

  if (!validation.valid) {
    if (validation.focus) {
      validation.focus.focus();
      pulseInput(validation.focus);
    }
    showPopup(validation.message);
    return;
  }

  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  task.text = text;
  task.dueDate = dueDate;
  editingTaskId = null;
  saveTasks();
  patchTaskInDom(id);
  syncMetaUi();
}

function clearCompleted() {
  const completedIds = new Set(tasks.filter((t) => t.completed).map((t) => t.id));
  if (completedIds.size === 0) return;

  const visibleCompletedEls = Array.from(taskList.querySelectorAll(".task-tile.completed"));
  const commit = () => {
    tasks = tasks.filter((t) => !t.completed);
    if (editingTaskId && completedIds.has(editingTaskId)) editingTaskId = null;
    saveTasks();
    visibleCompletedEls.forEach((el) => el.remove());
    syncMetaUi();
  };

  if (visibleCompletedEls.length === 0) {
    commit();
    return;
  }

  let removed = 0;
  let hasCommitted = false;
  const safeCommit = () => {
    if (hasCommitted) return;
    hasCommitted = true;
    commit();
  };
  visibleCompletedEls.forEach((el) => {
    el.classList.add("animate-fade-out");
    el.addEventListener(
      "animationend",
      () => {
        removed++;
        if (removed === visibleCompletedEls.length) safeCommit();
      },
      { once: true }
    );
  });
  setTimeout(safeCommit, 420);
}

// ─── Filter ─────────────────────────────────────────────────────────────────

function setFilter(filter) {
  if (!filter || currentFilter === filter) return;
  currentFilter = filter;
  filterTabs.forEach((tab) => {
    const active = tab.dataset.filter === filter;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  updateTabIndicator();
  render();
}

function updateTabIndicator() {
  const activeTab = document.querySelector(".filter-tab.active");
  if (!activeTab || !tabIndicator.parentElement) return;
  const parent = tabIndicator.parentElement;
  const parentRect = parent.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();
  tabIndicator.style.setProperty(
    "--tab-indicator-left",
    `${tabRect.left - parentRect.left}px`
  );
  tabIndicator.style.setProperty("--tab-indicator-width", `${tabRect.width}px`);
}

function getFilteredTasks() {
  switch (currentFilter) {
    case "active":
      return tasks.filter((t) => !t.completed);
    case "completed":
      return tasks.filter((t) => t.completed);
    default:
      return tasks;
  }
}

// ─── Render ─────────────────────────────────────────────────────────────────

function render() {
  taskList.textContent = "";
  const fragment = document.createDocumentFragment();
  getFilteredTasks().forEach((task) => fragment.appendChild(createTaskElement(task)));
  taskList.appendChild(fragment);
  syncMetaUi();
}

function createTaskElement(task) {
  const li = document.createElement("li");
  li.dataset.id = task.id;
  li.draggable = true;
  li.className = `task-tile flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl ${
    task.completed ? "completed" : ""
  }`;
  li.setAttribute("role", "listitem");

  const dateStr = formatTimestamp(task.createdAt);
  const isEditing = editingTaskId === task.id;
  const dueDateHtml = task.dueDate
    ? `<time class="text-xs text-theme-secondary mt-0.5 block" datetime="${task.dueDate}">${escapeHtml(formatDueDate(task.dueDate))}</time>`
    : "";

  li.innerHTML = `
    <span class="drag-handle text-lg select-none" aria-hidden="true" title="Drag to reorder">⠿</span>
    <button type="button" class="check-toggle ${task.completed ? "checked" : ""}" aria-label="${task.completed ? "Mark incomplete" : "Mark complete"}" data-action="toggle">
      <span class="check-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </span>
    </button>
    <div class="flex-1 min-w-0 ${isEditing ? "space-y-2" : ""}">
      ${
        isEditing
          ? `
        <input
          type="text"
          data-action="edit-text"
          class="skeuo-input w-full rounded-xl px-3 py-2.5 text-sm sm:text-base font-medium"
          maxlength="200"
          value="${escapeHtml(task.text)}"
        />
        <input
          type="date"
          data-action="edit-date"
          class="skeuo-input skeuo-date w-full rounded-xl px-3 py-2.5 text-xs sm:text-sm font-medium text-theme-secondary"
          value="${task.dueDate || ""}"
        />
      `
          : `
        <p class="task-text text-sm sm:text-base font-medium text-theme-primary truncate ${task.completed ? "completed" : ""}">${escapeHtml(task.text)}</p>
        ${dueDateHtml}
      `
      }
      <time class="text-xs text-theme-muted ${isEditing ? "" : "mt-0.5"} block" datetime="${new Date(task.createdAt).toISOString()}">${dateStr}</time>
    </div>
    ${
      isEditing
        ? `
      <button type="button" class="delete-btn" aria-label="Save task" data-action="save" title="Save">✔</button>
      <button type="button" class="delete-btn" aria-label="Cancel edit" data-action="cancel" title="Cancel">✖</button>
    `
        : `
      <button type="button" class="delete-btn" aria-label="Edit task" data-action="edit" title="Edit">
        <i class="fa-solid fa-pen"></i>
      </button>
    `
    }
    <button type="button" class="delete-btn" aria-label="Delete task" data-action="delete">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
    </button>
  `;
  return li;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDueDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today · ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return `Yesterday · ${time}`;

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Drag & Drop ────────────────────────────────────────────────────────────

function reorderTasks(srcId, targetId) {
  const srcIndex = tasks.findIndex((t) => t.id === srcId);
  const targetIndex = tasks.findIndex((t) => t.id === targetId);
  if (srcIndex === -1 || targetIndex === -1) return;

  const [moved] = tasks.splice(srcIndex, 1);
  tasks.splice(targetIndex, 0, moved);
  saveTasks();
  render();
}

// ─── Delegated list events ──────────────────────────────────────────────────

function bindTaskListEvents() {
  taskList.addEventListener("keydown", handleTaskListKeydown);
  taskList.addEventListener("dragstart", handleTaskDragStart);
  taskList.addEventListener("dragend", handleTaskDragEnd);
  taskList.addEventListener("dragover", handleTaskDragOver);
  taskList.addEventListener("dragleave", handleTaskDragLeave);
  taskList.addEventListener("drop", handleTaskDrop);
}

function handleGlobalClick(e) {
  const popupDismiss = e.target.closest("#popup-backdrop, #popup-close, #popup-ok");
  if (popupDismiss) {
    if (!consumeThrottledClick("popup-close")) return;
    hidePopup();
    return;
  }

  const clickedButton = e.target.closest("button");
  if (!clickedButton) return;

  if (clickedButton.matches("#theme-toggle")) {
    if (!consumeThrottledClick("theme-toggle")) return;
    toggleTheme();
    return;
  }

  if (clickedButton.matches("#clear-completed")) {
    if (!consumeThrottledClick("clear-completed")) return;
    clearCompleted();
    return;
  }

  if (clickedButton.matches(".filter-tab")) {
    const filter = clickedButton.dataset.filter;
    if (!filter || !consumeThrottledClick(`filter-${filter}`)) return;
    setFilter(filter);
    return;
  }

  const actionEl = clickedButton.closest("[data-action]");
  if (!actionEl || !taskList.contains(actionEl)) return;
  handleTaskActionClick(actionEl);
}

function consumeThrottledClick(actionKey) {
  const now = performance.now();
  const last = actionThrottleMap.get(actionKey) ?? -Infinity;
  if (now - last < CLICK_THROTTLE_MS) return false;
  actionThrottleMap.set(actionKey, now);
  return true;
}

function handleTaskActionClick(actionEl) {
  const tile = actionEl.closest("[data-id]");
  const id = tile?.dataset.id;
  if (!id) return;

  const action = actionEl.dataset.action;
  if (!consumeThrottledClick(`${action}:${id}`)) return;
  if (action === "toggle") {
    toggleComplete(id);
    return;
  }
  if (action === "delete") {
    deleteTask(id);
    return;
  }
  if (action === "edit") {
    startEditTask(id);
    return;
  }
  if (action === "cancel") {
    cancelEditTask();
    return;
  }
  if (action === "save") {
    const textField = tile.querySelector('[data-action="edit-text"]');
    const dateField = tile.querySelector('[data-action="edit-date"]');
    if (!textField || !dateField) return;
    saveEditedTask(id, textField, dateField);
  }
}

function handleTaskListKeydown(e) {
  const tile = e.target.closest("[data-id]");
  if (!tile) return;
  const id = tile.dataset.id;
  if (!id) return;

  const inEditText = e.target.matches('[data-action="edit-text"]');
  const inEditDate = e.target.matches('[data-action="edit-date"]');
  if (!inEditText && !inEditDate) return;

  if (e.key === "Enter") {
    e.preventDefault();
    const textField = tile.querySelector('[data-action="edit-text"]');
    const dateField = tile.querySelector('[data-action="edit-date"]');
    if (!textField || !dateField) return;
    saveEditedTask(id, textField, dateField);
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelEditTask();
  }
}

function handleTaskDragStart(e) {
  const tile = e.target.closest(".task-tile[data-id]");
  if (!tile || !taskList.contains(tile)) return;

  dragSrcId = tile.dataset.id || null;
  tile.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  if (dragSrcId) e.dataTransfer.setData("text/plain", dragSrcId);
  setTimeout(() => tile.classList.add("opacity-60"), 0);
}

function handleTaskDragEnd(e) {
  const tile = e.target.closest(".task-tile[data-id]");
  if (tile) tile.classList.remove("dragging", "opacity-60");
  dragSrcId = null;
  clearDragOverState();
}

function handleTaskDragOver(e) {
  const tile = e.target.closest(".task-tile[data-id]");
  if (!tile || !taskList.contains(tile)) return;

  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (dragSrcId && dragSrcId !== tile.dataset.id) {
    tile.classList.add("drag-over");
  }
}

function handleTaskDragLeave(e) {
  const tile = e.target.closest(".task-tile[data-id]");
  if (!tile || !taskList.contains(tile)) return;
  tile.classList.remove("drag-over");
}

function handleTaskDrop(e) {
  const tile = e.target.closest(".task-tile[data-id]");
  if (!tile || !taskList.contains(tile)) return;

  e.preventDefault();
  tile.classList.remove("drag-over");
  const srcId = e.dataTransfer.getData("text/plain") || dragSrcId;
  const targetId = tile.dataset.id;
  if (!srcId || !targetId || srcId === targetId) return;
  reorderTasks(srcId, targetId);
}

function clearDragOverState() {
  taskList.querySelectorAll(".task-tile.drag-over").forEach((t) => {
    t.classList.remove("drag-over");
  });
}

// ─── Targeted DOM updates ───────────────────────────────────────────────────

function addTaskToDom(task) {
  if (!shouldRenderTask(task)) return;
  const li = createTaskElement(task);
  taskList.prepend(li);
  li.classList.add("animate-slide-in");
}

function removeTaskElement(id) {
  const el = taskList.querySelector(`[data-id="${id}"]`);
  if (el) el.remove();
}

function patchTaskInDom(id, opts = {}) {
  const task = tasks.find((t) => t.id === id);
  const existing = taskList.querySelector(`[data-id="${id}"]`);

  if (!task) {
    if (existing) existing.remove();
    return;
  }

  if (!shouldRenderTask(task)) {
    if (existing) existing.remove();
    return;
  }

  const nextEl = createTaskElement(task);
  if (existing) {
    existing.replaceWith(nextEl);
  } else {
    insertTaskByCurrentOrder(nextEl, id);
  }

  if (opts.animateCheck) {
    const check = nextEl.querySelector(".check-toggle");
    if (check) {
      check.classList.add("animate-check-pop");
      setTimeout(() => check.classList.remove("animate-check-pop"), 400);
    }
  }
}

function insertTaskByCurrentOrder(el, id) {
  const orderedVisibleIds = getFilteredTasks().map((t) => t.id);
  const currentIndex = orderedVisibleIds.indexOf(id);
  if (currentIndex <= 0) {
    taskList.prepend(el);
    return;
  }

  const prevVisibleId = orderedVisibleIds[currentIndex - 1];
  const prevEl = taskList.querySelector(`[data-id="${prevVisibleId}"]`);
  if (prevEl?.nextSibling) {
    taskList.insertBefore(el, prevEl.nextSibling);
  } else {
    taskList.appendChild(el);
  }
}

function shouldRenderTask(task) {
  if (currentFilter === "active") return !task.completed;
  if (currentFilter === "completed") return task.completed;
  return true;
}

function syncMetaUi() {
  const activeCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.length - activeCount;
  remainingCount.textContent = String(activeCount);
  clearCompletedBtn.classList.toggle("hidden", completedCount === 0);
  updateEmptyState(getFilteredTasks().length === 0, tasks.length === 0);
}

function updateEmptyState(showEmpty, isGlobalEmpty) {
  if (isGlobalEmpty) {
    emptyState.classList.remove("hidden");
    emptyState.querySelector("h2").textContent = "Your canvas is clear";
    emptyState.querySelector("p").textContent =
      "No tasks yet — add something above and watch it slide into place like a physical tile.";
    emptyState.querySelector(".empty-icon-wrap").textContent = "✨";
    return;
  }

  if (!showEmpty) {
    emptyState.classList.add("hidden");
    return;
  }

  emptyState.classList.remove("hidden");
  const messages = {
    active: {
      icon: "🎯",
      title: "All caught up!",
      desc: "Every task is done. Time to celebrate or add something new.",
    },
    completed: {
      icon: "📭",
      title: "Nothing completed yet",
      desc: "Finish a task and it'll land here with a satisfying check.",
    },
  };
  const msg = messages[currentFilter] || messages.active;
  emptyState.querySelector(".empty-icon-wrap").textContent = msg.icon;
  emptyState.querySelector("h2").textContent = msg.title;
  emptyState.querySelector("p").textContent = msg.desc;
}

// ─── Data sanitization ──────────────────────────────────────────────────────

function sanitizeTaskText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeDueDate(value) {
  if (typeof value !== "string") return "";
  const date = value.trim();
  if (!date || !VALID_DATE_RE.test(date)) return "";
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  return isValid ? date : "";
}

function sanitizeTask(rawTask) {
  if (!rawTask || typeof rawTask !== "object") return null;
  const text = sanitizeTaskText(rawTask.text);
  const dueDate = sanitizeDueDate(rawTask.dueDate || "");
  const createdAt = Number.isFinite(rawTask.createdAt) ? rawTask.createdAt : Date.now();
  if (!text) return null;

  return {
    id: typeof rawTask.id === "string" && rawTask.id ? rawTask.id : generateId(),
    text,
    completed: Boolean(rawTask.completed),
    createdAt,
    dueDate,
  };
}

// ─── Start ──────────────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}