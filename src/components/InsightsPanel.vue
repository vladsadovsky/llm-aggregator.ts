<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import MarkdownRenderer from './MarkdownRenderer.vue'

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

interface TokenStats {
  llm: { input: number; output: number }
  embeddings: { input: number }
}
const tokenStats = ref<TokenStats>({ llm: { input: 0, output: 0 }, embeddings: { input: 0 } })

async function refreshTokenStats() {
  tokenStats.value = await window.api.aiGetTokenStats()
}

async function resetTokenStats() {
  await window.api.aiResetTokenStats()
  await refreshTokenStats()
}

onMounted(refreshTokenStats)

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
  void nextTick(() => inputRef.value?.focus())
}

async function run() {
  const q = query.value.trim()
  if (!q || isLoading.value) return

  isLoading.value = true
  output.value = ''
  errorMessage.value = ''
  try {
    switch (activeMode.value) {
      case 'brief':         output.value = await window.api.aiSessionBrief(q); break
      case 'prior-art':     output.value = await window.api.aiPriorArt(q); break
      case 'steelman':      output.value = await window.api.aiSteelman(q); break
      case 'question-seed': output.value = await window.api.aiQuestionSeed(q); break
      case 'concept-summary': output.value = await window.api.aiConceptSummary(q); break
    }
  } catch (err) {
    errorMessage.value = (err as Error).message
  } finally {
    isLoading.value = false
    void refreshTokenStats()
  }
}

async function copyOutput() {
  if (output.value) {
    await navigator.clipboard.writeText(output.value)
  }
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

    <!-- ── Body (only visible when open) ────────────────────────── -->
    <div v-if="isOpen" class="insights-body">
      <div class="input-row">
        <InputText
          ref="inputRef"
          v-model="query"
          :placeholder="MODES.find(m => m.value === activeMode)?.placeholder ?? ''"
          class="query-input"
          @keydown="handleKeydown"
        />
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

.query-input {
  flex: 1;
  font-size: 13px;
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
