<script setup lang="ts">
import type { QAPairData } from '../types/QAPair'
import Chip from 'primevue/chip'

defineProps<{
  pair: QAPairData
}>()

function formatDate(timestamp: string): string {
  if (!timestamp) return '—'
  try {
    const d = new Date(timestamp)
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return timestamp
  }
}

function sourceIcon(source: string): string {
  const icons: Record<string, string> = {
    claude: 'pi pi-bolt',
    chatGPT: 'pi pi-comments',
    gemini: 'pi pi-star',
    copilot: 'pi pi-microsoft',
    deepseek: 'pi pi-search',
  }
  return icons[source] || 'pi pi-question-circle'
}
</script>

<template>
  <div class="metadata-bar">
    <div class="meta-row">
      <!-- Title -->
      <h2 class="qa-title">{{ pair.title }}</h2>
    </div>

    <div class="meta-row meta-details">
      <!-- Source/Model -->
      <span class="meta-item" v-if="pair.source">
        <i :class="sourceIcon(pair.source)" />
        <span class="meta-value">{{ pair.source }}</span>
      </span>

      <!-- Date -->
      <span class="meta-item">
        <i class="pi pi-calendar" />
        <span class="meta-value">{{ formatDate(pair.timestamp) }}</span>
      </span>

      <!-- URL -->
      <span class="meta-item" v-if="pair.url">
        <i class="pi pi-link" />
        <span class="meta-value meta-url" :title="pair.url">{{ pair.url }}</span>
      </span>

      <!-- Version -->
      <span class="meta-item">
        <i class="pi pi-history" />
        <span class="meta-value">v{{ pair.version }}</span>
      </span>
    </div>

    <!-- Tags -->
    <div class="meta-row" v-if="pair.tags && pair.tags.length > 0">
      <i class="pi pi-tag meta-icon" />
      <Chip
        v-for="tag in pair.tags"
        :key="tag"
        :label="tag"
        class="tag-chip"
      />
    </div>
  </div>
</template>

<style scoped>
.metadata-bar {
  background: var(--surface-ground);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-row + .meta-row {
  margin-top: 8px;
}

.qa-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--text-color);
}

.meta-details {
  gap: 16px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.meta-value {
  font-size: 12px;
}

.meta-url {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-icon {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.tag-chip {
  font-size: 11px;
}
</style>
