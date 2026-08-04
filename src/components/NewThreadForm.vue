<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

const emit = defineEmits<{
  submit: [name: string, tags: string[]]
  cancel: []
}>()

const name = ref('')
const tags = ref('')
const canCreate = computed(() => name.value.trim().length > 0)

function parsedTags(): string[] {
  return tags.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName) return
  emit('submit', trimmedName, parsedTags())
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    submit()
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
}
</script>

<template>
  <div class="new-thread-inputs">
    <InputText
      v-model="name"
      data-testid="new-thread-name-input"
      placeholder="Thread name..."
      size="small"
      class="w-full"
      autofocus
      @keydown="onKeydown"
    />
    <InputText
      v-model="tags"
      data-testid="new-thread-tags-input"
      placeholder="Tags (comma-separated)"
      size="small"
      class="w-full"
      @keydown="onKeydown"
    />
    <div class="edit-actions">
      <Button
        label="Cancel"
        severity="secondary"
        text
        size="small"
        data-testid="new-thread-cancel"
        @click="emit('cancel')"
      />
      <Button
        label="Create"
        size="small"
        data-testid="new-thread-create"
        :disabled="!canCreate"
        @click="submit"
      />
    </div>
  </div>
</template>

<style scoped>
.new-thread-inputs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 8px;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 2px;
}

.w-full {
  width: 100%;
}
</style>
