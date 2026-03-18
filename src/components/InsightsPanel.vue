<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { useUIStore } from '../stores/uiStore'

const uiStore = useUIStore()

// ─── State ────────────────────────────────────────────────────────────────────

type LensMode = 'brief' | 'prior-art' | 'steelman' | 'question-seed' | 'concept-summary'

const MODES: { value: LensMode; label: string; title: string; placeholder: string }[] = [
  {
    value: 'brief',
    label: 'Brief',
    title: 'Session Briefing — what have I established, what is unresolved, what contradicts?',
    placeholder: 'What are you about to work on? (Ctrl+Enter to run)',
  },
  {
    value: 'prior-art',
    label: 'Prior Art',
    title: 'Prior Art Check — what have I already explored on this topic?',
    placeholder: 'What topic do you want to check? (Ctrl+Enter to run)',
  },
  {
    value: 'steelman',
    label: 'Steelman',
    title: 'Steelman — find archive evidence for and against a position',
    placeholder: 'State a hypothesis or position (Ctrl+Enter to run)',
  },
  {
    value: 'question-seed',
    label: 'Gaps',
    title: 'Question Seeding — what questions does the archive raise but not answer?',
    placeholder: 'Focus topic to surface open questions for (Ctrl+Enter to run)',
  },
  {
    value: 'concept-summary',
    label: 'Concept',
    title: 'Concept State Summary — synthesize your current understanding of a concept',
    placeholder: 'Concept name to summarize (Ctrl+Enter to run)',
  },
]

const isOpen = ref(false)
const activeMode = ref<LensMode>('brief')
const query = ref('')
const output = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// ─── Prompt history ───────────────────────────────────────────────────────────

const HISTORY_KEY = (mode: LensMode) => `lens-history-${mode}`
const MAX_HISTORY = 20

function loadHistory(mode: LensMode): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY(mode)) ?? '[]')
  } catch {
    return []
  }
}

function saveHistory(mode: LensMode, items: string[]) {
  localStorage.setItem(HISTORY_KEY(mode), JSON.stringify(items))
}

function addToHistory(mode: LensMode, entry: string) {
  const items = loadHistory(mode).filter(h => h !== entry)
  items.unshift(entry)
  saveHistory(mode, items.slice(0, MAX_HISTORY))
  if (activeMode.value === mode) historyItems.value = loadHistory(mode)
}

const historyItems = ref<string[]>([])
const showHistory = ref(false)
const historyRef = ref<HTMLElement | null>(null)

function openHistory() {
  historyItems.value = loadHistory(activeMode.value)
  if (historyItems.value.length === 0) return
  showHistory.value = true
}

function selectHistory(entry: string) {
  query.value = entry
  showHistory.value = false
  void nextTick(() => inputRef.value?.focus())
}

function deleteHistoryEntry(entry: string) {
  const items = loadHistory(activeMode.value).filter(h => h !== entry)
  saveHistory(activeMode.value, items)
  historyItems.value = items
  if (items.length === 0) showHistory.value = false
}

function onDocClick(e: MouseEvent) {
  if (showHistory.value && historyRef.value && !historyRef.value.contains(e.target as Node)) {
    showHistory.value = false
  }
}

onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))

interface TokenStats {
  llm: { input: number; output: number }
  embeddings: { input: number }
}
const tokenStats = ref<TokenStats>({ llm: { input: 0, output: 0 }, embeddings: { input: 0 } })
const llmModel = ref('')

async function refreshTokenStats() {
  tokenStats.value = await window.api.aiGetTokenStats()
}

async function resetTokenStats() {
  await window.api.aiResetTokenStats()
  await refreshTokenStats()
}

// ─── Per-request toast ────────────────────────────────────────────────────────

interface RequestToast {
  llmIn: number
  llmOut: number
  embedIn: number
  model: string
}
const toast = ref<RequestToast | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function copyToast(t: RequestToast) {
  const parts: string[] = [`Model: ${t.model}`]
  if (t.llmIn || t.llmOut) parts.push(`LLM: ${t.llmIn.toLocaleString()} in · ${t.llmOut.toLocaleString()} out`)
  if (t.embedIn) parts.push(`Embed: ${t.embedIn.toLocaleString()} in`)
  void navigator.clipboard.writeText(parts.join('\n'))
}

function showRequestToast(before: TokenStats, after: TokenStats) {
  const delta: RequestToast = {
    llmIn: after.llm.input - before.llm.input,
    llmOut: after.llm.output - before.llm.output,
    embedIn: after.embeddings.input - before.embeddings.input,
    model: llmModel.value,
  }
  if (delta.llmIn === 0 && delta.llmOut === 0 && delta.embedIn === 0) return
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = delta
  toastTimer = setTimeout(() => { toast.value = null }, 12000)
}

onMounted(async () => {
  document.addEventListener('mousedown', onDocClick)
  const [stats, settings] = await Promise.all([
    window.api.aiGetTokenStats(),
    window.api.settingsLoad(),
  ])
  tokenStats.value = stats
  llmModel.value = settings.llmModel || 'gpt-4o'
})

// ─── Actions ──────────────────────────────────────────────────────────────────

