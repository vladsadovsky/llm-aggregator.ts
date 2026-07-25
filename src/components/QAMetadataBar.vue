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
    chatgpt: 'pi pi-comments',
    gemini: 'pi pi-star',
    copilot: 'pi pi-microsoft',
    deepseek: 'pi pi-search',
  }
  return icons[source.toLowerCase()] || icons[source] || 'pi pi-question-circle'
}
</script>

<template>
  <div class="metadata-bar">
    <div class="meta-row">
      <!-- Title -->
      <h2 class="qa-title">
        {{ pair.title }}
      </h2>
    </div>

    <div class="meta-row meta-details">
      <!-- Source/Model -->
      <span
        v-if="pair.source"
        class="meta-item"
      >
        <i :class="sourceIcon(pair.source)" />
        <span class="meta-value">{{ pair.source }}</span>
      </span>

      <!-- Date -->
      <span class="meta-item">
        <i class="pi pi-calendar" />
        <span class="meta-value">{{ formatDate(pair.timestamp) }}</span>
      </span>

      <!-- URL -->
      <span
        v-if="pair.url"
        class="meta-item"
      >
        <i class="pi pi-link" />
        <span
          class="meta-value meta-url"
          :title="pair.url"
        >{{ pair.url }}</span>
      </span>

      <!-- Version -->
      <span class="meta-item">
        <i class="pi pi-history" />
        <span class="meta-value">v{{ pair.version }}</span>
      </span>
    </div>

    <!-- Tags -->
    <div
      v-if="pair.tags && pair.tags.length > 0"
      class="meta-row"
    >
      <i class="pi pi-tag meta-icon" />
      <Chip
        v-for="tag in pair.tags"
        :key="tag"
        :label="tag"
        class="tag-chip"
      />
    </div>

    <!-- AI metadata row -->
    <div
      v-if="pair.aiTopic || pair.aiStatus || pair.aiConfidence"
      class="meta-row ai-meta-row"
    >
      <i
        class="pi pi-sparkles meta-icon ai-icon"
        title="AI-generated metadata"
      />
      <span
        v-if="pair.aiTopic"
        class="meta-item ai-topic"
        :title="pair.aiSummary"
      >
        {{ pair.aiTopic }}
      </span>
      <Chip
        v-if="pair.aiStatus"
        :label="pair.aiStatus"
        :class="['ai-chip', `ai-status-${pair.aiStatus}`]"
      />
      <Chip
        v-if="pair.aiConfidence"
        :label="pair.aiConfidence"
        :class="['ai-chip', `ai-confidence-${pair.aiConfidence}`]"
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

.ai-meta-row {
  margin-top: 4px;
  opacity: 0.85;
}

.ai-icon {
  color: var(--primary-color);
}

.ai-topic {
  font-size: 12px;
  color: var(--text-color-secondary);
  font-style: italic;
}

.ai-chip {
  font-size: 10px;
}

/* Status colors */
.ai-status-open { --chip-bg: #e0f0ff; --chip-color: #1a6bb5; }
.ai-status-closed { --chip-bg: #e6f9ec; --chip-color: #1e7a3a; }
.ai-status-speculative { --chip-bg: #fff8e0; --chip-color: #8a6200; }
.ai-status-dead-end { --chip-bg: #f0f0f0; --chip-color: #666; }

/* Confidence colors */
.ai-confidence-speculative { --chip-bg: #fff0f0; --chip-color: #a33; }
.ai-confidence-working { --chip-bg: #fff8e0; --chip-color: #8a6200; }
.ai-confidence-confident { --chip-bg: #e0f0ff; --chip-color: #1a6bb5; }
.ai-confidence-validated { --chip-bg: #e6f9ec; --chip-color: #1e7a3a; }

:deep(.ai-chip .p-chip) {
  background: var(--chip-bg);
  color: var(--chip-color);
}
</style>
