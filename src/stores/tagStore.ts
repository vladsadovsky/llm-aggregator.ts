import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TagEntry } from '../global.d'

export const useTagStore = defineStore('tags', () => {
  // ── State ─────────────────────────────────────────────────────────────────
  const tags = ref<Record<string, TagEntry>>({})
  const enforcement = ref<'off' | 'warn' | 'strict'>('warn')
  const softLimit = ref(50)
  const hardLimit = ref(100)
  const loaded = ref(false)

  // ── Derived ───────────────────────────────────────────────────────────────
  const canonicalTags = computed(() => Object.keys(tags.value).sort())
  const tagCount = computed(() => canonicalTags.value.length)
  const enforcementActive = computed(() => enforcement.value !== 'off')

  /** When vocabulary hits the hard limit, enforcement auto-escalates to strict even in warn mode. */
  const effectiveEnforcement = computed<'off' | 'warn' | 'strict'>(() => {
    if (enforcement.value === 'off') return 'off'
    if (enforcement.value === 'strict') return 'strict'
    if (tagCount.value >= hardLimit.value) return 'strict'
    return 'warn'
  })

  /** True when vocabulary is at or above the soft limit (show advisory in warn mode). */
  const atSoftLimit = computed(() => enforcement.value !== 'off' && tagCount.value >= softLimit.value)

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Return canonical form if `input` is a known tag or alias; null otherwise. */
  function resolveTag(input: string): string | null {
    const normalized = input.trim().toLowerCase()
    if (!normalized) return null
    if (tags.value[normalized]) return normalized
    for (const [canonical, entry] of Object.entries(tags.value)) {
      if (entry.aliases.some((a) => a.toLowerCase() === normalized)) {
        return canonical
      }
    }
    return null
  }

  function isKnownTag(input: string): boolean {
    return resolveTag(input) !== null
  }

  /** Filter a list of tag inputs, returning only those unknown to the dictionary. */
  function filterNewTags(inputs: string[]): string[] {
    return inputs.filter((t) => !isKnownTag(t))
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function load() {
    const [dict, settings] = await Promise.all([
      window.api.tagsLoad(),
      window.api.settingsLoad(),
    ])
    tags.value = dict.tags
    enforcement.value = settings.tagEnforcement ?? 'warn'
    softLimit.value = settings.tagSoftLimit ?? 50
    hardLimit.value = settings.tagHardLimit ?? 100
    loaded.value = true
  }

  async function reload() {
    const dict = await window.api.tagsLoad()
    tags.value = dict.tags
  }

  // ── Mutations (call IPC then refresh) ─────────────────────────────────────

  async function addTag(tag: string, aliases: string[] = []) {
    await window.api.tagsAdd(tag, aliases)
    await reload()
  }

  async function removeTag(tag: string) {
    await window.api.tagsRemove(tag)
    await reload()
  }

  async function renameTag(oldTag: string, newTag: string) {
    await window.api.tagsRename(oldTag, newTag)
    await reload()
  }

  async function addAlias(tag: string, alias: string) {
    await window.api.tagsAddAlias(tag, alias)
    await reload()
  }

  async function removeAlias(tag: string, alias: string) {
    await window.api.tagsRemoveAlias(tag, alias)
    await reload()
  }

  async function sync(): Promise<{ added: string[] }> {
    const result = await window.api.tagsSync()
    await reload()
    return result
  }

  return {
    tags,
    enforcement,
    softLimit,
    hardLimit,
    loaded,
    canonicalTags,
    tagCount,
    enforcementActive,
    effectiveEnforcement,
    atSoftLimit,
    resolveTag,
    isKnownTag,
    filterNewTags,
    load,
    reload,
    addTag,
    removeTag,
    renameTag,
    addAlias,
    removeAlias,
    sync,
  }
})
