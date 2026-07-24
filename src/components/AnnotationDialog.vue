<script setup lang="ts">
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import type { AnnotationProposal, ConfidenceLevel } from '../global.d'

const emit = defineEmits<{ close: [] }>()

// ─── State ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'generating' | 'review' | 'applying' | 'done'

const phase = ref<Phase>('idle')
const errorMessage = ref('')

// Raw proposals from LLM
const proposals = ref<AnnotationProposal[]>([])

// Per-proposal decisions: 'confirm' | 'skip' | a chosen override level
type Decision = 'confirm' | 'skip' | ConfidenceLevel
const decisions = ref<Map<string, Decision>>(new Map())

const currentIndex = ref(0)

const current = computed(() => proposals.value[currentIndex.value] ?? null)
const total = computed(() => proposals.value.length)
const remaining = computed(() => total.value - currentIndex.value)

const confirmedCount = computed(() => {
  let n = 0
  for (const d of decisions.value.values()) {
    if (d !== 'skip') n++
  }
  return n
})

const CONFIDENCE_OPTIONS: { label: string; value: ConfidenceLevel }[] = [
  { label: 'Speculative', value: 'speculative' },
  { label: 'Working', value: 'working' },
  { label: 'Confident', value: 'confident' },
  { label: 'Validated', value: 'validated' },
]

const CONFIDENCE_DESC: Record<ConfidenceLevel, string> = {
  speculative: 'Hypothesis with little support; might be wrong',
  working: 'Plausible and in use, but not firmly established',
  confident: 'Well-supported; treated as reliable',
  validated: 'Empirically confirmed or cross-validated',
}

// Override selection for current card (null = use proposed)
const overrideLevel = ref<ConfidenceLevel | null>(null)

// ─── Generation ───────────────────────────────────────────────────────────────

async function generate() {
  phase.value = 'generating'
  errorMessage.value = ''
  proposals.value = []
  decisions.value = new Map()
  currentIndex.value = 0
  overrideLevel.value = null

  try {
    proposals.value = await window.api.aiGenerateAnnotations()
    if (proposals.value.length === 0) {
      errorMessage.value = 'No QAs found in the archive. Add some QAs first.'
      phase.value = 'idle'
      return
    }
    phase.value = 'review'
  } catch (err) {
    errorMessage.value = (err as Error).message
    phase.value = 'idle'
  }
}

// ─── Review navigation ────────────────────────────────────────────────────────

function decide(decision: Decision) {
  if (!current.value) return
  decisions.value.set(current.value.id, decision)
  overrideLevel.value = null
  advance()
}

function confirm() {
  decide(overrideLevel.value ?? current.value!.proposedConfidence)
}

function skip() {
  decide('skip')
}

function advance() {
  if (currentIndex.value < total.value - 1) {
    currentIndex.value++
    overrideLevel.value = null
  } else {
    phase.value = 'done'
  }
}

function goBack() {
  if (currentIndex.value > 0) {
    currentIndex.value--
    overrideLevel.value = null
  }
}

// ─── Apply ────────────────────────────────────────────────────────────────────

