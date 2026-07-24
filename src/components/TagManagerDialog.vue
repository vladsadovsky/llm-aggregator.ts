<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTagStore } from '../stores/tagStore'
import { useQAStore } from '../stores/qaStore'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

const emit = defineEmits<{ close: [] }>()

const tagStore = useTagStore()
const qaStore = useQAStore()
const toast = useToast()

// ── State ─────────────────────────────────────────────────────────────────
const filterQuery = ref('')
const sortBy = ref<'name' | 'usage'>('usage')
const editingTag = ref<string | null>(null)
const editName = ref('')
const editAliases = ref('')
const newTagName = ref('')
const newTagAliases = ref('')
const syncing = ref(false)
const confirmDeleteTag = ref<string | null>(null)

// ── Computed ──────────────────────────────────────────────────────────────

const tagCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const pair of Object.values(qaStore.pairs)) {
    for (const tag of pair.tags) {
      const norm = tag.trim().toLowerCase()
      if (norm) counts[norm] = (counts[norm] || 0) + 1
    }
  }
  return counts
})

const filteredTags = computed(() => {
  const q = filterQuery.value.toLowerCase()
  let list = tagStore.canonicalTags
  if (q) {
    list = list.filter((t) => {
      if (t.includes(q)) return true
      const aliases = tagStore.tags[t]?.aliases ?? []
      return aliases.some((a) => a.includes(q))
    })
  }
  if (sortBy.value === 'usage') {
    list = [...list].sort((a, b) => (tagCounts.value[b] ?? 0) - (tagCounts.value[a] ?? 0))
  }
  return list
})

// ── Sync ──────────────────────────────────────────────────────────────────

async function syncFromArchive() {
  syncing.value = true
  try {
    const result = await tagStore.sync()
    if (result.added.length > 0) {
      toast.add({
        severity: 'success',
        summary: 'Dictionary synced',
        detail: `${result.added.length} new tag${result.added.length === 1 ? '' : 's'} added from archive`,
        life: 4000,
      })
    } else {
      toast.add({ severity: 'info', summary: 'Dictionary up to date', life: 2000 })
    }
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Sync failed', detail: (err as Error).message, life: 5000 })
  } finally {
    syncing.value = false
  }
}

// ── Add ───────────────────────────────────────────────────────────────────

async function addNewTag() {
  const name = newTagName.value.trim().toLowerCase()
  if (!name) return
  if (tagStore.isKnownTag(name)) {
    toast.add({ severity: 'warn', summary: 'Tag already exists', life: 2000 })
    return
  }
  const aliases = newTagAliases.value
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
  try {
    await tagStore.addTag(name, aliases)
    newTagName.value = ''
    newTagAliases.value = ''
    toast.add({ severity: 'success', summary: `Tag "${name}" added`, life: 2000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Add failed', detail: (err as Error).message, life: 5000 })
  }
}

// ── Edit ──────────────────────────────────────────────────────────────────

function startEdit(tag: string) {
  editingTag.value = tag
  editName.value = tag
  editAliases.value = (tagStore.tags[tag]?.aliases ?? []).join(', ')
}

function cancelEdit() {
  editingTag.value = null
  editName.value = ''
  editAliases.value = ''
}

async function saveEdit(originalTag: string) {
  const newName = editName.value.trim().toLowerCase()
  if (!newName) return

  const newAliases = editAliases.value
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)

  try {
    if (newName !== originalTag) {
      await tagStore.renameTag(originalTag, newName)
      toast.add({ severity: 'success', summary: `Renamed to "${newName}"`, detail: 'Old name added as alias. Use "Retag archive" (Phase 4) to update existing QA pairs.', life: 5000 })
    }
    // Update aliases: compare to current
    const currentAliases = tagStore.tags[newName]?.aliases ?? tagStore.tags[originalTag]?.aliases ?? []
    const toAdd = newAliases.filter((a) => !currentAliases.includes(a))
    const toRemove = currentAliases.filter((a) => !newAliases.includes(a))
    for (const a of toAdd) await window.api.tagsAddAlias(newName, a)
    for (const a of toRemove) await window.api.tagsRemoveAlias(newName, a)
    await tagStore.reload()
    cancelEdit()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: (err as Error).message, life: 5000 })
  }
}

