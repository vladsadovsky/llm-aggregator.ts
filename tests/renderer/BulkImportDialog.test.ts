import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BulkImportDialog from '../../src/components/BulkImportDialog.vue'
import { BulkImportSelectionSchema } from '../../shared/contracts/import'
import type { BulkImportPreviewSummary } from '../../src/global'

const DialogStub = {
  template: '<section><slot /><footer><slot name="footer" /></footer></section>',
}
const ButtonStub = {
  props: ['label', 'disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
}
const CheckboxStub = {
  props: ['modelValue', 'value'],
  emits: ['update:modelValue'],
  template: '<input type="checkbox">',
}
const MessageStub = { template: '<div><slot /></div>' }
const ProgressBarStub = {
  props: ['mode', 'value'],
  template: '<div :data-mode="mode" :data-value="value" />',
}

function preview(): BulkImportPreviewSummary {
  return {
    previewId: 'preview-1',
    format: 'copilot-activity-csv',
    formatLabel: 'Copilot activity history',
    provider: 'copilot',
    sourcePath: '/tmp/copilot.csv',
    sourceEntry: 'copilot.csv',
    threads: [
      {
        sourceId: 'conversation-1',
        name: 'Conversation',
        nameWasDerived: false,
        tags: [],
        pairCount: 2,
        duplicateCount: 0,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:01:00.000Z',
        warnings: [],
      },
    ],
    totalPairs: 2,
    duplicatePairs: 0,
    dateRange: {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-01T00:01:00.000Z',
    },
    warnings: [],
  }
}

function mountDialog(preparing = false) {
  return mount(BulkImportDialog, {
    props: {
      visible: true,
      preview: preview(),
      progress: null,
      result: null,
      preparing,
    },
    global: {
      stubs: {
        Dialog: DialogStub,
        Button: ButtonStub,
        Checkbox: CheckboxStub,
        Message: MessageStub,
        ProgressBar: ProgressBarStub,
      },
    },
  })
}

describe('BulkImportDialog contract seam', () => {
  it('emits a selection accepted by the runtime IPC schema', async () => {
    const wrapper = mountDialog()

    await wrapper.get('[data-testid="bulk-import-submit"]').trigger('click')

    const payload = wrapper.emitted('commit')?.[0]?.[0]
    expect(payload).toEqual({
      threadSourceIds: ['conversation-1'],
      skipDuplicates: true,
      includeDateInThreadNames: false,
    })
    expect(BulkImportSelectionSchema.safeParse(payload).success).toBe(true)
  })

  it('shows indeterminate feedback before the first progress event', () => {
    const wrapper = mountDialog(true)

    expect(wrapper.get('[data-testid="bulk-import-preparing"]').text()).toContain('Preparing import')
    expect(wrapper.get('[data-mode="indeterminate"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bulk-import-submit"]').exists()).toBe(false)
  })
})
