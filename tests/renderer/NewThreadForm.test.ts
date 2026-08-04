import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NewThreadForm from '../../src/components/NewThreadForm.vue'

const InputTextStub = {
  props: ['modelValue', 'size'],
  emits: ['update:modelValue', 'keydown'],
  template: `
    <input
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      @keydown="$emit('keydown', $event)"
    >
  `,
}

const ButtonStub = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
}

function mountForm() {
  return mount(NewThreadForm, {
    global: {
      stubs: {
        InputText: InputTextStub,
        Button: ButtonStub,
      },
    },
  })
}

describe('NewThreadForm', () => {
  it('keeps its draft local and emits normalized creation data', async () => {
    const wrapper = mountForm()
    const inputs = wrapper.findAll('input')

    await inputs[0].setValue('  Performance work  ')
    await inputs[1].setValue(' ui, performance , , scale ')
    await wrapper.get('[data-testid="new-thread-create"]').trigger('click')

    expect(wrapper.emitted('submit')).toEqual([['Performance work', ['ui', 'performance', 'scale']]])
  })

  it('supports Enter to create and Escape to cancel', async () => {
    const wrapper = mountForm()
    const input = wrapper.get('[data-testid="new-thread-name-input"]')

    await input.setValue('Thread')
    await input.trigger('keydown', { key: 'Enter' })
    await input.trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('submit')).toEqual([['Thread', []]])
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
