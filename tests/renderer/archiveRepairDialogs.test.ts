import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DuplicateCleanupDialog from '../../src/components/DuplicateCleanupDialog.vue'
import RedundantThreadRepairDialog from '../../src/components/RedundantThreadRepairDialog.vue'
import { useThreadStore } from '../../src/stores/threadStore'

const DialogStub = { template: '<section><slot /><footer><slot name="footer" /></footer></section>' }
const ButtonStub = {
  props: ['label', 'disabled'], emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
}
const MessageStub = { template: '<div><slot /></div>' }
const RadioButtonStub = { props: ['modelValue', 'value'], template: '<input type="radio">' }
const global = { stubs: { Dialog: DialogStub, Button: ButtonStub, Message: MessageStub, RadioButton: RadioButtonStub } }

describe('archive repair dialogs', () => {
  it('routes a reviewed redundant group through the atomic repair API', async () => {
    const store = useThreadStore()
    store.threads = {
      thread_1: { name: 'Imported', items: ['qa_1'], importSourceId: 'claude:one' },
      thread_2: { name: 'Imported', items: ['qa_1'] },
    }
    window.api.threadsRepairRedundant = vi.fn(async () => ({
      threads: { thread_1: store.threads.thread_1 }, mergedGroups: 1, removedThreadIds: ['thread_2'],
    }))
    const wrapper = mount(RedundantThreadRepairDialog, { props: { visible: true }, global })

    await wrapper.get('button:not([disabled])').trigger('click')
    await flushPromises()

    expect(window.api.threadsRepairRedundant).toHaveBeenCalledWith([{
      itemIds: ['qa_1'], survivorId: 'thread_1', redundantIds: ['thread_2'],
    }])
    expect(Object.keys(store.threads)).toEqual(['thread_1'])
  })

  it('blocks automatic repair when identical membership has distinct import identities', () => {
    const store = useThreadStore()
    store.threads = {
      thread_1: { name: 'One', items: ['qa_1'], importSourceId: 'claude:one' },
      thread_2: { name: 'Two', items: ['qa_1'], importSourceId: 'claude:two' },
    }
    const wrapper = mount(RedundantThreadRepairDialog, { props: { visible: true }, global })
    expect(wrapper.text()).toContain('Manual review required')
    expect(wrapper.findAll('button').some((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })

  it('sends the visible keep choice as an explicit duplicate cleanup mapping', async () => {
    window.api.duplicatesScan = vi.fn(async () => ({
      scanned: 2, removableCount: 1, groups: [{
        key: 'hash', matchKind: 'content' as const,
        members: [
          { id: 'qa_1', title: 'Keep', source: 'x', timestamp: '2026-01-01', threadCount: 1, keep: true },
          { id: 'qa_2', title: 'Remove', source: 'x', timestamp: '2026-01-02', threadCount: 0, keep: false },
        ],
      }],
    }))
    window.api.duplicatesDelete = vi.fn(async () => ({ deleted: ['qa_2'], failed: [], threadsUpdated: 1 }))
    const wrapper = mount(DuplicateCleanupDialog, { props: { visible: false }, global })
    await wrapper.setProps({ visible: true })
    await flushPromises()

    const apply = wrapper.findAll('button').find((button) => button.text().includes('Delete 1 duplicate'))
    expect(apply).toBeDefined()
    await apply!.trigger('click')
    await flushPromises()

    expect(window.api.duplicatesDelete).toHaveBeenCalledWith([{
      key: 'hash', matchKind: 'content', keepId: 'qa_1', removeIds: ['qa_2'],
    }])
  })
})
