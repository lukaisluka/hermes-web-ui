// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SkillDetail from '@/components/hermes/skills/SkillDetail.vue'

const fetchSkillContentMock = vi.hoisted(() => vi.fn())
const fetchSkillFilesMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/hermes/skills', () => ({
  fetchSkillContent: fetchSkillContentMock,
  fetchSkillFiles: fetchSkillFilesMock,
  pinSkillApi: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('naive-ui', () => ({
  useMessage: () => ({ error: vi.fn() }),
}))

vi.mock('@/components/hermes/chat/MarkdownRenderer.vue', () => ({
  default: {
    props: ['content'],
    template: '<div class="markdown">{{ content }}</div>',
  },
}))

describe('SkillDetail read-only mode', () => {
  it('shows the safe description without requesting skill source or attached files', async () => {
    const wrapper = mount(SkillDetail, {
      props: {
        category: 'tools',
        skill: 'read-file',
        skillName: 'read-file',
        description: 'Reads an authorized file.',
        readOnly: true,
      },
    })

    await vi.dynamicImportSettled()

    expect(wrapper.text()).toContain('Reads an authorized file.')
    expect(wrapper.find('.pin-toggle').exists()).toBe(false)
    expect(fetchSkillContentMock).not.toHaveBeenCalled()
    expect(fetchSkillFilesMock).not.toHaveBeenCalled()
  })
})