function open(mode: LensMode) {
  activeMode.value = mode
  isOpen.value = true
  void nextTick(() => inputRef.value?.focus())
}

function toggle() {
  if (isOpen.value) {
    isOpen.value = false
  } else {
    open(activeMode.value)
  }
}

function setMode(mode: LensMode) {
  activeMode.value = mode
  output.value = ''
  errorMessage.value = ''
  showHistory.value = false
  historyItems.value = loadHistory(mode)
  void nextTick(() => inputRef.value?.focus())
}

async function run() {
  const q = query.value.trim()
  if (!q || isLoading.value) return

  addToHistory(activeMode.value, q)
  isLoading.value = true
  output.value = ''
  errorMessage.value = ''
  const statsBefore = await window.api.aiGetTokenStats()
  try {
    switch (activeMode.value) {
      case 'brief':           output.value = await window.api.aiSessionBrief(q); break
      case 'prior-art':       output.value = await window.api.aiPriorArt(q); break
      case 'steelman':        output.value = await window.api.aiSteelman(q); break
      case 'question-seed':   output.value = await window.api.aiQuestionSeed(q); break
      case 'concept-summary': output.value = await window.api.aiConceptSummary(q); break
    }
  } catch (err) {
    errorMessage.value = (err as Error).message
  } finally {
    isLoading.value = false
    const statsAfter = await window.api.aiGetTokenStats()
    tokenStats.value = statsAfter
    showRequestToast(statsBefore, statsAfter)
  }
}

async function copyOutput() {
  if (output.value) {
    await navigator.clipboard.writeText(output.value)
  }
}

function saveAsQA() {
  if (!output.value) return
  const q = query.value.trim()
  const modeLabel = MODES.find(m => m.value === activeMode.value)?.label ?? 'Lens'
  uiStore.openQAEditorWithDraft({
    title: q.length > 80 ? q.slice(0, 77) + '…' : q,
    question: q,
    answer: output.value,
    source: 'lens',
    tags: [modeLabel.toLowerCase()],
    url: '',
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    void run()
  }
  if (e.key === 'Escape') {
    isOpen.value = false
  }
}

// Expose open() so App.vue toolbar buttons can trigger specific modes
defineExpose({ open, toggle })
</script>

<template>
  <div class="insights-panel" :class="{ 'is-open': isOpen }">
    <!-- ── Strip / header ────────────────────────────────────────── -->
    <div class="insights-header" @click="toggle">
      <div class="header-left">
        <i class="pi pi-sparkles header-icon" />
        <span class="header-label">Lens</span>
        <span v-if="!isOpen" class="header-hint">Brief · Prior Art · Steelman · Gaps · Concept</span>
      </div>
      <div class="header-right" @click.stop>
        <div class="token-stats" title="Tokens used this session (LLM: in/out · Embeddings: in)">
          <span class="token-group">
            <span class="token-label">LLM</span>
            <span class="token-value">{{ tokenStats.llm.input.toLocaleString() }} in · {{ tokenStats.llm.output.toLocaleString() }} out</span>
          </span>
          <span class="token-sep">|</span>
          <span class="token-group">
            <span class="token-label">Embed</span>
            <span class="token-value">{{ tokenStats.embeddings.input.toLocaleString() }} in</span>
          </span>
          <button class="token-reset-btn" title="Reset token counters" @click="resetTokenStats">
            <i class="pi pi-refresh" />
          </button>
        </div>
        <button
          v-for="m in MODES"
          :key="m.value"
          class="mode-btn"
          :class="{ active: activeMode === m.value }"
          :title="m.title"
          @click="isOpen ? setMode(m.value) : open(m.value)"
        >
          {{ m.label }}
        </button>
        <button class="close-btn" @click="isOpen = false" title="Close Lens">
          <i class="pi pi-times" />
        </button>
      </div>
    </div>

    <!-- ── Per-request token toast ──────────────────────────────── -->
    <Transition name="toast">
      <div v-if="toast" class="token-toast" @click="toast = null">
        <i class="pi pi-microchip-ai toast-icon" />
        <div class="toast-body">
          <div class="toast-model">{{ toast.model }}</div>
          <div class="toast-counts">
            <span v-if="toast.llmIn || toast.llmOut">
              LLM {{ toast.llmIn.toLocaleString() }}&thinsp;in · {{ toast.llmOut.toLocaleString() }}&thinsp;out
            </span>
            <span v-if="(toast.llmIn || toast.llmOut) && toast.embedIn" class="toast-sep">·</span>
            <span v-if="toast.embedIn">
              Embed {{ toast.embedIn.toLocaleString() }}&thinsp;in
            </span>
          </div>
        </div>
        <button class="toast-copy" title="Copy to clipboard" @click.stop="copyToast(toast!)"><i class="pi pi-copy" /></button>
        <button class="toast-close" title="Dismiss"><i class="pi pi-times" /></button>
      </div>
    </Transition>

    <!-- ── Body (only visible when open) ────────────────────────── -->
    <div v-if="isOpen" class="insights-body">
      <div class="input-row" ref="historyRef">
        <div class="input-wrap">
          <InputText
            ref="inputRef"
            v-model="query"
            :placeholder="MODES.find(m => m.value === activeMode)?.placeholder ?? ''"
            class="query-input"
            @keydown="handleKeydown"
          />
          <button
            v-if="loadHistory(activeMode).length > 0"
            class="history-trigger"
            title="Show prompt history"
            @click="openHistory"
          >
            <i class="pi pi-history" />
          </button>
          <div v-if="showHistory" class="history-dropdown">
            <div
              v-for="entry in historyItems"
              :key="entry"
              class="history-item"
            >
              <span class="history-text" @click="selectHistory(entry)" :title="entry">{{ entry }}</span>
              <button class="history-delete" title="Remove" @click.stop="deleteHistoryEntry(entry)">
                <i class="pi pi-times" />
              </button>
            </div>
          </div>
        </div>
        <Button
          :label="isLoading ? '' : 'Run'"
          icon="pi pi-play"
          size="small"
          :loading="isLoading"
          :disabled="!query.trim()"
          @click="run"
        />
        <Button
          v-if="output"
          icon="pi pi-copy"
          size="small"
          severity="secondary"
          outlined
          title="Copy to clipboard"
          @click="copyOutput"
        />
        <Button
          v-if="output"
          icon="pi pi-save"
          size="small"
          severity="secondary"
          outlined
          title="Save as QA pair"
          @click="saveAsQA"
        />
      </div>

      <div class="output-area">
        <div v-if="isLoading" class="output-loading">
          <i class="pi pi-spin pi-spinner" />
          <span>Thinking…</span>
        </div>
        <div v-else-if="errorMessage" class="output-error">
          <i class="pi pi-wifi output-error-icon" />
          <span>{{ errorMessage }}</span>
        </div>
        <MarkdownRenderer v-else-if="output" :source="output" class="output-md" />
        <p v-else class="output-placeholder">
          {{ MODES.find(m => m.value === activeMode)?.title }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.insights-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 500;
  background: var(--surface-card);
  border-top: 1px solid var(--border-color);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.15s;
}

/* ── Header strip ───────────────────────────────────── */

.insights-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 36px;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.insights-header:hover {
  background: var(--surface-hover);
}

.is-open .insights-header:hover {
  background: transparent;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 13px;
  color: var(--primary-color);
}

.header-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
}

