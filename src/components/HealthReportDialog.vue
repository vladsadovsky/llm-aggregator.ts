<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import { useQAStore } from '../stores/qaStore'
import type { HealthReport } from '../global.d'

const DEAD_END_AGE_MONTHS = 6

const emit = defineEmits<{
  close: []
}>()

const qaStore = useQAStore()

type Phase = 'idle' | 'running' | 'done'

const phase = ref<Phase>('idle')
const report = ref<HealthReport | null>(null)
const error = ref<string | null>(null)

// Which section is expanded
const expanded = ref<'orphans' | 'metadata' | 'duplicates' | 'deadend' | null>(null)

async function runCheck() {
  phase.value = 'running'
  error.value = null
  try {
    report.value = await window.api.archiveHealthCheck()
    phase.value = 'done'
    // Auto-expand the first section that has issues
    if (report.value.orphanIds.length > 0) expanded.value = 'orphans'
    else if (hasMetadataGaps()) expanded.value = 'metadata'
    else if (report.value.duplicateCandidates.length > 0) expanded.value = 'duplicates'
    else if (report.value.deadEndCandidates.length > 0) expanded.value = 'deadend'
  } catch (err) {
    error.value = (err as Error).message
    phase.value = 'idle'
  }
}

function toggle(section: typeof expanded.value) {
  expanded.value = expanded.value === section ? null : section
}

function openEntry(id: string) {
  qaStore.selectPair(id)
  emit('close')
}

function hasMetadataGaps() {
  const g = report.value?.metadataGaps
  return g && (g.missingTopic.length > 0 || g.missingSummary.length > 0 || g.missingConfidence.length > 0)
}

function metadataScore() {
  if (!report.value) return 0
  const total = report.value.totalPairs
  if (total === 0) return 100
  const g = report.value.metadataGaps
  // Count unique IDs that have at least one gap
  const withGap = new Set([...g.missingTopic, ...g.missingSummary, ...g.missingConfidence])
  return Math.round(((total - withGap.size) / total) * 100)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}
</script>

