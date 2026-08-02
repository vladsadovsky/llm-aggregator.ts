<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useThreadStore } from '../stores/threadStore'
import {
  findRedundantThreadGroups,
  type RedundantThreadGroup,
} from '../../shared/threads/redundantThreadGroups'

const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  changed: []
}>()

const threadStore = useThreadStore()
const merging = ref(false)
const mergedGroupCount = ref<number | null>(null)
const error = ref('')

const groups = computed<RedundantThreadGroup[]>(() =>
  findRedundantThreadGroups(threadStore.threads),
)
const repairableGroups = computed(() => groups.value.filter((group) => group.importSourceIds.length <= 1))

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      mergedGroupCount.value = null
      error.value = ''
    }
  },
)

function survivorLabel(group: RedundantThreadGroup): string {
  const sourceCarriers = group.threadIds.filter((id) => threadStore.threads[id]?.importSourceId?.trim())
  return `${group.survivorId}${sourceCarriers.length === 1 ? ' (sole import id)' : ' (smallest id)'}`
}

function survivorReason(group: RedundantThreadGroup): string {
  const sourceCarriers = group.threadIds.filter((id) => threadStore.threads[id]?.importSourceId?.trim())
  return sourceCarriers.length === 1
    ? 'Chosen because it is the only record carrying importSourceId — evidence it was written by the fixed import path.'
    : 'Chosen as the lexicographically smallest thread id — closest to the canonical creation second.'
}

async function mergeSingleGroup(group: RedundantThreadGroup) {
  merging.value = true
  error.value = ''
  try {
    await threadStore.repairRedundantThreads([group])
    mergedGroupCount.value = (mergedGroupCount.value ?? 0) + 1
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    merging.value = false
  }
}

async function mergeAll() {
  const snapshot = [...repairableGroups.value]
  if (snapshot.length === 0) return
  merging.value = true
  error.value = ''
  try {
    const result = await threadStore.repairRedundantThreads(snapshot)
    mergedGroupCount.value = result.mergedGroups
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    merging.value = false
  }
}

function close() {
  if (merging.value) return
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Repair Redundant Thread Wrappers"
    :modal="true"
    :closable="!merging"
    :style="{ width: '700px', maxWidth: '94vw' }"
    data-testid="redundant-thread-repair-dialog"
    @update:visible="(v: boolean) => !merging && emit('update:visible', v)"
    @hide="close"
  >
    <Message
      v-if="error"
      severity="error"
      :closable="false"
      class="dialog-message"
    >
      {{ error }}
    </Message>

    <Message
      v-if="mergedGroupCount !== null"
      severity="success"
      :closable="false"
      class="dialog-message"
    >
      Merged {{ mergedGroupCount }} redundant thread {{ mergedGroupCount === 1 ? 'group' : 'groups' }}.
      QA files were not touched.
    </Message>

    <template v-if="groups.length === 0">
      <Message
        severity="success"
        :closable="false"
        class="dialog-message"
      >
        No redundant thread groups found.
      </Message>
    </template>

    <template v-else>
      <p class="intro">
        Found <strong>{{ groups.length }}</strong> redundant thread
        {{ groups.length === 1 ? 'group' : 'groups' }} —
        <strong>{{ groups.reduce((n, g) => n + g.redundantIds.length, 0) }}</strong>
        extra thread records will be removed. QA files are never touched.
        The survivor is chosen automatically (see tooltip for rule).
      </p>

      <Message
        v-if="groups.some((group) => group.importSourceIds.length > 1)"
        severity="warn"
        :closable="false"
        class="dialog-message"
      >
        Groups with multiple import identities are shown but blocked from automatic repair.
        They may represent distinct source conversations and require manual review.
      </Message>

      <ul class="group-list">
        <li
          v-for="group in groups"
          :key="group.survivorId"
          class="group"
        >
          <div class="group-head">
            <span class="group-name">{{ threadStore.threads[group.survivorId]?.name }}</span>
            <span class="group-meta">
              {{ group.itemIds.length }} QA{{ group.itemIds.length === 1 ? '' : 's' }} ·
              {{ group.redundantIds.length }} redundant
              {{ group.redundantIds.length === 1 ? 'copy' : 'copies' }}
            </span>
          </div>

          <div class="survivor-row">
            <span class="label">Survivor:</span>
            <span
              class="survivor-id"
              :title="survivorReason(group)"
            >
              {{ survivorLabel(group) }}
            </span>
          </div>

          <div class="redundant-row">
            <span class="label">Remove:</span>
            <span class="redundant-ids">{{ group.redundantIds.join(', ') }}</span>
          </div>

          <details
            v-if="group.metadataDiffers || group.importSourceIds.length > 1"
            class="member-details"
          >
            <summary>Review differing thread metadata</summary>
            <div
              v-for="tid in group.threadIds"
              :key="tid"
              class="member-detail"
            >
              <strong>{{ tid === group.survivorId ? 'Keep' : 'Remove' }}:</strong>
              {{ threadStore.threads[tid]?.name }}
              <template v-if="threadStore.threads[tid]?.tags?.length">
                · tags: {{ threadStore.threads[tid]?.tags?.join(', ') }}
              </template>
              <template v-if="threadStore.threads[tid]?.importSourceId">
                · import: {{ threadStore.threads[tid]?.importSourceId }}
              </template>
            </div>
          </details>

          <div class="group-actions">
            <Button
              icon="pi pi-check"
              size="small"
              :severity="group.importSourceIds.length > 1 ? 'secondary' : undefined"
              :loading="merging"
              :title="group.importSourceIds.length > 1 ? 'Blocked: multiple import identities require manual review.' : undefined"
              :label="group.importSourceIds.length > 1 ? 'Manual review required' : 'Merge'"
              :disabled="merging || group.importSourceIds.length > 1"
              @click="mergeSingleGroup(group)"
            />
          </div>
        </li>
      </ul>
    </template>

    <template #footer>
      <Button
        label="Close"
        severity="secondary"
        outlined
        :disabled="merging"
        @click="close"
      />
      <Button
        v-if="repairableGroups.length > 1"
        :label="`Merge All Safe Groups (${repairableGroups.length})`"
        icon="pi pi-check-circle"
        :disabled="merging"
        :loading="merging"
        @click="mergeAll"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-message {
  margin: 10px 0;
}

.intro {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
}

.group-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 440px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 10px 12px;
}

.group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.group-name {
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.group-meta {
  font-size: 11px;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.survivor-row,
.redundant-row {
  display: flex;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 4px;
  align-items: baseline;
}

.label {
  color: var(--text-color-secondary);
  white-space: nowrap;
  min-width: 60px;
}

.survivor-id {
  font-family: monospace;
  font-size: 11px;
  cursor: help;
  text-decoration: underline dotted;
  overflow-wrap: anywhere;
}

.redundant-ids {
  font-family: monospace;
  font-size: 11px;
  color: var(--red-500);
  overflow-wrap: anywhere;
}

.group-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.member-details {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.member-detail {
  margin-top: 4px;
  overflow-wrap: anywhere;
}
</style>
