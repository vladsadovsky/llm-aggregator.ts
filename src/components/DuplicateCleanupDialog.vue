<script setup lang="ts">
/**
 * DuplicateCleanupDialog.vue
 * Archive-wide duplicate sweep (Tools menu).
 *
 * Two kinds of match are shown side by side and labelled, because they carry
 * very different confidence:
 *   - "import id"  — exact: the same provider-side conversation turn.
 *   - "content"    — heuristic: identical text after normalization.
 *
 * The scan only ever *proposes*; nothing is deleted until the user confirms,
 * and the per-group "keep" choice is theirs to change.
 */
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Message from 'primevue/message'
import RadioButton from 'primevue/radiobutton'
import type { DuplicateCleanupRequest, DuplicateScanResult } from '../global'

const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  changed: []
  close: []
}>()

const scanning = ref(false)
const deleting = ref(false)
const scan = ref<DuplicateScanResult | null>(null)
const error = ref('')
const deletedCount = ref<number | null>(null)
/** group key → id the user wants to keep. */
const keepChoice = ref<Record<string, string>>({})

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) void runScan()
  },
)

async function runScan(clearOutcome = true) {
  scanning.value = true
  error.value = ''
  if (clearOutcome) deletedCount.value = null
  scan.value = null
  try {
    const result = await window.api.duplicatesScan()
    scan.value = result
    const choices: Record<string, string> = {}
    for (const group of result.groups) {
      choices[group.key] = (group.members.find((m) => m.keep) ?? group.members[0]).id
    }
    keepChoice.value = choices
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    scanning.value = false
  }
}

/** Everything not marked "keep" in each group. */
const idsToDelete = computed(() => {
  if (!scan.value) return []
  const out: string[] = []
  for (const group of scan.value.groups) {
    const keep = keepChoice.value[group.key]
    for (const member of group.members) {
      if (member.id !== keep) out.push(member.id)
    }
  }
  return out
})

const cleanupRequests = computed<DuplicateCleanupRequest[]>(() => {
  if (!scan.value) return []
  return scan.value.groups.flatMap((group) => {
    const keepId = keepChoice.value[group.key]
    if (!keepId) return []
    const removeIds = group.members.filter((member) => member.id !== keepId).map((member) => member.id)
    return removeIds.length > 0 ? [{ key: group.key, matchKind: group.matchKind, keepId, removeIds }] : []
  })
})

async function applyCleanup() {
  if (idsToDelete.value.length === 0) return
  deleting.value = true
  error.value = ''
  try {
    const result = await window.api.duplicatesDelete(cleanupRequests.value)
    emit('changed')
    await runScan(false)
    deletedCount.value = result.deleted.length
    if (result.failed.length > 0) {
      error.value = `${result.failed.length} pair(s) could not be deleted and remain available for a retry.`
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    deleting.value = false
  }
}

function matchLabel(kind: string): string {
  return kind === 'origin-id' ? 'import id (exact)' : 'identical content'
}

function close() {
  if (deleting.value) return
  emit('update:visible', false)
  emit('close')
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Find Duplicate Q&amp;As"
    :modal="true"
    :closable="!deleting"
    :style="{ width: '760px', maxWidth: '94vw' }"
    data-testid="duplicate-cleanup-dialog"
    @update:visible="(v: boolean) => !deleting && emit('update:visible', v)"
    @hide="close"
  >
    <div
      v-if="scanning"
      class="busy-row"
    >
      <i class="pi pi-spin pi-spinner" />
      <span>Scanning the archive…</span>
    </div>

    <template v-else>
      <Message
        v-if="error"
        severity="error"
        :closable="false"
        class="dialog-message"
      >
        {{ error }}
      </Message>

      <Message
        v-if="deletedCount !== null"
        severity="success"
        :closable="false"
        class="dialog-message"
      >
        Deleted {{ deletedCount }} duplicate {{ deletedCount === 1 ? 'pair' : 'pairs' }}.
      </Message>

      <template v-if="scan">
        <Message
          v-if="scan.groups.length === 0"
          severity="success"
          :closable="false"
          class="dialog-message"
        >
          No duplicates found across {{ scan.scanned }} Q&amp;A pairs.
        </Message>

        <template v-else>
          <p class="intro">
            Found <strong>{{ scan.groups.length }}</strong> duplicate
            {{ scan.groups.length === 1 ? 'group' : 'groups' }} across
            {{ scan.scanned }} pairs — <strong>{{ scan.removableCount }}</strong> can be removed.
            Pick which copy to keep in each group.
          </p>

          <ul class="group-list">
            <li
              v-for="group in scan.groups"
              :key="group.key"
              class="group"
            >
              <p class="group-head">
                Matched by <span class="match-kind">{{ matchLabel(group.matchKind) }}</span>
              </p>
              <div
                v-for="member in group.members"
                :key="member.id"
                class="member-row"
              >
                <RadioButton
                  v-model="keepChoice[group.key]"
                  :value="member.id"
                  :input-id="'k-' + member.id"
                />
                <label
                  :for="'k-' + member.id"
                  class="member-label"
                >
                  <span class="member-title">{{ member.title }}</span>
                  <span class="member-meta">
                    {{ member.source }} · {{ member.id }}
                    <template v-if="member.threadCount > 0">
                      · in {{ member.threadCount }} thread(s)
                    </template>
                  </span>
                </label>
              </div>
            </li>
          </ul>
        </template>
      </template>
    </template>

    <template #footer>
      <Button
        label="Close"
        severity="secondary"
        outlined
        :disabled="deleting"
        @click="close"
      />
      <Button
        v-if="scan && scan.groups.length > 0"
        :label="`Delete ${idsToDelete.length} duplicate${idsToDelete.length === 1 ? '' : 's'}`"
        icon="pi pi-trash"
        severity="danger"
        :disabled="idsToDelete.length === 0 || deleting"
        :loading="deleting"
        @click="applyCleanup"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.busy-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);
}

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
  max-height: 420px;
  overflow-y: auto;
}

.group {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.group-head {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.match-kind {
  font-weight: 600;
}

.member-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 4px 0;
}

.member-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  min-width: 0;
}

.member-title {
  font-size: 13px;
  overflow-wrap: anywhere;
}

.member-meta {
  font-size: 11px;
  color: var(--text-color-secondary);
}
</style>