// ── Delete ────────────────────────────────────────────────────────────────

function requestDelete(tag: string) {
  confirmDeleteTag.value = tag
}

async function confirmDelete() {
  const tag = confirmDeleteTag.value
  if (!tag) return
  confirmDeleteTag.value = null
  try {
    await tagStore.removeTag(tag)
    toast.add({ severity: 'success', summary: `Tag "${tag}" removed from dictionary`, life: 3000 })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: (err as Error).message, life: 5000 })
  }
}

// ── Keyboard ──────────────────────────────────────────────────────────────

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (editingTag.value) {
      cancelEdit()
    } else if (confirmDeleteTag.value) {
      confirmDeleteTag.value = null
    } else {
      emit('close')
    }
  }
}

onMounted(async () => {
  if (!tagStore.loaded) await tagStore.load()
})
</script>

<template>
  <div
    class="tag-manager-overlay"
    @click.self="emit('close')"
  >
    <div
      class="tag-manager"
      @keydown="handleKeydown"
    >
      <!-- Header -->
      <div class="tm-header">
        <h3 class="tm-title">
          <i class="pi pi-tags" />
          Tag Dictionary
        </h3>
        <div class="tm-header-actions">
          <span class="tm-count">{{ tagStore.tagCount }} tags</span>
          <Button
            label="Sync from archive"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            size="small"
            :loading="syncing"
            title="Add any archive tags not yet in dictionary"
            @click="syncFromArchive"
          />
          <Button
            icon="pi pi-times"
            text
            rounded
            @click="emit('close')"
          />
        </div>
      </div>

      <!-- Sync note -->
      <p class="tm-note">
        Renaming a tag here updates the dictionary only. Use <em>Retag archive</em> (coming in a future update) to update existing QA pairs.
      </p>

      <!-- Filter + sort -->
      <div class="tm-toolbar">
        <InputText
          v-model="filterQuery"
          placeholder="Filter tags..."
          class="tm-filter"
          size="small"
        />
        <div class="tm-sort-group">
          <Button
            label="A–Z"
            size="small"
            :severity="sortBy === 'name' ? 'primary' : 'secondary'"
            :outlined="sortBy !== 'name'"
            @click="sortBy = 'name'"
          />
          <Button
            label="Usage"
            size="small"
            :severity="sortBy === 'usage' ? 'primary' : 'secondary'"
            :outlined="sortBy !== 'usage'"
            @click="sortBy = 'usage'"
          />
        </div>
      </div>

      <!-- Add new tag -->
      <div class="tm-add-row">
        <InputText
          v-model="newTagName"
          placeholder="New tag name..."
          class="tm-add-name"
          size="small"
          @keydown.enter="addNewTag"
        />
        <InputText
          v-model="newTagAliases"
          placeholder="Aliases (comma-separated)"
          class="tm-add-aliases"
          size="small"
          @keydown.enter="addNewTag"
        />
        <Button
          icon="pi pi-plus"
          label="Add"
          size="small"
          :disabled="!newTagName.trim()"
          @click="addNewTag"
        />
      </div>

      <!-- Tag list -->
      <div class="tm-list">
        <div
          v-if="filteredTags.length === 0"
          class="tm-empty"
        >
          {{ tagStore.tagCount === 0 ? 'No tags yet. Click "Sync from archive" to import existing tags.' : 'No tags match filter.' }}
        </div>

        <div
          v-for="tag in filteredTags"
          :key="tag"
          class="tm-row"
          :class="{ 'tm-row--editing': editingTag === tag }"
        >
          <!-- View mode -->
          <template v-if="editingTag !== tag">
            <div class="tm-row-main">
              <span class="tm-tag-name">{{ tag }}</span>
              <span
                v-if="tagStore.tags[tag]?.aliases?.length"
                class="tm-aliases"
              >
                {{ tagStore.tags[tag].aliases.join(', ') }}
              </span>
            </div>
            <div class="tm-row-meta">
              <span
                class="tm-usage-count"
                :title="`Used in ${tagCounts[tag] ?? 0} QA pair(s)`"
              >
                {{ tagCounts[tag] ?? 0 }}
              </span>
              <Button
                icon="pi pi-pencil"
                text
                rounded
                size="small"
                title="Edit tag"
                @click="startEdit(tag)"
              />
              <Button
                icon="pi pi-trash"
                text
                rounded
                size="small"
                severity="danger"
                title="Remove from dictionary"
                @click="requestDelete(tag)"
              />
            </div>
          </template>

          <!-- Edit mode -->
          <template v-else>
            <div class="tm-edit-fields">
              <InputText
                v-model="editName"
                size="small"
                class="tm-edit-name"
                placeholder="Tag name"
              />
              <InputText
                v-model="editAliases"
                size="small"
                class="tm-edit-aliases"
                placeholder="Aliases (comma-separated)"
              />
            </div>
            <div class="tm-edit-actions">
              <Button
                icon="pi pi-check"
                text
                rounded
                size="small"
                title="Save"
                @click="saveEdit(tag)"
              />
              <Button
                icon="pi pi-times"
                text
                rounded
                size="small"
                severity="secondary"
                title="Cancel"
                @click="cancelEdit"
              />
            </div>
          </template>
        </div>
      </div>

      <!-- Delete confirmation -->
      <div
        v-if="confirmDeleteTag"
        class="tm-confirm-overlay"
      >
        <div class="tm-confirm">
          <p>Remove <strong>"{{ confirmDeleteTag }}"</strong> from dictionary?</p>
          <p class="tm-confirm-sub">
            QA pairs that use this tag will keep it; it just won't appear as a suggestion.
            <span v-if="tagCounts[confirmDeleteTag] ?? 0 > 0">
              Currently used by {{ tagCounts[confirmDeleteTag] }} pair(s).
            </span>
          </p>
          <div class="tm-confirm-actions">
            <Button
              label="Cancel"
              severity="secondary"
              outlined
              size="small"
              @click="confirmDeleteTag = null"
            />
            <Button
              label="Remove"
              severity="danger"
              size="small"
              @click="confirmDelete"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tag-manager-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.tag-manager {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 24px;
  width: 600px;
  max-width: 92vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  position: relative;
}

