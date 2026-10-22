import { DocumentBodyEditor } from '@/components/document-body-editor'
import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFile } from 'node:fs/promises'
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
      'bg-gray-100',
      'px-6',
      'dark:bg-zinc-700',
    )
    expect(toolbar).not.toHaveClass('border-x')
    expect(toolbar).not.toHaveClass('px-2')
    expect(editor.closest('.document-body-editor')).not.toHaveClass('mt-2')

    const buttons = within(toolbar).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'برگرداندن',
      'بازگرداندن',
      'جهت متن',
      'توپر',
      'کج',
      'زیرخط دار',
      'خط خورده',
    ])

    const [undoButton, redoButton, directionButton, ...markButtons] = buttons
    for (const button of [undoButton, redoButton, directionButton]) {
      expect(button).toHaveAttribute('data-variant', 'ghost')
      expect(button).toHaveAttribute('data-size', 'icon')
      expect(button).toHaveClass('hover:bg-gray-300')
      expect(button).not.toHaveAttribute('aria-pressed')
    }
    expect(undoButton).toBeDisabled()
    expect(redoButton).toBeDisabled()
    expect(directionButton).toBeEnabled()

    for (const button of markButtons) {
      expect(button).toHaveAttribute('data-variant', 'ghost')
      expect(button).toHaveAttribute('data-size', 'icon')
      expect(button).toHaveAttribute('aria-pressed', 'false')
      expect(button).toHaveClass('hover:bg-gray-300')
      expect(button).not.toHaveClass('bg-primary')
    }

    const textStyleSelect = within(toolbar).getByRole('combobox', {
      name: 'سبک متن',
    })
    expect(textStyleSelect).toHaveTextContent('پاراگراف')

    const separators = toolbar.querySelectorAll('[data-slot="separator"]')
    expect(separators).toHaveLength(2)
    for (const separator of separators) {
      expect(separator).toHaveAttribute('data-orientation', 'vertical')
    }
    expect(separators[0]?.previousElementSibling).toBe(redoButton)
    expect(separators[0]?.nextElementSibling).toBe(directionButton)
    expect(separators[1]?.previousElementSibling).toBe(textStyleSelect)
    expect(separators[1]?.nextElementSibling).toBe(markButtons[0])

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

  it('keeps the empty-body placeholder on every block type and follows its direction', async () => {
    const editorStyles = await readFile(
      'src/components/document-body-editor.css',
      'utf8',
    )
    expect(editorStyles).toMatch(
      /\.ProseMirror\s+\.is-editor-empty:first-child::before\s*\{[^}]*color: var\(--muted-foreground\);/,
    )
    expect(editorStyles).toMatch(
      /\.is-editor-empty:first-child::before\s*\{[^}]*float: right;/,
    )
    expect(editorStyles).toMatch(
      /\[dir='ltr'\]\.is-editor-empty:first-child::before\s*\{[^}]*float: left;/,
    )
  })

  it('keeps the placeholder when an empty body is switched to a heading', async () => {
    renderEditor()
    const user = userEvent.setup()

    const styleSelect = screen.getByRole('combobox', { name: 'سبک متن' })
    await user.click(styleSelect)
    await user.click(await screen.findByRole('option', { name: 'عنوان ۲' }))

    const editor = await editorTextbox()
    const emptyHeading = editor.querySelector('h2')
    expect(emptyHeading).toHaveClass('is-editor-empty')
    expect(emptyHeading).toHaveAttribute(
      'data-placeholder',
      'متن سند را اینجا بنویسید...',
    )
  })

  it('reports the editor HTML whenever the body changes', async () => {
    const { onBodyChange } = renderEditor()

    await typeInEditor('سلام')

    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="rtl">سلام</p>')
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

    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="rtl">سلام دنیا</p>')
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
      expect(button).toHaveClass(
        'bg-primary',
        'text-primary-foreground',
        'hover:bg-primary/80',
      )
      expect(button).not.toHaveClass('hover:bg-gray-300')
    }

    const body = vi.mocked(onBodyChange).mock.calls.at(-1)?.[0]
    expect(body).toContain('<strong>')
    expect(body).toContain('<em>')
    expect(body).toContain('<u>')
    expect(body).toContain('<s>')
    expect(body).toContain('متن')
  })

  it('enables undo after an edit, enables redo after undoing, and reports each body', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    const undoButton = screen.getByRole('button', { name: 'برگرداندن' })
    const redoButton = screen.getByRole('button', { name: 'بازگرداندن' })

    expect(undoButton).toBeDisabled()
    expect(redoButton).toBeDisabled()

    await typeInEditor('م')

    expect(undoButton).toBeEnabled()
    expect(redoButton).toBeDisabled()
    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="rtl">م</p>')

    await user.click(undoButton)

    expect(undoButton).toBeDisabled()
    expect(redoButton).toBeEnabled()
    expect(onBodyChange).toHaveBeenLastCalledWith('')

    await user.click(redoButton)

    expect(undoButton).toBeEnabled()
    expect(redoButton).toBeDisabled()
    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="rtl">م</p>')
  })

  it('applies paragraph and heading styles from the text style select', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('عنوان')

    const styleSelect = screen.getByRole('combobox', { name: 'سبک متن' })
    expect(styleSelect).toHaveTextContent('پاراگراف')

    await user.click(styleSelect)
    await user.click(await screen.findByRole('option', { name: 'عنوان ۲' }))

    expect(styleSelect).toHaveTextContent('عنوان ۲')
    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<h2 dir="rtl">عنوان</h2><p dir="rtl"></p>',
    )
    expect(await editorTextbox()).toHaveFocus()

    await user.click(styleSelect)
    await user.click(await screen.findByRole('option', { name: 'پاراگراف' }))

    expect(styleSelect).toHaveTextContent('پاراگراف')
    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl">عنوان</p><p dir="rtl"></p>',
    )
  })

  it('applies right-to-left and left-to-right directions from the direction menu', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')

    const directionButton = screen.getByRole('button', { name: 'جهت متن' })
    await user.click(directionButton)

    const menu = document.querySelector('[data-slot="dropdown-menu-content"]')
    expect(menu).toHaveClass('w-40')
    expect(
      await screen.findByRole('menuitemradio', { name: 'راست به چپ' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('menuitemradio', { name: 'چپ به راست' }),
    ).toHaveAttribute('aria-checked', 'false')
    expect(
      screen.getByRole('menuitemradio', { name: 'راست به چپ' }),
    ).toHaveClass('whitespace-nowrap')

    await user.click(screen.getByRole('menuitemradio', { name: 'چپ به راست' }))

    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="ltr">متن</p>')
    expect(await editorTextbox()).toHaveFocus()

    await user.click(directionButton)

    expect(
      await screen.findByRole('menuitemradio', { name: 'چپ به راست' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('menuitemradio', { name: 'راست به چپ' }),
    ).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByRole('menuitemradio', { name: 'راست به چپ' }))

    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="rtl">متن</p>')
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
