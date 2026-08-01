/**
 * Proves the renderer test harness itself works: jsdom DOM, @vue/test-utils
 * mounting + reactivity, an active Pinia, and the fresh typed fake window.api
 * from setup.ts. If this fails, no other renderer-unit test can be trusted.
 */
import { describe, it, expect } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { defineStore, getActivePinia } from 'pinia'

describe('renderer harness', () => {
  it('runs in a jsdom environment', () => {
    expect(typeof document).toBe('object')
    expect(typeof window).toBe('object')
  })

  it('mounts a component and updates the DOM reactively', async () => {
    const Counter = defineComponent({
      setup() {
        const n = ref(0)
        return { n, inc: () => (n.value += 1) }
      },
      template: `<button @click="inc">{{ n }}</button>`,
    })
    const wrapper = mount(Counter)
    expect(wrapper.text()).toBe('0')
    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).toBe('1')
  })

  it('has a fresh active Pinia per test', () => {
    expect(getActivePinia()).toBeDefined()
    const useCounter = defineStore('counter', { state: () => ({ v: 1 }) })
    const store = useCounter()
    store.v += 1
    expect(store.v).toBe(2)
  })

  it('exposes the typed fake window.api', async () => {
    expect(typeof window.api).toBe('object')
    expect(typeof window.api.settingsLoad).toBe('function')
    const settings = await window.api.settingsLoad()
    expect(settings.llmProvider).toBe('openai')
  })
})