.tm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tm-title {
  font-size: 17px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.tm-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tm-count {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.tm-note {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin: 0;
  font-style: italic;
}

.tm-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tm-filter {
  flex: 1;
}

.tm-sort-group {
  display: flex;
  gap: 4px;
}

.tm-add-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  background: var(--surface-50);
  border-radius: 6px;
  border: 1px solid var(--surface-border);
}

.tm-add-name {
  width: 160px;
}

.tm-add-aliases {
  flex: 1;
}

.tm-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
}

.tm-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.tm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--surface-border);
  gap: 8px;
}

.tm-row:last-child {
  border-bottom: none;
}

.tm-row:hover {
  background: var(--surface-hover);
}

.tm-row--editing {
  background: var(--surface-50);
}

.tm-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tm-tag-name {
  font-size: 13px;
  font-weight: 500;
}

.tm-aliases {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.tm-row-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.tm-usage-count {
  font-size: 12px;
  color: var(--text-color-secondary);
  min-width: 24px;
  text-align: right;
}

.tm-edit-fields {
  display: flex;
  gap: 8px;
  flex: 1;
}

.tm-edit-name {
  width: 160px;
}

.tm-edit-aliases {
  flex: 1;
}

.tm-edit-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.tm-confirm-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
}

.tm-confirm {
  background: var(--surface-card);
  border-radius: 8px;
  padding: 20px 24px;
  max-width: 360px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.tm-confirm p {
  margin: 0 0 8px;
  font-size: 14px;
}

.tm-confirm-sub {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.tm-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
