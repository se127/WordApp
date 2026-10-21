import { DocumentBodyEditor } from '@/components/document-body-editor'
import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'

function editorElement(body: string, onBodyChange: (body: string) => void) {
  return (
    <StrictMode>
      <DirectionProvider dir="rtl">
        <TooltipProvider>
          <DocumentBodyEditor body={body} onBodyChange={onBodyChange} />
        </TooltipProvider>
      </DirectionProvider>
    </StrictMode>
  )
}

function renderEditor({
  body = '',
  onBodyChange = vi.fn(),
}: {
  body?: string
  onBodyChange?: (body: string) => void
} = {}) {
  return {
    ...render(editorElement(body, onBodyChange)),
    onBodyChange,
  }
}

async function editorTextbox(): Promise<HTMLElement> {
  return screen.findByRole('textbox', { name: 'متن سند' })
}

function placeCursorAtEnd(editor: HTMLElement): void {
  const paragraph = editor.querySelector('p') ?? editor
  const range = document.createRange()
  range.selectNodeContents(paragraph)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

async function typeInEditor(text: string): Promise<HTMLElement> {
  const user = userEvent.setup()
  const editor = await editorTextbox()
  await user.click(editor)
  placeCursorAtEnd(editor)
  await user.keyboard(text)
  return editor
}

describe('DocumentBodyEditor', () => {
  it('shows the stored body in a prose scroll area under a full-width ghost toolbar with Farsi tooltips', async () => {
    const onBodyChange = vi.fn()
    renderEditor({
      body: '<p>متن <strong>مهم</strong></p>',
      onBodyChange,
    })

    const editor = await editorTextbox()
    expect(editor).toHaveTextContent('متن مهم')
    expect(editor.querySelector('strong')).toHaveTextContent('مهم')
    expect(editor.closest('.document-body-prose')).toHaveClass(
      'prose',
      'prose-neutral',
      'text-foreground',
      'dark:prose-invert',
      'dark:text-white',
      'max-w-none',
    )
    expect(editor.closest('[data-slot="scroll-area"]')).not.toBeNull()
    expect(editor.closest('[data-slot="scroll-area-viewport"]')).not.toBeNull()

    const toolbar = screen.getByRole('toolbar', {
      name: 'ابزارهای ویرایش متن',
    })
    expect(toolbar).toHaveAttribute('dir', 'rtl')
    expect(toolbar).toHaveClass(
      'w-full',
      'border-y',
      'bg-emerald-50',
      'px-6',
      'dark:bg-zinc-900',
    )
    expect(toolbar).not.toHaveClass('border-x')
    expect(toolbar).not.toHaveClass('px-2')
    expect(editor.closest('.document-body-editor')).not.toHaveClass('mt-2')

    const buttons = within(toolbar).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'توپر',
      'کج',
      'زیرخط دار',
      'خط خورده',
    ])

    for (const button of buttons) {
      expect(button).toHaveAttribute('data-variant', 'ghost')
      expect(button).toHaveAttribute('data-size', 'icon')
      expect(button).toHaveAttribute('aria-pressed', 'false')
    }

    const user = userEvent.setup()
    await user.hover(screen.getByRole('button', { name: 'توپر' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('توپر')
    expect(onBodyChange).not.toHaveBeenCalled()
  })

  it('shows the Farsi placeholder in an empty body and hides it after typing', async () => {
    renderEditor()

    const editor = await editorTextbox()
    const emptyParagraph = editor.querySelector('p')
    expect(emptyParagraph).toHaveClass('is-editor-empty')
    expect(emptyParagraph).toHaveAttribute(
      'data-placeholder',
      'متن سند را اینجا بنویسید...',
    )

    await typeInEditor('متن')

    expect(editor.querySelector('p')).not.toHaveClass('is-editor-empty')
  })

  it('reports the editor HTML whenever the body changes', async () => {
    const { onBodyChange } = renderEditor()

    await typeInEditor('سلام')

    expect(onBodyChange).toHaveBeenLastCalledWith('<p>سلام</p>')
  })

  it('keeps the caret and text when the saved body refreshes the editor props', async () => {
    const onBodyChange = vi.fn()
    const { rerender } = render(editorElement('', onBodyChange))
    const user = userEvent.setup()

    const editor = await editorTextbox()
    await user.click(editor)
    placeCursorAtEnd(editor)
    await user.keyboard('سلام')

    rerender(editorElement('<p>سلام</p>', onBodyChange))

    expect(editor).toHaveFocus()
    expect(editor).toHaveTextContent('سلام')
    await user.keyboard(' دنیا')

    expect(onBodyChange).toHaveBeenLastCalledWith('<p>سلام دنیا</p>')
  })

  it('applies the four toolbar marks to the selection and marks their buttons pressed', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')
    await user.keyboard('{Control>}a{/Control}')

    for (const label of ['توپر', 'کج', 'زیرخط دار', 'خط خورده']) {
      const button = screen.getByRole('button', { name: label })
      expect(button).toHaveAttribute('data-variant', 'ghost')
      await user.click(button)
      expect(button).toHaveAttribute('aria-pressed', 'true')
      expect(button).toHaveAttribute('data-variant', 'default')
    }

    const body = vi.mocked(onBodyChange).mock.calls.at(-1)?.[0]
    expect(body).toContain('<strong>')
    expect(body).toContain('<em>')
    expect(body).toContain('<u>')
    expect(body).toContain('<s>')
    expect(body).toContain('متن')
  })

  it('reports an emptied editor as an empty body', async () => {
    const { onBodyChange } = renderEditor({ body: '<p>متن</p>' })
    const user = userEvent.setup()

    const editor = await editorTextbox()
    await user.click(editor)
    await user.keyboard('{Control>}a{/Control}{Backspace}')

    expect(onBodyChange).toHaveBeenLastCalledWith('')
  })
})