<template>
  <div
    class="health-overlay"
    @click.self="emit('close')"
    @keydown="handleKeydown"
  >
    <div class="health-dialog">
      <div class="dialog-header">
        <h3 class="dialog-title">
          <i class="pi pi-heart" />
          Archive Health
        </h3>
        <Button
          icon="pi pi-times"
          text
          rounded
          size="small"
          @click="emit('close')"
        />
      </div>

      <!-- Idle state -->
      <div
        v-if="phase === 'idle'"
        class="idle-state"
      >
        <p class="intro-text">
          Scans your archive for structural issues: orphaned entries, missing AI metadata,
          near-duplicate pairs, and unresolved dead-end notes.
          No content is modified.
        </p>
        <p
          v-if="error"
          class="error-text"
        >
          {{ error }}
        </p>
        <Button
          label="Run Health Check"
          icon="pi pi-search"
          @click="runCheck"
        />
      </div>

      <!-- Running state -->
      <div
        v-else-if="phase === 'running'"
        class="running-state"
      >
        <i class="pi pi-spin pi-spinner spinner" />
        <p>Analysing archive…</p>
      </div>

      <!-- Done state -->
      <div
        v-else-if="phase === 'done' && report"
        class="report"
      >
        <div class="summary-bar">
          <span class="summary-total">{{ report.totalPairs }} entries</span>
          <span class="summary-sep">·</span>
          <span :class="['summary-stat', report.orphanIds.length > 0 ? 'warn' : 'ok']">
            {{ report.orphanIds.length }} orphans
          </span>
          <span class="summary-sep">·</span>
          <span :class="['summary-stat', metadataScore() < 100 ? 'warn' : 'ok']">
            {{ metadataScore() }}% metadata coverage
          </span>
          <span class="summary-sep">·</span>
          <span :class="['summary-stat', report.duplicateCandidates.length > 0 ? 'warn' : 'ok']">
            {{ report.duplicateCandidates.length }} near-duplicates
          </span>
          <span class="summary-sep">·</span>
          <span :class="['summary-stat', report.deadEndCandidates.length > 0 ? 'warn' : 'ok']">
            {{ report.deadEndCandidates.length }} unresolved
          </span>
        </div>

        <!-- 1. Orphans -->
        <div class="section">
          <button
            class="section-header"
            @click="toggle('orphans')"
          >
            <i :class="['pi', expanded === 'orphans' ? 'pi-chevron-down' : 'pi-chevron-right']" />
            <span class="section-title">Orphaned entries</span>
            <span :class="['badge', report.orphanIds.length > 0 ? 'badge-warn' : 'badge-ok']">
              {{ report.orphanIds.length }}
            </span>
          </button>
          <div
            v-if="expanded === 'orphans'"
            class="section-body"
          >
            <p class="section-help">
              Entries with no thread membership and no tags — at risk of being forgotten.
            </p>
            <div
              v-if="report.orphanIds.length === 0"
              class="all-clear"
            >
              All entries are in a thread or have tags.
            </div>
            <div
              v-else
              class="entry-list"
            >
              <div
                v-for="id in report.orphanIds"
                :key="id"
                class="entry-row clickable"
                @click="openEntry(id)"
              >
                <i class="pi pi-file" />
                <span class="entry-id">{{ id }}</span>
                <i class="pi pi-arrow-right entry-goto" />
              </div>
            </div>
          </div>
        </div>

        <!-- 2. Metadata gaps -->
        <div class="section">
          <button
            class="section-header"
            @click="toggle('metadata')"
          >
            <i :class="['pi', expanded === 'metadata' ? 'pi-chevron-down' : 'pi-chevron-right']" />
            <span class="section-title">Metadata coverage</span>
            <span :class="['badge', metadataScore() < 100 ? 'badge-warn' : 'badge-ok']">
              {{ metadataScore() }}%
            </span>
          </button>
          <div
            v-if="expanded === 'metadata'"
            class="section-body"
          >
            <p class="section-help">
              Entries missing AI-generated fields have weaker retrieval quality in LLM Lens.
              Click "Generate metadata" in any entry's action menu to fill gaps.
            </p>

            <div
              v-if="!hasMetadataGaps()"
              class="all-clear"
            >
              All entries have full AI metadata.
            </div>
            <div
              v-else
              class="metadata-gaps"
            >
              <div
                v-if="report.metadataGaps.missingTopic.length > 0"
                class="gap-group"
              >
                <div class="gap-label">
                  Missing topic ({{ report.metadataGaps.missingTopic.length }})
                </div>
                <div class="entry-list">
                  <div
                    v-for="id in report.metadataGaps.missingTopic"
                    :key="id"
                    class="entry-row clickable"
                    @click="openEntry(id)"
                  >
                    <i class="pi pi-file" />
                    <span class="entry-id">{{ id }}</span>
                    <i class="pi pi-arrow-right entry-goto" />
                  </div>
                </div>
              </div>

              <div
                v-if="report.metadataGaps.missingSummary.length > 0"
                class="gap-group"
              >
                <div class="gap-label">
                  Missing summary ({{ report.metadataGaps.missingSummary.length }})
                </div>
                <div class="entry-list">
                  <div
                    v-for="id in report.metadataGaps.missingSummary"
                    :key="id"
                    class="entry-row clickable"
                    @click="openEntry(id)"
                  >
                    <i class="pi pi-file" />
                    <span class="entry-id">{{ id }}</span>
                    <i class="pi pi-arrow-right entry-goto" />
                  </div>
                </div>
              </div>

              <div
                v-if="report.metadataGaps.missingConfidence.length > 0"
                class="gap-group"
              >
                <div class="gap-label">
                  Missing confidence ({{ report.metadataGaps.missingConfidence.length }})
                </div>
                <div class="entry-list">
                  <div
                    v-for="id in report.metadataGaps.missingConfidence"
                    :key="id"
                    class="entry-row clickable"
                    @click="openEntry(id)"
                  >
                    <i class="pi pi-file" />
                    <span class="entry-id">{{ id }}</span>
                    <i class="pi pi-arrow-right entry-goto" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Near-duplicates -->
        <div class="section">
          <button
            class="section-header"
            @click="toggle('duplicates')"
          >
            <i :class="['pi', expanded === 'duplicates' ? 'pi-chevron-down' : 'pi-chevron-right']" />
            <span class="section-title">Near-duplicate candidates</span>
            <span :class="['badge', report.duplicateCandidates.length > 0 ? 'badge-warn' : 'badge-ok']">
              {{ report.duplicateCandidates.length }}
            </span>
          </button>
          <div
            v-if="expanded === 'duplicates'"
            class="section-body"
          >
            <p class="section-help">
              Pairs with cosine similarity ≥ 0.88. They may overlap or be redundant.
              Review them manually and merge via the editor if needed.
              Note: requires embeddings to be generated first.
            </p>
            <div
              v-if="report.duplicateCandidates.length === 0"
              class="all-clear"
            >
              No near-duplicate pairs found.
            </div>
            <div
              v-else
              class="entry-list"
            >
              <div
                v-for="dup in report.duplicateCandidates"
                :key="dup.idA + dup.idB"
                class="duplicate-row"
              >
                <div class="dup-pair">
                  <span
                    class="dup-title clickable"
                    @click="openEntry(dup.idA)"
                  >
                    {{ dup.titleA || dup.idA }}
                  </span>
                  <span class="dup-sim">{{ (dup.similarity * 100).toFixed(0) }}%</span>
                  <span
                    class="dup-title clickable"
                    @click="openEntry(dup.idB)"
                  >
                    {{ dup.titleB || dup.idB }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Dead-end / open without closure -->
        <div class="section">
          <button
            class="section-header"
            @click="toggle('deadend')"
          >
            <i :class="['pi', expanded === 'deadend' ? 'pi-chevron-down' : 'pi-chevron-right']" />
            <span class="section-title">Unresolved entries ({{ DEAD_END_AGE_MONTHS }}+ months old)</span>
            <span :class="['badge', report.deadEndCandidates.length > 0 ? 'badge-warn' : 'badge-ok']">
              {{ report.deadEndCandidates.length }}
            </span>
          </button>
          <div
            v-if="expanded === 'deadend'"
            class="section-body"
          >
            <p class="section-help">
              Entries with status <em>open</em> or <em>dead-end</em> that haven't been updated in
              {{ DEAD_END_AGE_MONTHS }}+ months. Worth revisiting to update status or close out.
            </p>
            <div
              v-if="report.deadEndCandidates.length === 0"
              class="all-clear"
            >
              No aged unresolved entries.
            </div>
            <div
              v-else
              class="entry-list"
            >
              <div
                v-for="entry in report.deadEndCandidates"
                :key="entry.id"
                class="entry-row clickable"
                @click="openEntry(entry.id)"
              >
                <span :class="['status-chip', `status-${entry.status.replace('-', '')}`]">{{ entry.status }}</span>
                <span class="entry-title">{{ entry.title || entry.id }}</span>
                <span class="entry-age">{{ entry.ageMonths }}mo</span>
                <i class="pi pi-arrow-right entry-goto" />
              </div>
            </div>
          </div>
        </div>

        <div class="rerun-row">
          <Button
            label="Run Again"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            size="small"
            @click="runCheck"
          />
        </div>
      </div>

      <!-- Close button -->
      <div class="footer-row">
        <Button
          label="Close"
          severity="secondary"
          outlined
          @click="emit('close')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.health-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.health-dialog {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 24px;
  width: 640px;
  max-width: 92vw;
  max-height: 82vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.idle-state, .running-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.running-state {
  align-items: center;
  padding: 32px 0;
}

.spinner {
  font-size: 28px;
  color: var(--primary-color);
}

.intro-text {
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.5;
  margin: 0;
}

.error-text {
  font-size: 13px;
  color: var(--red-500);
}

.summary-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 10px 12px;
  background: var(--surface-100);
  border-radius: 8px;
}