async function apply() {
  phase.value = 'applying'

  const approved: Array<{ id: string; confidence: ConfidenceLevel }> = []
  for (const [id, decision] of decisions.value.entries()) {
    if (decision === 'skip') continue
    approved.push({ id, confidence: decision as ConfidenceLevel })
  }

  try {
    await window.api.aiApplyAnnotations(approved)
    phase.value = 'done'
    emit('close')
  } catch (err) {
    errorMessage.value = (err as Error).message
    phase.value = 'done'
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (phase.value !== 'review') return
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirm() }
  if (e.key === 's' || e.key === 'S') { e.preventDefault(); skip() }
  if (e.key === 'ArrowLeft') { e.preventDefault(); goBack() }
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <div class="annotation-overlay" @click.self="emit('close')" @keydown="handleKeydown" tabindex="-1">
    <div class="annotation-dialog">

      <!-- ── Title ──────────────────────────────────────────────── -->
      <div class="dialog-header">
        <div class="dialog-title">
          <i class="pi pi-check-circle" />
          Confidence Annotation Pass
        </div>
        <button class="dialog-close" @click="emit('close')"><i class="pi pi-times" /></button>
      </div>

      <!-- ── Idle ───────────────────────────────────────────────── -->
      <template v-if="phase === 'idle'">
        <p class="dialog-desc">
          The LLM will read every QA in your archive and propose a confidence level for each one.
          You review and confirm, override, or skip each proposal before anything is written.
        </p>
        <div class="confidence-legend">
          <div v-for="opt in CONFIDENCE_OPTIONS" :key="opt.value" class="legend-row">
            <span :class="['conf-chip', `conf-${opt.value}`]">{{ opt.label }}</span>
            <span class="legend-desc">{{ CONFIDENCE_DESC[opt.value] }}</span>
          </div>
        </div>
        <div v-if="errorMessage" class="error-msg">{{ errorMessage }}</div>
        <div class="dialog-footer">
          <Button label="Cancel" severity="secondary" outlined @click="emit('close')" />
          <Button label="Generate proposals" icon="pi pi-play" @click="generate" />
        </div>
      </template>

      <!-- ── Generating ─────────────────────────────────────────── -->
      <template v-else-if="phase === 'generating'">
        <div class="generating-state">
          <i class="pi pi-spin pi-spinner" style="font-size: 1.5rem; color: var(--primary-color)" />
          <p>Sending QAs to the LLM in batches…<br><span class="muted">This may take a minute for large archives.</span></p>
        </div>
      </template>

      <!-- ── Review ─────────────────────────────────────────────── -->
      <template v-else-if="phase === 'review' && current">
        <div class="progress-bar-wrap">
          <div class="progress-bar" :style="{ width: `${(currentIndex / total) * 100}%` }" />
        </div>
        <div class="progress-label">{{ currentIndex + 1 }} of {{ total }}</div>

        <div class="qa-card">
          <div class="qa-title">{{ current.title }}</div>

          <div class="proposal-row">
            <div class="proposal-col">
              <span class="col-label">Current</span>
              <span v-if="current.currentConfidence" :class="['conf-chip', `conf-${current.currentConfidence}`]">
                {{ current.currentConfidence }}
              </span>
              <span v-else class="muted">none</span>
            </div>
            <i class="pi pi-arrow-right proposal-arrow" />
            <div class="proposal-col">
              <span class="col-label">Proposed</span>
              <span :class="['conf-chip', `conf-${overrideLevel ?? current.proposedConfidence}`]">
                {{ overrideLevel ?? current.proposedConfidence }}
              </span>
            </div>
          </div>

          <p class="rationale">{{ current.rationale }}</p>

          <div class="override-row">
            <span class="col-label">Override:</span>
            <Select
              v-model="overrideLevel"
              :options="CONFIDENCE_OPTIONS"
              option-label="label"
              option-value="value"
              placeholder="Keep proposed"
              show-clear
              class="override-select"
            />
          </div>
        </div>

        <div class="dialog-footer review-footer">
          <Button
            label="Back"
            icon="pi pi-arrow-left"
            severity="secondary"
            outlined
            size="small"
            :disabled="currentIndex === 0"
            @click="goBack"
          />
          <div class="footer-actions">
            <Button label="Skip  (S)" severity="secondary" outlined @click="skip" />
            <Button label="Confirm  (Enter)" icon="pi pi-check" @click="confirm" />
          </div>
        </div>
        <p class="keyboard-hint">Enter = confirm · S = skip · ← = back</p>
      </template>

      <!-- ── Done ───────────────────────────────────────────────── -->
      <template v-else-if="phase === 'done'">
        <div class="done-state">
          <i class="pi pi-check-circle" style="font-size: 2rem; color: var(--green-500, #22c55e)" />
          <p>Review complete. <strong>{{ confirmedCount }}</strong> annotations confirmed,
            {{ total - confirmedCount }} skipped.</p>
          <div v-if="errorMessage" class="error-msg">{{ errorMessage }}</div>
        </div>
        <div class="dialog-footer">
          <Button label="Cancel" severity="secondary" outlined @click="emit('close')" />
          <Button
            :label="`Apply ${confirmedCount} annotation${confirmedCount !== 1 ? 's' : ''}`"
            icon="pi pi-save"
            :disabled="confirmedCount === 0"
            @click="apply"
          />
        </div>
      </template>

      <!-- ── Applying ───────────────────────────────────────────── -->
      <template v-else-if="phase === 'applying'">
        <div class="generating-state">
          <i class="pi pi-spin pi-spinner" style="font-size: 1.5rem; color: var(--primary-color)" />
          <p>Writing annotations…</p>
        </div>
      </template>

    </div>
  </div>
</template>

<style scoped>
.annotation-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.annotation-dialog {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 24px;
  width: 560px;
  max-width: 92vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 16px;
  outline: none;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-close {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-color-secondary);
  font-size: 14px;
  padding: 4px;
  border-radius: 4px;
}
.dialog-close:hover { background: var(--surface-hover); }

.dialog-desc {
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.6;
  margin: 0;
}

/* ── Legend ── */
.confidence-legend {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--surface-ground);
  border-radius: 8px;
  padding: 12px;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.legend-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
}

/* ── Confidence chips ── */
.conf-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
  text-transform: capitalize;
}
.conf-speculative { background: #fff0f0; color: #a33; }
.conf-working     { background: #fff8e0; color: #8a6200; }
.conf-confident   { background: #e0f0ff; color: #1a6bb5; }
.conf-validated   { background: #e6f9ec; color: #1e7a3a; }

/* ── Progress ── */
.progress-bar-wrap {
  height: 4px;
  background: var(--surface-200, #e2e8f0);
  border-radius: 2px;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: var(--primary-color);
  transition: width 0.2s;
}
.progress-label {
  font-size: 11px;
  color: var(--text-color-secondary);
  text-align: right;
  margin-top: -10px;
}

/* ── QA card ── */
.qa-card {
  background: var(--surface-ground);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.qa-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}
.proposal-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.proposal-col {
  display: flex;
  align-items: center;
  gap: 6px;
}
.col-label {
  font-size: 11px;
  color: var(--text-color-secondary);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.proposal-arrow {
  color: var(--text-color-secondary);
  font-size: 12px;
}
.rationale {
  font-size: 12px;
  color: var(--text-color-secondary);
  font-style: italic;
  margin: 0;
  line-height: 1.5;
}
.override-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.override-select {
  width: 180px;
  font-size: 12px;
}

/* ── States ── */
.generating-state, .done-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 0;
  text-align: center;
}
.generating-state p, .done-state p {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin: 0;
  line-height: 1.6;
}

/* ── Footer ── */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--border-color);
}
.review-footer {
  justify-content: space-between;
  align-items: center;
}
.footer-actions {
  display: flex;
  gap: 8px;
}
.keyboard-hint {
  font-size: 11px;
  color: var(--text-color-secondary);
  text-align: center;
  margin: -8px 0 0;
}

.error-msg {
  font-size: 12px;
  color: var(--red-500, #ef4444);
  padding: 8px;
  background: var(--surface-ground);
  border-radius: 6px;
}

.muted {
  color: var(--text-color-secondary);
  font-size: 12px;
}
</style>