.header-hint {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.token-stats {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-right: 6px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--surface-ground);
  border: 1px solid var(--border-color);
}

.token-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.token-label {
  font-weight: 600;
  color: var(--text-color);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.token-value {
  font-variant-numeric: tabular-nums;
}

.token-sep {
  color: var(--border-color);
  margin: 0 1px;
}

.token-reset-btn {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  padding: 0;
  margin-left: 2px;
}

.token-reset-btn:hover {
  background: var(--surface-hover);
  color: var(--text-color);
}

.mode-btn {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  line-height: 20px;
}

.mode-btn:hover {
  background: var(--surface-hover);
  color: var(--text-color);
}

.mode-btn.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  margin-left: 4px;
}

.close-btn:hover {
  background: var(--surface-hover);
  color: var(--text-color);
}

/* ── Per-request toast ──────────────────────────────── */

.token-toast {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--surface-overlay, var(--surface-card));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  z-index: 600;
  max-width: 340px;
}

.toast-icon {
  font-size: 14px;
  color: var(--primary-color);
  flex-shrink: 0;
}

.toast-body {
  flex: 1;
  min-width: 0;
}

.toast-model {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 2px;
}

.toast-counts {
  font-size: 11px;
  color: var(--text-color-secondary);
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.toast-sep {
  color: var(--border-color);
}

.toast-copy,
.toast-close {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  padding: 0;
  flex-shrink: 0;
}

.toast-copy:hover,
.toast-close:hover {
  background: var(--surface-hover);
  color: var(--text-color);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* ── Body ───────────────────────────────────────────── */

.insights-body {
  display: flex;
  flex-direction: column;
  padding: 0 12px 12px;
  gap: 10px;
  height: 300px;
}

.input-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.input-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.query-input {
  width: 100%;
  font-size: 13px;
  padding-right: 28px;
}

.history-trigger {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  padding: 0;
}

.history-trigger:hover {
  background: var(--surface-hover);
  color: var(--text-color);
}

.history-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 600;
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  max-height: 200px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
}

.history-item:hover {
  background: var(--surface-hover);
}

.history-text {
  flex: 1;
  font-size: 12px;
  color: var(--text-color);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 0;
}

.history-delete {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  padding: 0;
  flex-shrink: 0;
  opacity: 0;
}

.history-item:hover .history-delete {
  opacity: 1;
}

.history-delete:hover {
  background: var(--surface-ground);
  color: var(--red-500, #ef4444);
}

.output-area {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.output-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-color-secondary);
  font-size: 13px;
  padding: 16px 0;
}

.output-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--red-500, #ef4444);
  font-size: 13px;
  padding: 12px 0;
  line-height: 1.5;
}

.output-error-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.output-placeholder {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.6;
  padding: 8px 0;
  margin: 0;
}

.output-md {
  font-size: 13px;
}
</style>