.summary-total {
  font-weight: 600;
}

.summary-sep {
  color: var(--text-color-secondary);
}

.summary-stat.warn {
  color: var(--orange-500);
  font-weight: 500;
}

.summary-stat.ok {
  color: var(--green-500);
}

.section {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.section-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--surface-50);
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  text-align: left;
}

.section-header:hover {
  background: var(--surface-100);
}

.section-title {
  flex: 1;
}

.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
}

.badge-warn {
  background: var(--orange-100);
  color: var(--orange-700);
}

.badge-ok {
  background: var(--green-100);
  color: var(--green-700);
}

.section-body {
  padding: 12px;
  border-top: 1px solid var(--border-color);
}

.section-help {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin: 0 0 10px;
  line-height: 1.5;
}

.all-clear {
  font-size: 13px;
  color: var(--green-600);
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
}

.entry-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-family: monospace;
}

.entry-row.clickable {
  cursor: pointer;
}

.entry-row.clickable:hover {
  background: var(--surface-100);
}

.entry-id {
  flex: 1;
  color: var(--text-color-secondary);
}

.entry-title {
  flex: 1;
  color: var(--text-color);
  font-family: inherit;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-age {
  font-size: 11px;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.entry-goto {
  font-size: 10px;
  color: var(--text-color-secondary);
  opacity: 0;
}

.entry-row:hover .entry-goto {
  opacity: 1;
}

.metadata-gaps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gap-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gap-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.duplicate-row {
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
}

.dup-pair {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dup-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  color: var(--primary-color);
}

.dup-title:hover {
  text-decoration: underline;
}

.dup-sim {
  font-size: 11px;
  font-weight: 600;
  color: var(--orange-500);
  white-space: nowrap;
}

.status-chip {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  white-space: nowrap;
}

.status-open {
  background: var(--blue-100);
  color: var(--blue-700);
}

.status-deadend {
  background: var(--surface-200);
  color: var(--text-color-secondary);
}

.rerun-row {
  display: flex;
  justify-content: flex-start;
}

.footer-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
  border-top: 1px solid var(--border-color);
}
</style>
