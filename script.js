/**
 * TaskTile — Premium Skeuomorphic To-Do App
 */

const STORAGE_KEY = "tasktile-tasks";
const THEME_KEY = "tasktile-theme";

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

// DOM refs
const taskForm = document.getElementById("task-form");
const taskInput = document.getElementById("task-input");
const taskDateInput = document.getElementById("task-date");
const taskList = document.getElementById("task-list");
const emptyState = document.getElementById("empty-state");
const remainingCount = document.getElementById("remaining-count");
const clearCompletedBtn = document.getElementById("clear-completed");
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const tabIndicator = document.getElementById("tab-indicator");
const filterTabs = document.querySelectorAll(".filter-tab");

// ─── Init ───────────────────────────────────────────────────────────────────

function init() {
  loadTasks();
  applySavedTheme();
  bindEvents();
  render();
  requestAnimationFrame(updateTabIndicator);
}

function bindEvents() {
  taskForm.addEventListener("submit", handleAddTask);
  themeToggle.addEventListener("click", toggleTheme);
  clearCompletedBtn.addEventListener("click", clearCompleted);
  window.addEventListener("resize", updateTabIndicator);

  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => setFilter(tab.dataset.filter));
  });
}

// ─── Storage ──────────────────────────────────────────────────────────────

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(tasks)) tasks = [];
  } catch {
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// ─── Theme ──────────────────────────────────────────────────────────────────

function applySavedTheme() {
  const isDark = document.documentElement.classList.contains("dark");
  themeIcon.textContent = isDark ? "☀️" : "🌙";
}

function toggleTheme() {
  const root = document.documentElement;
  const isDark = root.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  themeIcon.textContent = isDark ? "☀️" : "🌙";
  themeToggle.style.transform = "scale(0.9)";
  setTimeout(() => {
    themeToggle.style.transform = "";
  }, 150);
}

// ─── Tasks CRUD ─────────────────────────────────────────────────────────────

function handleAddTask(e) {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) {
    taskInput.focus();
    pulseInput();
    return;
  }

  const dueDate = taskDateInput.value.trim() || undefined;

  const task = {
    id: generateId(),
    text,
    completed: false,
    createdAt: Date.now(),
    ...(dueDate && { dueDate }),
  };

  tasks.unshift(task);
  saveTasks();
  taskInput.value = "";
  taskDateInput.value = "";
  render();

  const firstTile = taskList.querySelector(`[data-id="${task.id}"]`);
  if (firstTile) firstTile.classList.add("animate-slide-in");
}

function pulseInput() {
  taskInput.style.transform = "scale(0.98)";
  setTimeout(() => {
    taskInput.style.transform = "";
  }, 120);
}

function toggleComplete(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks();

  const el = taskList.querySelector(`[data-id="${id}"]`);
  if (el) {
    const check = el.querySelector(".check-toggle");
    if (check) check.classList.add("animate-check-pop");
    setTimeout(() => check?.classList.remove("animate-check-pop"), 400);
  }

  render();
}

function deleteTask(id) {
  const el = taskList.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.classList.add("animate-fade-out");
    el.addEventListener(
      "animationend",
      () => {
        tasks = tasks.filter((t) => t.id !== id);
        saveTasks();
        render();
      },
      { once: true }
    );
  } else {
    tasks = tasks.filter((t) => t.id !== id);
    saveTasks();
    render();
  }
}

function clearCompleted() {
  const completedEls = taskList.querySelectorAll(".task-tile.completed");
  if (completedEls.length === 0) {
    tasks = tasks.filter((t) => !t.completed);
    saveTasks();
    render();
    return;
  }

  let removed = 0;
  completedEls.forEach((el) => {
    el.classList.add("animate-fade-out");
    el.addEventListener(
      "animationend",
      () => {
        removed++;
        if (removed === completedEls.length) {
          tasks = tasks.filter((t) => !t.completed);
          saveTasks();
          render();
        }
      },
      { once: true }
    );
  });
}

// ─── Filter ─────────────────────────────────────────────────────────────────

function setFilter(filter) {
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
  tabIndicator.style.left = `${tabRect.left - parentRect.left}px`;
  tabIndicator.style.width = `${tabRect.width}px`;
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
  const filtered = getFilteredTasks();
  const activeCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;

  remainingCount.textContent = String(activeCount);
  clearCompletedBtn.classList.toggle("hidden", completedCount === 0);

  const showEmpty = filtered.length === 0;
  const isGlobalEmpty = tasks.length === 0;

  if (isGlobalEmpty) {
    emptyState.classList.remove("hidden");
    emptyState.querySelector("h2").textContent = "Your canvas is clear";
    emptyState.querySelector("p").textContent =
      "No tasks yet — add something above and watch it slide into place like a physical tile.";
    emptyState.querySelector(".empty-icon-wrap").textContent = "✨";
  } else if (showEmpty) {
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
  } else {
    emptyState.classList.add("hidden");
  }

  taskList.innerHTML = "";
  filtered.forEach((task) => {
    taskList.appendChild(createTaskElement(task));
  });
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
    <div class="flex-1 min-w-0">
      <p class="task-text text-sm sm:text-base font-medium text-theme-primary truncate ${task.completed ? "completed" : ""}">${escapeHtml(task.text)}</p>
      ${dueDateHtml}
      <time class="text-xs text-theme-muted mt-0.5 block" datetime="${new Date(task.createdAt).toISOString()}">${dateStr}</time>
    </div>
    <button type="button" class="delete-btn" aria-label="Delete task" data-action="delete">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
    </button>
  `;

  li.querySelector('[data-action="toggle"]').addEventListener("click", () =>
    toggleComplete(task.id)
  );
  li.querySelector('[data-action="delete"]').addEventListener("click", () =>
    deleteTask(task.id)
  );

  bindDragEvents(li, task.id);

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

function bindDragEvents(el, id) {
  el.addEventListener("dragstart", (e) => {
    dragSrcId = id;
    el.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setTimeout(() => el.classList.add("opacity-60"), 0);
  });

  el.addEventListener("dragend", () => {
    el.classList.remove("dragging", "opacity-60");
    dragSrcId = null;
    taskList.querySelectorAll(".task-tile").forEach((t) =>
      t.classList.remove("drag-over")
    );
  });

  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragSrcId && dragSrcId !== id) {
      el.classList.add("drag-over");
    }
  });

  el.addEventListener("dragleave", () => {
    el.classList.remove("drag-over");
  });

  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("drag-over");
    const srcId = e.dataTransfer.getData("text/plain") || dragSrcId;
    if (!srcId || srcId === id) return;
    reorderTasks(srcId, id);
  });
}

function reorderTasks(srcId, targetId) {
  const srcIndex = tasks.findIndex((t) => t.id === srcId);
  const targetIndex = tasks.findIndex((t) => t.id === targetId);
  if (srcIndex === -1 || targetIndex === -1) return;

  const [moved] = tasks.splice(srcIndex, 1);
  tasks.splice(targetIndex, 0, moved);
  saveTasks();
  render();
}

// ─── Start ──────────────────────────────────────────────────────────────────

init();
