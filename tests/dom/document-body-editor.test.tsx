import { DocumentBodyEditor } from '@/components/document-body-editor'
import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
      'رنگ متن',
      'رنگ پس زمینه',
      'لیست نقطه ای',
      'لیست نشانه دار',
      'تراز متن',
      'موقعیت متن',
      'نقل قول',
      'خط افقی',
    ])

    const [
      undoButton,
      redoButton,
      directionButton,
      boldButton,
      italicButton,
      underlineButton,
      strikeButton,
      textColorButton,
      highlightColorButton,
      bulletListButton,
      orderedListButton,
      textAlignButton,
      textPositionButton,
      blockquoteButton,
      horizontalRuleButton,
    ] = buttons
    const markButtons = [
      boldButton,
      italicButton,
      underlineButton,
      strikeButton,
    ]
    const listButtons = [bulletListButton, orderedListButton]
    const blockButtons = [blockquoteButton]

    for (const button of [
      undoButton,
      redoButton,
      directionButton,
      textColorButton,
      highlightColorButton,
      textAlignButton,
      textPositionButton,
      horizontalRuleButton,
    ]) {
      expect(button).toHaveAttribute('data-variant', 'ghost')
      expect(button).toHaveAttribute('data-size', 'icon')
      expect(button).toHaveClass('hover:bg-gray-300')
      expect(button).not.toHaveAttribute('aria-pressed')
    }
    expect(undoButton).toBeDisabled()
    expect(redoButton).toBeDisabled()
    expect(directionButton).toBeEnabled()

    for (const button of [...markButtons, ...listButtons, ...blockButtons]) {
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

    const fontSizeSelect = within(toolbar).getByRole('combobox', {
      name: 'اندازه ی متن',
    })
    expect(fontSizeSelect).toHaveTextContent('۱۶px')

    const separators = toolbar.querySelectorAll('[data-slot="separator"]')
    expect(separators).toHaveLength(5)
    for (const separator of separators) {
      expect(separator).toHaveAttribute('data-orientation', 'vertical')
    }
    expect(separators[0]?.previousElementSibling).toBe(redoButton)
    expect(separators[0]?.nextElementSibling).toBe(directionButton)
    expect(separators[1]?.previousElementSibling).toBe(textStyleSelect)
    expect(separators[1]?.nextElementSibling).toBe(fontSizeSelect)
    expect(separators[2]?.previousElementSibling).toBe(highlightColorButton)
    expect(separators[2]?.nextElementSibling).toBe(bulletListButton)
    expect(separators[3]?.previousElementSibling).toBe(orderedListButton)
    expect(separators[3]?.nextElementSibling).toBe(textAlignButton)
    expect(textAlignButton.nextElementSibling).toBe(textPositionButton)
    expect(textPositionButton.nextElementSibling).toBe(separators[4])
    expect(separators[4]?.nextElementSibling).toBe(blockquoteButton)
    expect(blockquoteButton.nextElementSibling).toBe(horizontalRuleButton)

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

  it('keeps the empty placeholder on the chosen text alignment', async () => {
    renderEditor()
    const user = userEvent.setup()

    const editor = await editorTextbox()
    const alignButton = screen.getByRole('button', { name: 'تراز متن' })

    for (const [label, value] of [
      ['وسط چین', 'center'],
      ['چپ چین', 'left'],
      ['بلوکی', 'justify'],
      ['راست چین', 'right'],
    ]) {
      await user.click(alignButton)
      await user.click(
        await screen.findByRole('menuitemradio', { name: label }),
      )

      const emptyParagraph = editor.querySelector('p')
      expect(emptyParagraph).toHaveClass('is-editor-empty')
      expect(emptyParagraph).toHaveAttribute(
        'data-placeholder',
        'متن سند را اینجا بنویسید...',
      )
      expect(emptyParagraph).toHaveAttribute('style', `text-align: ${value};`)
    }
  })

  it('keeps the empty-body placeholder out of flow so it follows the alignment', async () => {
    const editorStyles = await readFile(
      'src/components/document-body-editor.css',
      'utf8',
    )
    expect(editorStyles).toMatch(/\.ProseMirror\s*\{[^}]*font-size: 16px;/)
    expect(editorStyles).toMatch(
      /\.is-editor-empty:first-child\s*\{[^}]*position: relative;/,
    )
    expect(editorStyles).toMatch(
      /\.is-editor-empty:first-child::before\s*\{[^}]*position: absolute;[^}]*inset-inline: 0;[^}]*color: var\(--muted-foreground\);[^}]*content: attr\(data-placeholder\);[^}]*text-align: inherit;/,
    )
    expect(editorStyles).not.toMatch(
      /\.is-editor-empty:first-child::before\s*\{[^}]*float:/,
    )
    expect(editorStyles).not.toMatch(/\[dir='ltr'\]\.is-editor-empty/)
  })

  it('cycles nested list markers by depth', async () => {
    const editorStyles = await readFile(
      'src/components/document-body-editor.css',
      'utf8',
    )

    const markerRules = [
      ['ol ol', 'lower-alpha'],
      ['ol ol ol', 'lower-roman'],
      ['ol ol ol ol', 'decimal'],
      ['ol ol ol ol ol', 'lower-alpha'],
      ['ol ol ol ol ol ol', 'lower-roman'],
      ['ol ol ol ol ol ol ol', 'decimal'],
      ['ul ul', 'circle'],
      ['ul ul ul', 'square'],
    ]

    for (const [selector, marker] of markerRules) {
      expect(editorStyles).toMatch(
        new RegExp(
          `\\.document-body-editor\\s+\\.ProseMirror\\s+${selector}\\s*\\{\\s*list-style-type:\\s*${marker};`,
        ),
      )
    }
  })

  it('takes vertical spacing from bottom margins and tightens list items', async () => {
    const editorStyles = await readFile(
      'src/components/document-body-editor.css',
      'utf8',
    )
    const compactStyles = editorStyles.replace(/\s+/g, ' ')

    const blockSelectors = [
      'p',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'ul',
      'ol',
      'li',
      'pre',
      'hr',
    ].map((tag) => `.document-body-editor .ProseMirror ${tag}`)

    expect(compactStyles).toContain(
      `${blockSelectors.join(', ')} { margin-top: 0; }`,
    )
    expect(compactStyles).toContain(
      '.document-body-editor .ProseMirror hr { margin-bottom: 1.5em; }',
    )
    expect(compactStyles).toContain(
      '.document-body-editor .ProseMirror li > * { margin-block: 0; }',
    )
    expect(compactStyles).toContain(
      '.document-body-editor .ProseMirror li > ul, .document-body-editor .ProseMirror li > ol { margin-block: 0.5em; }',
    )
  })

  it('paints the blockquote border with the primary color', async () => {
    const editorStyles = await readFile(
      'src/components/document-body-editor.css',
      'utf8',
    )

    expect(editorStyles.replace(/\s+/g, ' ')).toContain(
      '.document-body-editor .ProseMirror blockquote { border-inline-start-color: var(--primary); }',
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
      expect(await editorTextbox()).toHaveFocus()
    }

    const body = vi.mocked(onBodyChange).mock.calls.at(-1)?.[0]
    expect(body).toContain('<strong>')
    expect(body).toContain('<em>')
    expect(body).toContain('<u>')
    expect(body).toContain('<s>')
    expect(body).toContain('متن')
  })

  it('applies bulleted and numbered lists and returns focus to the editor', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')

    const bulletListButton = screen.getByRole('button', {
      name: 'لیست نقطه ای',
    })
    await user.click(bulletListButton)

    expect(bulletListButton).toHaveAttribute('aria-pressed', 'true')
    let body = vi.mocked(onBodyChange).mock.calls.at(-1)?.[0] ?? ''
    expect(body).toContain('<ul')
    expect(body).toContain('<li')
    expect(body).toContain('متن')
    expect(await editorTextbox()).toHaveFocus()

    await user.click(bulletListButton)

    expect(bulletListButton).toHaveAttribute('aria-pressed', 'false')
    body = vi.mocked(onBodyChange).mock.calls.at(-1)?.[0] ?? ''
    expect(body).not.toContain('<ul')
    expect(await editorTextbox()).toHaveFocus()

    const orderedListButton = screen.getByRole('button', {
      name: 'لیست نشانه دار',
    })
    await user.click(orderedListButton)

    expect(orderedListButton).toHaveAttribute('aria-pressed', 'true')
    body = vi.mocked(onBodyChange).mock.calls.at(-1)?.[0] ?? ''
    expect(body).toContain('<ol')
    expect(body).toContain('<li')
    expect(body).toContain('متن')
    expect(await editorTextbox()).toHaveFocus()
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
    expect(await editorTextbox()).toHaveFocus()

    await user.click(redoButton)

    expect(undoButton).toBeEnabled()
    expect(redoButton).toBeDisabled()
    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="rtl">م</p>')
    expect(await editorTextbox()).toHaveFocus()
  })

  it('applies paragraph and heading styles from the text style select', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('عنوان')

    const styleSelect = screen.getByRole('combobox', { name: 'سبک متن' })
    expect(styleSelect).toHaveTextContent('پاراگراف')
    expect(styleSelect).toHaveClass(
      'border-input',
      'bg-white',
      'hover:bg-white',
      'dark:bg-zinc-800',
      'dark:hover:bg-zinc-800',
    )
    expect(styleSelect).not.toHaveClass(
      'border-transparent',
      'dark:bg-transparent',
      'dark:hover:bg-muted/50',
    )

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
    expect(await editorTextbox()).toHaveFocus()

    await user.click(styleSelect)
    await user.click(await screen.findByRole('option', { name: 'پاراگراف' }))

    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl">عنوان</p><p dir="rtl"></p>',
    )
    expect(await editorTextbox()).toHaveFocus()
  })

  it('applies the four allowed font sizes and starts at 16px', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')
    await user.keyboard('{Control>}a{/Control}')

    const fontSizeSelect = screen.getByRole('combobox', {
      name: 'اندازه ی متن',
    })
    expect(fontSizeSelect).toHaveTextContent('۱۶px')
    expect(fontSizeSelect).toHaveClass(
      'border-input',
      'bg-white',
      'hover:bg-white',
      'dark:bg-zinc-800',
      'dark:hover:bg-zinc-800',
    )
    expect(fontSizeSelect).not.toHaveClass(
      'border-transparent',
      'dark:bg-transparent',
      'dark:hover:bg-muted/50',
    )

    await user.hover(fontSizeSelect)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('اندازه ی متن')

    await user.click(fontSizeSelect)
    expect(
      (await screen.findAllByRole('option')).map(
        (option) => option.textContent,
      ),
    ).toEqual(['۱۶px', '۱۸px', '۲۰px', '۲۴px'])
    await user.click(screen.getByRole('option', { name: '۱۸px' }))

    expect(fontSizeSelect).toHaveTextContent('۱۸px')
    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl"><span style="font-size: 18px;">متن</span></p>',
    )
    expect(await editorTextbox()).toHaveFocus()

    for (const [label, value] of [
      ['۲۰px', '20px'],
      ['۲۴px', '24px'],
      ['۱۶px', '16px'],
    ]) {
      await user.click(fontSizeSelect)
      await user.click(await screen.findByRole('option', { name: label }))

      expect(fontSizeSelect).toHaveTextContent(label)
      expect(onBodyChange).toHaveBeenLastCalledWith(
        `<p dir="rtl"><span style="font-size: ${value};">متن</span></p>`,
      )
      expect(await editorTextbox()).toHaveFocus()
    }

    await user.click(fontSizeSelect)
    await user.click(await screen.findByRole('option', { name: '۱۶px' }))

    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl"><span style="font-size: 16px;">متن</span></p>',
    )
    expect(await editorTextbox()).toHaveFocus()
  })

  it('returns focus to the editor after a keyboard selection in a toolbar select', async () => {
    renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')

    const fontSizeSelect = screen.getByRole('combobox', {
      name: 'اندازه ی متن',
    })
    await user.click(fontSizeSelect)
    await screen.findByRole('option', { name: '۱۶px' })
    await user.keyboard('{Enter}')

    expect(await editorTextbox()).toHaveFocus()
  })

  it('snaps pasted font sizes into the allowed sizes', async () => {
    const { onBodyChange } = renderEditor()
    const editor = await editorTextbox()
    const clipboardData = new DataTransfer()
    clipboardData.setData(
      'text/html',
      '<p><span style="font-size: 12px">کوچک</span><span style="font-size: 17px">میانه</span><span style="font-size: 40px">بزرگ</span></p>',
    )

    fireEvent.paste(editor, { clipboardData })

    const body = vi.mocked(onBodyChange).mock.calls.at(-1)?.[0] ?? ''
    expect(body).toContain('font-size: 16px')
    expect(body).toContain('font-size: 18px')
    expect(body).toContain('font-size: 24px')
    expect(body).not.toContain('12px')
    expect(body).not.toContain('17px')
    expect(body).not.toContain('40px')
  })

  it('applies text and highlight colors and clears them back to default', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')
    await user.keyboard('{Control>}a{/Control}')

    await user.click(screen.getByRole('button', { name: 'رنگ متن' }))
    const redSwatch = await screen.findByRole('button', { name: '#dc2626' })
    expect(redSwatch).toHaveClass(
      'hover:ring-2',
      'hover:ring-black',
      'hover:ring-offset-1',
      'hover:ring-offset-background',
      'focus-visible:ring-2',
      'focus-visible:ring-black',
      'focus-visible:ring-offset-1',
      'focus-visible:ring-offset-background',
      'dark:hover:ring-white',
      'dark:focus-visible:ring-white',
    )
    expect(redSwatch).not.toHaveClass('ring-2')
    await user.click(redSwatch)

    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl"><span style="color: #dc2626;">متن</span></p>',
    )
    expect(await editorTextbox()).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'رنگ پس زمینه' }))
    await user.click(await screen.findByRole('button', { name: '#dcfce7' }))

    const highlighted = vi.mocked(onBodyChange).mock.calls.at(-1)?.[0]
    expect(highlighted).toContain('data-color="#dcfce7"')
    expect(highlighted).toContain('background-color: #dcfce7')
    expect(highlighted).toContain('color: #dc2626')
    expect(await editorTextbox()).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'رنگ پس زمینه' }))
    await user.click(await screen.findByRole('menuitem', { name: 'پیش فرض' }))

    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl"><span style="color: #dc2626;">متن</span></p>',
    )
    expect(await editorTextbox()).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'رنگ متن' }))
    const activeRedSwatch = await screen.findByRole('button', {
      name: '#dc2626',
    })
    expect(activeRedSwatch).toHaveClass(
      'ring-2',
      'ring-foreground',
      'ring-offset-background',
    )
    expect(activeRedSwatch).not.toHaveClass('hover:ring-black')
    expect(activeRedSwatch).not.toHaveClass('dark:hover:ring-white')
    expect(activeRedSwatch).not.toHaveClass('focus-visible:ring-black')
    expect(activeRedSwatch).not.toHaveClass('dark:focus-visible:ring-white')
    await user.click(await screen.findByRole('menuitem', { name: 'پیش فرض' }))

    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="rtl">متن</p>')
    expect(await editorTextbox()).toHaveFocus()
  })

  it('traps tab focus inside the color menu and cycles through every swatch', async () => {
    renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'رنگ متن' }))

    const noColorItem = await screen.findByRole('menuitem', {
      name: 'پیش فرض',
    })
    const firstColor = screen.getByRole('button', { name: '#000000' })
    const secondColor = screen.getByRole('button', { name: '#262626' })
    const lastColor = screen.getByRole('button', { name: '#fdf4ff' })

    await user.tab()
    expect(noColorItem).toHaveFocus()

    await user.tab()
    expect(firstColor).toHaveFocus()

    await user.tab()
    expect(secondColor).toHaveFocus()

    await user.tab({ shift: true })
    expect(firstColor).toHaveFocus()

    await user.tab({ shift: true })
    expect(noColorItem).toHaveFocus()

    await user.tab({ shift: true })
    expect(lastColor).toHaveFocus()

    await user.tab()
    expect(noColorItem).toHaveFocus()
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
    expect(await editorTextbox()).toHaveFocus()

    await user.click(directionButton)
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'راست به چپ' }),
    )

    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="rtl">متن</p>')
    expect(await editorTextbox()).toHaveFocus()
  })

  it('applies text alignment from the alignment menu and returns focus to the editor', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')

    const alignButton = screen.getByRole('button', { name: 'تراز متن' })
    expect(alignButton.querySelector('svg')).toHaveClass('lucide-align-right')
    await user.click(alignButton)

    const menu = document.querySelector('[data-slot="dropdown-menu-content"]')
    expect(menu).toHaveClass('w-40')
    expect(
      await screen.findByRole('menuitemradio', { name: 'راست چین' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('menuitemradio', { name: 'چپ چین' }),
    ).toHaveAttribute('aria-checked', 'false')
    expect(
      (await screen.findAllByRole('menuitemradio')).map(
        (item) => item.textContent,
      ),
    ).toEqual(['راست چین', 'چپ چین', 'وسط چین', 'بلوکی'])
    expect(screen.getByRole('menuitemradio', { name: 'وسط چین' })).toHaveClass(
      'whitespace-nowrap',
    )

    await user.click(screen.getByRole('menuitemradio', { name: 'وسط چین' }))

    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl" style="text-align: center;">متن</p>',
    )
    expect(alignButton.querySelector('svg')).toHaveClass('lucide-align-center')
    expect(await editorTextbox()).toHaveFocus()

    await user.click(alignButton)
    expect(
      await screen.findByRole('menuitemradio', { name: 'وسط چین' }),
    ).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('menuitemradio', { name: 'وسط چین' }))

    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl" style="text-align: center;">متن</p>',
    )
    expect(await editorTextbox()).toHaveFocus()
  })

  it('shows the block direction as the alignment when no alignment is set', async () => {
    renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')

    await user.click(screen.getByRole('button', { name: 'جهت متن' }))
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'چپ به راست' }),
    )

    const alignButton = screen.getByRole('button', { name: 'تراز متن' })
    expect(alignButton.querySelector('svg')).toHaveClass('lucide-align-left')
    await user.click(alignButton)

    expect(
      await screen.findByRole('menuitemradio', { name: 'چپ چین' }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('applies text position from the position menu and returns focus to the editor', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')
    await user.keyboard('{Control>}a{/Control}')

    const positionButton = screen.getByRole('button', { name: 'موقعیت متن' })
    expect(positionButton.querySelector('svg')).toHaveClass('lucide-baseline')
    await user.click(positionButton)

    expect(
      await screen.findByRole('menuitemradio', { name: 'معمولی' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      (await screen.findAllByRole('menuitemradio')).map(
        (item) => item.textContent,
      ),
    ).toEqual(['معمولی', 'بالا نویس', 'پایین نویس'])

    await user.click(screen.getByRole('menuitemradio', { name: 'بالا نویس' }))

    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl"><sup>متن</sup></p>',
    )
    expect(positionButton.querySelector('svg')).toHaveClass(
      'lucide-superscript',
    )
    expect(await editorTextbox()).toHaveFocus()

    await user.click(positionButton)
    expect(
      await screen.findByRole('menuitemradio', { name: 'بالا نویس' }),
    ).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('menuitemradio', { name: 'پایین نویس' }))

    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl"><sub>متن</sub></p>',
    )
    expect(positionButton.querySelector('svg')).toHaveClass('lucide-subscript')
    expect(await editorTextbox()).toHaveFocus()

    await user.click(positionButton)
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'معمولی' }),
    )

    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="rtl">متن</p>')
    expect(await editorTextbox()).toHaveFocus()

    await user.click(positionButton)
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'معمولی' }),
    )

    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="rtl">متن</p>')
    expect(await editorTextbox()).toHaveFocus()
  })

  it('toggles a blockquote after the text position menu and returns focus to the editor', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')

    const quoteButton = screen.getByRole('button', { name: 'نقل قول' })
    expect(quoteButton).toHaveAttribute('aria-pressed', 'false')

    await user.click(quoteButton)

    expect(quoteButton).toHaveAttribute('aria-pressed', 'true')
    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<blockquote dir="rtl"><p dir="rtl">متن</p></blockquote><p dir="rtl"></p>',
    )
    expect(await editorTextbox()).toHaveFocus()

    await user.click(quoteButton)

    expect(quoteButton).toHaveAttribute('aria-pressed', 'false')
    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl">متن</p><p dir="rtl"></p>',
    )
    expect(await editorTextbox()).toHaveFocus()
  })

  it('inserts a horizontal rule after the text position menu and returns focus to the editor', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')

    const ruleButton = screen.getByRole('button', { name: 'خط افقی' })
    await user.hover(ruleButton)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('خط افقی')

    await user.click(ruleButton)

    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl">متن</p><hr dir="rtl"><p dir="rtl"></p>',
    )
    expect(await editorTextbox()).toHaveFocus()
  })

  it('returns focus to the editor after a keyboard selection in a toolbar menu', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await typeInEditor('متن')

    const alignButton = screen.getByRole('button', { name: 'تراز متن' })
    alignButton.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('menuitemradio', { name: 'راست چین' })
    await user.keyboard('{Enter}')

    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl" style="text-align: right;">متن</p>',
    )
    expect(await editorTextbox()).toHaveFocus()
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
