import { DocumentBodyEditor } from '@/components/document-body-editor'
import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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
    const editorViewport = editor.closest('[data-slot="scroll-area-viewport"]')
    const editorContent = editorViewport?.firstElementChild
    expect(editorContent).toHaveAttribute('data-slot', 'scroll-area-content')
    expect(editorContent?.firstElementChild).toBe(
      editor.closest('.document-body-prose'),
    )

    const toolbar = screen.getByRole('toolbar', {
      name: 'ابزارهای ویرایش متن',
    })
    expect(toolbar).toHaveAttribute('dir', 'rtl')
    expect(toolbar).toHaveClass(
      '-mx-6',
      'flex',
      'flex-wrap',
      'gap-x-1',
      'gap-y-2',
      'border-y',
      'bg-gray-100',
      'px-6',
      'dark:bg-zinc-800',
    )
    expect(toolbar).not.toHaveClass('w-full')
    expect(toolbar).not.toHaveClass('border-x')
    expect(toolbar).not.toHaveClass('px-2')
    expect(toolbar).not.toHaveClass('px-4')
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
      'کد',
      'نقل قول',
      'خط افقی',
      'افزودن جدول',
      'افزودن / ویرایش لینک',
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
      codeBlockButton,
      blockquoteButton,
      horizontalRuleButton,
      tableButton,
      linkButton,
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
      codeBlockButton,
      horizontalRuleButton,
      tableButton,
      linkButton,
    ]) {
      expect(button).toHaveAttribute('data-variant', 'ghost')
      expect(button).toHaveAttribute('data-size', 'icon')
      expect(button).toHaveClass('hover:bg-gray-200', 'dark:hover:bg-zinc-700')
      expect(button).not.toHaveAttribute('aria-pressed')
    }
    expect(undoButton).toBeDisabled()
    expect(redoButton).toBeDisabled()
    expect(directionButton).toBeEnabled()

    for (const button of [...markButtons, ...listButtons, ...blockButtons]) {
      expect(button).toHaveAttribute('data-variant', 'ghost')
      expect(button).toHaveAttribute('data-size', 'icon')
      expect(button).toHaveAttribute('aria-pressed', 'false')
      expect(button).toHaveClass('hover:bg-gray-200', 'dark:hover:bg-zinc-700')
      expect(button).not.toHaveClass('bg-primary')
    }

    const textStyleSelect = within(toolbar).getByRole('combobox', {
      name: 'سبک متن',
    })
    expect(textStyleSelect).toHaveTextContent('پاراگراف')
    expect(textStyleSelect).toHaveClass(
      'bg-white',
      'hover:bg-white',
      'dark:bg-zinc-800',
      'dark:hover:bg-zinc-800',
    )
    expect(textStyleSelect).not.toHaveClass('hover:bg-gray-200')
    expect(textStyleSelect).not.toHaveClass('dark:hover:bg-zinc-700')

    const fontSizeSelect = within(toolbar).getByRole('combobox', {
      name: 'اندازه ی متن',
    })
    expect(fontSizeSelect).toHaveTextContent('۱۶px')
    expect(fontSizeSelect).toHaveClass(
      'bg-white',
      'hover:bg-white',
      'dark:bg-zinc-800',
      'dark:hover:bg-zinc-800',
    )
    expect(fontSizeSelect).not.toHaveClass('hover:bg-gray-200')
    expect(fontSizeSelect).not.toHaveClass('dark:hover:bg-zinc-700')

    const separators = toolbar.querySelectorAll('[data-slot="separator"]')
    expect(separators).toHaveLength(6)
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
    expect(separators[4]?.nextElementSibling).toBe(codeBlockButton)
    expect(codeBlockButton.nextElementSibling).toBe(blockquoteButton)
    expect(blockquoteButton.nextElementSibling).toBe(horizontalRuleButton)
    expect(horizontalRuleButton.nextElementSibling).toBe(separators[5])
    expect(separators[5]?.nextElementSibling).toBe(tableButton)
    expect(tableButton.nextElementSibling).toBe(linkButton)

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
      /\.is-editor-empty:first-child:not\(pre\):not\(\.code-block-frame\)\s*\{[^}]*position: relative;/,
    )
    expect(editorStyles).toMatch(
      /\.is-editor-empty:first-child:not\(pre\):not\(\.code-block-frame\)::before\s*\{[^}]*position: absolute;[^}]*inset-inline: 0;[^}]*color: var\(--muted-foreground\);[^}]*content: attr\(data-placeholder\);[^}]*text-align: inherit;/,
    )
    expect(editorStyles).not.toMatch(
      /\.is-editor-empty:first-child:not\(pre\):not\(\.code-block-frame\)::before\s*\{[^}]*float:/,
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
      'table',
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
    expect(compactStyles).toContain(
      '.document-body-editor .ProseMirror li > .table-scroll { margin-block: 0.5em; }',
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

  it('opens the code menu with the same languages as the reference editor', async () => {
    renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'کد' }))

    const menu = await screen.findByRole('menu')
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      'کد ساده',
      'HTML',
      'CSS',
      'JavaScript',
      'TypeScript',
      'PHP',
      'Python',
      'JSON',
      'Bash',
      'SQL',
      'Markdown',
    ])

    const scrollArea = menu.querySelector('[data-slot="scroll-area"]')
    expect(scrollArea).toHaveClass('h-48')
    const viewport = scrollArea?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    )
    expect(viewport).not.toBeNull()
    expect(items.every((item) => viewport?.contains(item))).toBe(true)
  })

  it('inserts a highlighted code block and keeps shiki styles out of the saved body', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'کد' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'JavaScript' }),
    )

    const editor = await editorTextbox()
    expect(editor).toHaveFocus()
    expect(screen.getByRole('button', { name: 'کد' })).toHaveAttribute(
      'data-variant',
      'default',
    )

    await user.keyboard('const value = 1')

    const frame = editor.querySelector('.code-block-frame')
    const pre = frame?.querySelector('.code-block-content')
    expect(frame).toHaveAttribute('dir', 'ltr')
    expect(frame).toHaveClass('shiki')
    expect(frame?.getAttribute('style')).toMatch(
      /--wordapp-shiki-light-bg:\s*var\(--color-gray-100\)/,
    )
    expect(frame?.getAttribute('style')).toMatch(
      /--wordapp-shiki-light-bg:\s*var\(--color-gray-100\);\s*--wordapp-shiki-dark-bg:\s*var\(--color-zinc-800\);\s*--wordapp-shiki-light-fg:\s*#[0-9a-f]{6};\s*--wordapp-shiki-dark-fg:\s*#[0-9a-f]{6}/i,
    )
    expect(frame?.getAttribute('style')).not.toMatch(/line-number/)
    expect(pre).toHaveAttribute('dir', 'ltr')
    expect(pre?.querySelector('code')).toHaveTextContent('const value = 1')

    const gutter = frame?.querySelector('.code-block-gutter')
    expect(gutter?.textContent).toBe('۱')
    expect(gutter).toHaveAttribute('aria-hidden', 'true')
    expect(gutter).toHaveAttribute('contenteditable', 'false')
    expect(pre?.querySelector('.code-block-gutter')).toBeNull()

    const token = Array.from(
      frame?.querySelectorAll('code span[style]') ?? [],
    ).find((span) => span.textContent === 'const')
    expect(token).toBeDefined()
    expect(token?.getAttribute('style')).toContain('--wordapp-shiki-light:')
    expect(token?.getAttribute('style')).toContain('--wordapp-shiki-dark:')

    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<pre dir="ltr"><code class="language-javascript">const value = 1</code></pre><p dir="rtl"></p>',
    )
  })

  it('numbers code block lines and updates the gutter while typing', async () => {
    const onBodyChange = vi.fn()
    renderEditor({ onBodyChange })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'کد' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'JavaScript' }),
    )

    const editor = await editorTextbox()
    const frame = editor.querySelector('.code-block-frame')
    const pre = frame?.querySelector('.code-block-content')
    const gutter = frame?.querySelector('.code-block-gutter')
    expect(gutter?.textContent).toBe('۱')

    await user.keyboard('const a = 1{Enter}const b = 2')
    expect(gutter?.textContent).toBe('۱\n۲')

    await user.keyboard('{Enter}{Enter}const c = 3')
    expect(gutter?.textContent).toBe('۱\n۲\n۳\n۴')
    expect(pre?.querySelector('code')?.textContent).toBe(
      'const a = 1\nconst b = 2\n\nconst c = 3',
    )
    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<pre dir="ltr"><code class="language-javascript">const a = 1\nconst b = 2\n\nconst c = 3</code></pre><p dir="rtl"></p>',
    )
  })

  it('does not group code line numbers', async () => {
    const lines = Array.from(
      { length: 1000 },
      (_, index) => `line ${index + 1}`,
    ).join('\n')
    renderEditor({ body: `<pre><code>${lines}</code></pre>` })

    const editor = await editorTextbox()
    const gutter = editor.querySelector('.code-block-gutter')
    const numbers = gutter?.textContent?.split('\n') ?? []

    expect(numbers).toHaveLength(1000)
    expect(numbers.at(-1)).toBe('۱۰۰۰')
  })

  it('resets the code block horizontal scroll when enter starts a new line', async () => {
    renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'کد' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'JavaScript' }),
    )

    const editor = await editorTextbox()
    await user.keyboard(
      "const someVeryLongVariableName = 'this line is long enough to overflow the code block width'",
    )

    const viewport = editor.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    )

    if (viewport === null) {
      throw new Error('Code block viewport is missing')
    }

    Object.defineProperty(viewport, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 480,
    })

    await user.keyboard('{Enter}')

    await waitFor(() => expect(viewport.scrollLeft).toBe(0))
    expect(editor.querySelector('.code-block-gutter')?.textContent).toBe('۱\n۲')
  })

  it('selects only the code block text when pressing control+a', async () => {
    const onBodyChange = vi.fn()
    renderEditor({ body: '<p>before</p>', onBodyChange })
    const user = userEvent.setup()

    const editor = await editorTextbox()
    await user.click(editor)
    placeCursorAtEnd(editor)
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'کد' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'JavaScript' }),
    )
    await user.keyboard('const a = 1{Enter}const b = 2')
    await user.keyboard('{Control>}a{/Control}')
    await user.keyboard('x')

    const body = onBodyChange.mock.calls.at(-1)?.[0] ?? ''
    expect(body).toMatch(/<p[^>]*>before<\/p>/)
    expect(body).toContain('<code class="language-javascript">x</code>')
    expect(body).not.toContain('const a = 1')
  })

  it('updates the current code block language and marks the active option', async () => {
    const onBodyChange = vi.fn()
    renderEditor({ onBodyChange })
    const user = userEvent.setup()
    const codeButton = screen.getByRole('button', { name: 'کد' })

    await user.click(codeButton)
    await user.click(
      await screen.findByRole('menuitem', { name: 'JavaScript' }),
    )
    await user.keyboard('const value = 1')

    await user.click(codeButton)
    const currentItem = await screen.findByRole('menuitem', {
      name: 'JavaScript',
    })
    expect(currentItem.querySelector('svg.lucide-check')).not.toBeNull()

    await user.click(
      await screen.findByRole('menuitem', { name: 'TypeScript' }),
    )

    const editor = await editorTextbox()
    expect(editor).toHaveFocus()
    expect(editor.querySelector('code')).toHaveTextContent('const value = 1')
    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<pre dir="ltr"><code class="language-typescript">const value = 1</code></pre><p dir="rtl"></p>',
    )
  })

  it('applies every language option and returns focus for each choice', async () => {
    const onBodyChange = vi.fn()
    renderEditor({ onBodyChange })
    const user = userEvent.setup()
    const codeButton = screen.getByRole('button', { name: 'کد' })

    await user.click(codeButton)
    await user.click(
      await screen.findByRole('menuitem', { name: 'JavaScript' }),
    )
    await user.keyboard('const value = 1')

    for (const [label, language] of [
      ['کد ساده', 'plaintext'],
      ['HTML', 'html'],
      ['CSS', 'css'],
      ['JavaScript', 'javascript'],
      ['TypeScript', 'typescript'],
      ['PHP', 'php'],
      ['Python', 'python'],
      ['JSON', 'json'],
      ['Bash', 'bash'],
      ['SQL', 'sql'],
      ['Markdown', 'markdown'],
    ]) {
      await user.click(codeButton)
      await user.click(await screen.findByRole('menuitem', { name: label }))

      const editor = await editorTextbox()
      expect(editor).toHaveFocus()
      expect(onBodyChange).toHaveBeenLastCalledWith(
        `<pre dir="ltr"><code class="language-${language}">const value = 1</code></pre><p dir="rtl"></p>`,
      )
    }
  })

  it('returns focus for keyboard selection and keeps the active language unchanged', async () => {
    const onBodyChange = vi.fn()
    renderEditor({ onBodyChange })
    const user = userEvent.setup()
    const codeButton = screen.getByRole('button', { name: 'کد' })

    await user.click(codeButton)
    await user.click(
      await screen.findByRole('menuitem', { name: 'TypeScript' }),
    )
    await user.keyboard('const value: number = 1')

    const bodyBefore = onBodyChange.mock.calls.at(-1)?.[0]

    codeButton.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('menu')
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')

    const editor = await editorTextbox()
    expect(editor).toHaveFocus()
    expect(editor.querySelector('code')).toHaveTextContent(
      'const value: number = 1',
    )
    expect(onBodyChange).toHaveBeenLastCalledWith(bodyBefore)
  })

  it('highlights stored code blocks and recognizes language aliases', async () => {
    renderEditor({
      body: '<pre><code class="language-ts">const value: number = 1\nconst next = 2</code></pre>',
    })

    const editor = await editorTextbox()
    const frame = editor.querySelector('.code-block-frame')
    const pre = frame?.querySelector('.code-block-content')
    expect(pre).toHaveAttribute('dir', 'ltr')
    expect(frame).toHaveClass('shiki')
    expect(
      frame?.querySelectorAll('code span[style]').length ?? 0,
    ).toBeGreaterThan(0)
    expect(frame?.querySelector('.code-block-gutter')?.textContent).toBe('۱\n۲')
    expect(screen.getByRole('button', { name: 'کد' })).toHaveAttribute(
      'data-variant',
      'default',
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'کد' }))
    const item = await screen.findByRole('menuitem', { name: 'TypeScript' })
    expect(item.querySelector('svg.lucide-check')).not.toBeNull()
  })

  it('copies code from a ghost button with loading and success feedback', async () => {
    renderEditor()
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')

    await user.click(screen.getByRole('button', { name: 'کد' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'JavaScript' }),
    )
    await user.keyboard('const a = 1{Enter}const b = 2')

    const editor = await editorTextbox()
    const frame = editor.querySelector('.code-block-frame')
    expect(frame).not.toBeNull()
    const copyButton = within(frame as HTMLElement).getByRole('button', {
      name: 'کپی',
    })

    expect(copyButton).toHaveAttribute('data-variant', 'ghost')
    expect(copyButton).toHaveClass(
      'absolute',
      'top-2',
      'right-3',
      'border-border',
      'bg-white',
      'text-zinc-900',
      'hover:bg-white',
      'hover:text-zinc-900',
      'dark:bg-zinc-900',
      'dark:text-white',
      'dark:hover:bg-zinc-900',
      'dark:hover:text-white',
      'shadow-sm',
    )
    expect(copyButton).toBeEnabled()
    const copyIcon = copyButton.querySelector('svg.lucide-clipboard-copy')
    expect(copyIcon).toHaveClass('size-4')
    expect(copyIcon).not.toHaveClass('rotate-90')

    await user.hover(copyButton)
    expect(
      await screen.findByText('کپی', {
        selector: '[data-slot="tooltip-content"]',
      }),
    ).toBeVisible()

    await user.click(copyButton)
    expect(copyButton).toBeDisabled()
    expect(copyButton).toHaveAttribute('aria-busy', 'true')
    const loader = copyButton.querySelector('svg.lucide-loader-circle')
    expect(loader).not.toBeNull()
    expect(loader).toHaveClass('size-4', 'animate-spin')
    expect(writeText).toHaveBeenCalledWith('const a = 1\nconst b = 2')

    await waitFor(
      () => expect(copyButton.querySelector('svg.lucide-check')).not.toBeNull(),
      { timeout: 2000 },
    )
    const check = copyButton.querySelector('svg.lucide-check')
    expect(check).not.toHaveClass('text-emerald-600')
    expect(check).not.toHaveClass('dark:text-emerald-400')
    expect(copyButton).toBeDisabled()
    expect(copyButton).toHaveAttribute('aria-busy', 'false')

    await waitFor(
      () =>
        expect(
          copyButton.querySelector('svg.lucide-clipboard-copy'),
        ).not.toBeNull(),
      { timeout: 2000 },
    )
    expect(copyButton).toBeEnabled()
    expect(await navigator.clipboard.readText()).toBe(
      'const a = 1\nconst b = 2',
    )
    writeText.mockRestore()
  })

  it('shows the code block bubble menu while the cursor is in the block and removes it', async () => {
    const onBodyChange = vi.fn()
    renderEditor({
      body: '<p>قبل</p><p>بعد</p>',
      onBodyChange,
    })
    const user = userEvent.setup()
    const editor = await editorTextbox()
    expect(
      screen.queryByRole('button', { name: 'حذف بلوک کد' }),
    ).not.toBeInTheDocument()

    await user.click(editor)
    placeCursorAtEnd(editor)
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'کد' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'JavaScript' }),
    )
    await user.keyboard('const a = 1')

    expect(editor.querySelector('.code-block-frame')).not.toBeNull()

    const removeButton = await screen.findByRole('button', {
      name: 'حذف بلوک کد',
    })
    expect(removeButton).toHaveAttribute('data-variant', 'destructive')
    expect(removeButton).toHaveAttribute('data-size', 'icon')
    expect(removeButton.querySelector('svg.lucide-trash-2')).not.toBeNull()

    await user.hover(removeButton)
    expect(
      await screen.findByText('حذف بلوک کد', {
        selector: '[data-slot="tooltip-content"]',
      }),
    ).toBeVisible()

    await user.click(removeButton)

    expect(editor.querySelector('.code-block-frame')).toBeNull()
    expect(editor).toHaveTextContent('قبلبعد')
    expect(editor).toHaveFocus()
    expect(onBodyChange).toHaveBeenLastCalledWith(
      '<p dir="rtl">قبل</p><p dir="rtl">بعد</p>',
    )
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'حذف بلوک کد' }),
      ).not.toBeInTheDocument()
    })
  })

  it('anchors the code block bubble menu to the bottom of the block', async () => {
    renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'کد' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'JavaScript' }),
    )
    await user.keyboard('const a = 1')

    const editor = await editorTextbox()
    const frame = editor.querySelector<HTMLElement>('.code-block-frame')

    if (frame === null) {
      throw new Error('Code block frame is missing')
    }

    const menu = (
      await screen.findByRole('button', { name: 'حذف بلوک کد' })
    ).closest<HTMLElement>('[data-slot="code-block-bubble-menu"]')

    if (menu === null) {
      throw new Error('Code block bubble menu is missing')
    }

    const rect = new DOMRect(10, 20, 200, 100)
    Object.defineProperty(frame, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    })
    Object.defineProperty(document.documentElement, 'clientHeight', {
      configurable: true,
      value: 1000,
    })
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1000,
    })

    try {
      await user.keyboard('x')
      await user.keyboard('{Backspace}')

      await waitFor(() => {
        expect(menu).toHaveStyle({ top: '128px' })
      })
    } finally {
      Reflect.deleteProperty(document.documentElement, 'clientHeight')
      Reflect.deleteProperty(document.documentElement, 'clientWidth')
    }
  })

  it('replaces a lone removed code block with an editable paragraph', async () => {
    const onBodyChange = vi.fn()
    renderEditor({ onBodyChange })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'کد' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'JavaScript' }),
    )
    await user.keyboard('const a = 1')
    await user.click(await screen.findByRole('button', { name: 'حذف بلوک کد' }))

    const editor = await editorTextbox()
    expect(editor.querySelector('.code-block-frame')).toBeNull()
    expect(editor.querySelector('p')).not.toBeNull()
    expect(editor).toHaveTextContent('')
    expect(editor).toHaveFocus()
    expect(onBodyChange).toHaveBeenLastCalledWith('')

    await user.keyboard('متن تازه')
    expect(editor).toHaveTextContent('متن تازه')
    expect(onBodyChange).toHaveBeenLastCalledWith('<p dir="rtl">متن تازه</p>')
  })

  it('wraps code blocks in a capped two-axis scroll area', async () => {
    const resizeCallbacks: Array<{
      target: Element
      callback: () => void
    }> = []

    class TestResizeObserver {
      private readonly callback: () => void

      constructor(callback: () => void) {
        this.callback = callback
      }

      observe(target: Element) {
        resizeCallbacks.push({ target, callback: this.callback })
      }

      unobserve() {}

      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'کد' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'JavaScript' }),
    )
    await user.keyboard('const value = 1')

    const editor = await editorTextbox()
    const frame = editor.querySelector('.code-block-frame')
    const scrollArea = frame?.querySelector('[data-slot="scroll-area"]')
    const viewport = scrollArea?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    )
    expect(scrollArea).toHaveClass('code-block-scroll')
    expect(viewport).not.toBeNull()
    expect(viewport?.querySelector('.code-block-row')).not.toBeNull()
    expect(viewport?.querySelector('.code-block-gutter')).not.toBeNull()
    expect(viewport?.querySelector('.code-block-content')).not.toBeNull()

    Object.defineProperties(viewport as HTMLElement, {
      offsetHeight: { configurable: true, value: 120 },
      offsetWidth: { configurable: true, value: 120 },
      scrollHeight: { configurable: true, value: 480 },
      scrollWidth: { configurable: true, value: 480 },
    })

    for (const { target, callback } of resizeCallbacks) {
      if (frame?.contains(target)) {
        callback()
      }
    }

    await waitFor(() => {
      expect(
        frame?.querySelector(
          '[data-slot="scroll-area-scrollbar"][data-orientation="vertical"]',
        ),
      ).not.toBeNull()
      expect(
        frame?.querySelector(
          '[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]',
        ),
      ).not.toBeNull()
    })

    const editorStyles = (
      await readFile('src/components/document-body-editor.css', 'utf8')
    ).replace(/\s+/g, ' ')
    expect(editorStyles).toMatch(
      /\.code-block-scroll \[data-slot='scroll-area-viewport'\] \{[^}]*max-height: 24rem;/,
    )
    expect(editorStyles).toMatch(
      /\.code-block-scrollbar \[data-slot='scroll-area-thumb'\] \{[^}]*background-color: color-mix\(in srgb, currentColor 25%, transparent\);/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.code-block-scrollbar \{[^}]*z-index: 2;/,
    )

    vi.unstubAllGlobals()
  })

  it('themes and borders code blocks for light and dark modes', async () => {
    const editorStyles = (
      await readFile('src/components/document-body-editor.css', 'utf8')
    ).replace(/\s+/g, ' ')

    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.code-block-frame \{[^}]*border: 1px solid var\(--border\);[^}]*border-radius: var\(--radius-md\);[^}]*background-color: var\(--wordapp-shiki-light-bg\);[^}]*color: var\(--wordapp-shiki-light-fg\);[^}]*caret-color: var\(--wordapp-shiki-light-fg\);/,
    )
    expect(editorStyles).toContain(
      '.dark .document-body-editor .ProseMirror .code-block-frame { background-color: var(--wordapp-shiki-dark-bg); color: var(--wordapp-shiki-dark-fg); caret-color: var(--wordapp-shiki-dark-fg); }',
    )
    expect(editorStyles).toContain(
      '.document-body-editor .ProseMirror .code-block-frame span[style] { color: var(--wordapp-shiki-light); caret-color: var(--wordapp-shiki-light); }',
    )
    expect(editorStyles).toContain(
      '.dark .document-body-editor .ProseMirror .code-block-frame span[style] { color: var(--wordapp-shiki-dark); caret-color: var(--wordapp-shiki-dark); }',
    )
  })

  it('constrains the editor column so long code lines scroll inside their block', async () => {
    const editorStyles = (
      await readFile('src/components/document-body-editor.css', 'utf8')
    ).replace(/\s+/g, ' ')

    expect(editorStyles).toMatch(
      /\.document-body-editor > \[data-slot='scroll-area'\] > \[data-slot='scroll-area-viewport'\] > div \{[^}]*display: flex !important;[^}]*flex-direction: column;[^}]*width: 100%;[^}]*min-height: 100%;/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.document-body-prose \{[^}]*flex: 1;[^}]*color: var\(--foreground\);/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \{[^}]*padding: 1\.5rem 0;/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.is-editor-empty:first-child:not\(pre\):not\(\.code-block-frame\)::before \{[^}]*inset-inline: 0;/,
    )
  })

  it('lays out code blocks with a sticky line-number gutter', async () => {
    const editorStyles = (
      await readFile('src/components/document-body-editor.css', 'utf8')
    ).replace(/\s+/g, ' ')

    expect(editorStyles).toContain(
      "@import '@fontsource/jetbrains-mono/300.css';",
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.code-block-frame \{[^}]*font-family: 'JetBrains Mono',[^}]*font-weight: 300;/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.code-block-row \{[^}]*display: flex;[^}]*align-items: stretch;[^}]*width: max-content;[^}]*min-width: 100%;[^}]*padding: 0\.8571429em 0;[^}]*white-space: pre;/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.code-block-content \{[^}]*flex: 1 0 auto;[^}]*width: max-content;[^}]*margin: 0;[^}]*padding: 0 3rem 0 0\.75em;[^}]*font: inherit;[^}]*white-space: pre;/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.code-block-gutter \{[^}]*position: sticky;[^}]*left: 0;[^}]*background-color: var\(--wordapp-shiki-light-bg\);[^}]*color: inherit;[^}]*text-align: right;[^}]*user-select: none;[^}]*white-space: pre;/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.code-block-gutter \{[^}]*font-family: var\(--font-sans\);/,
    )
    expect(editorStyles).toContain(
      '.dark .document-body-editor .ProseMirror .code-block-gutter { background-color: var(--wordapp-shiki-dark-bg); }',
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
      expect(button).not.toHaveClass('hover:bg-gray-200')
      expect(button).not.toHaveClass('dark:hover:bg-zinc-700')
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

  it('adds a link to the selected text and returns focus to the editor', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    const editor = await typeInEditor('متن لینک')
    await user.keyboard('{Control>}a{/Control}')

    await user.click(
      screen.getByRole('button', { name: 'افزودن / ویرایش لینک' }),
    )

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: 'افزودن / ویرایش لینک' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'برای افزودن یا ویرایش لینک از فرم زیر استفاده نمایید.',
      ),
    ).toBeInTheDocument()

    const textInput = within(dialog).getByRole('textbox', { name: 'متن' })
    const hrefInput = within(dialog).getByRole('textbox', {
      name: 'آدرس (URL)',
    })

    expect(textInput).toHaveValue('متن لینک')
    expect(textInput).toHaveFocus()
    expect(hrefInput).toHaveValue('')
    expect(
      within(dialog).queryByRole('button', { name: 'حذف لینک' }),
    ).not.toBeInTheDocument()

    await user.type(hrefInput, 'https://example.com')
    await user.click(within(dialog).getByRole('button', { name: 'افزودن' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const link = editor.querySelector('a')
    expect(link).not.toBeNull()
    expect(link).toHaveTextContent('متن لینک')
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(onBodyChange).toHaveBeenLastCalledWith(
      expect.stringContaining('href="https://example.com"'),
    )
    expect(editor).toHaveFocus()
  })

  it('inserts a link with new text when nothing is selected', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    const editor = await editorTextbox()
    await user.click(editor)
    await user.click(
      screen.getByRole('button', { name: 'افزودن / ویرایش لینک' }),
    )

    const dialog = await screen.findByRole('dialog')
    const textInput = within(dialog).getByRole('textbox', { name: 'متن' })
    const hrefInput = within(dialog).getByRole('textbox', {
      name: 'آدرس (URL)',
    })

    expect(textInput).toHaveValue('')
    expect(hrefInput).toHaveValue('')

    await user.type(textInput, 'OpenAI')
    await user.type(hrefInput, 'https://openai.com')
    await user.click(within(dialog).getByRole('button', { name: 'افزودن' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const link = editor.querySelector('a')
    expect(link).not.toBeNull()
    expect(link).toHaveTextContent('OpenAI')
    expect(link).toHaveAttribute('href', 'https://openai.com')
    expect(editor).toHaveFocus()
    expect(onBodyChange).toHaveBeenLastCalledWith(
      expect.stringContaining('>OpenAI</a>'),
    )
  })

  it('keeps text typed immediately after a stored link outside of it', async () => {
    renderEditor({
      body: '<p><a href="https://example.com">لینک</a></p>',
    })
    const user = userEvent.setup()

    const editor = await editorTextbox()
    await user.click(editor)
    placeCursorAtEnd(editor)
    await user.keyboard('بعد')

    const link = editor.querySelector('a')
    expect(link).toHaveTextContent('لینک')
    expect(link).not.toHaveTextContent('بعد')
    expect(editor).toHaveTextContent('لینکبعد')
  })

  it('autolinks a typed URL', async () => {
    renderEditor()

    const editor = await typeInEditor('https://example.com ')

    expect(editor.querySelector('a')).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  it('prevents a stored link from opening when it is clicked', async () => {
    renderEditor({
      body: '<p><a href="https://example.com">لینک</a></p>',
    })

    const editor = await editorTextbox()
    const link = editor.querySelector('a')
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    })

    link?.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(editor).toHaveFocus()
  })

  it('validates link text and URL before adding a link', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'افزودن / ویرایش لینک' }),
    )

    const dialog = await screen.findByRole('dialog')
    const textInput = within(dialog).getByRole('textbox', { name: 'متن' })
    const hrefInput = within(dialog).getByRole('textbox', {
      name: 'آدرس (URL)',
    })
    const addButton = within(dialog).getByRole('button', { name: 'افزودن' })

    await user.click(addButton)

    expect(
      within(dialog).getByText('متن لینک را وارد کنید.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('مقدار وارد شده باید یک URL باشد.'),
    ).toBeInTheDocument()
    expect(textInput).toHaveAttribute('aria-invalid', 'true')
    expect(hrefInput).toHaveAttribute('aria-invalid', 'true')

    await user.type(textInput, 'لینک')
    await user.type(hrefInput, 'example.com')
    await user.click(addButton)

    expect(
      within(dialog).queryByText('متن لینک را وارد کنید.'),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByText('مقدار وارد شده باید یک URL باشد.'),
    ).toBeInTheDocument()
    expect(hrefInput).toHaveAttribute('aria-invalid', 'true')
    expect(document.querySelector('.ProseMirror a')).toBeNull()
    expect(onBodyChange).not.toHaveBeenCalled()

    await user.clear(hrefInput)
    await user.type(hrefInput, 'https://example.com')
    await user.click(addButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(document.querySelector('.ProseMirror a')).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  it('edits and removes a stored link from the dialog', async () => {
    const { onBodyChange } = renderEditor({
      body: '<p><a href="https://old.example">لینک قدیمی</a></p>',
    })
    const user = userEvent.setup()

    const editor = await editorTextbox()
    await user.click(editor)
    await user.keyboard('{ArrowLeft}')
    await user.click(
      screen.getByRole('button', { name: 'افزودن / ویرایش لینک' }),
    )

    const dialog = await screen.findByRole('dialog')
    const textInput = within(dialog).getByRole('textbox', { name: 'متن' })
    const hrefInput = within(dialog).getByRole('textbox', {
      name: 'آدرس (URL)',
    })

    expect(textInput).toHaveValue('لینک قدیمی')
    expect(hrefInput).toHaveValue('https://old.example')
    expect(
      within(dialog).getByRole('button', { name: 'حذف لینک' }),
    ).toHaveAttribute('data-variant', 'destructive')

    await user.clear(textInput)
    await user.type(textInput, 'لینک تازه')
    await user.clear(hrefInput)
    await user.type(hrefInput, 'https://new.example')
    await user.click(within(dialog).getByRole('button', { name: 'ذخیره' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const updatedLink = editor.querySelector('a')
    expect(updatedLink).toHaveTextContent('لینک تازه')
    expect(updatedLink).toHaveAttribute('href', 'https://new.example')
    expect(editor).toHaveFocus()

    await user.click(
      screen.getByRole('button', { name: 'افزودن / ویرایش لینک' }),
    )

    const removeDialog = await screen.findByRole('dialog')
    await user.click(
      within(removeDialog).getByRole('button', { name: 'حذف لینک' }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(editor.querySelector('a')).toBeNull()
    expect(editor).toHaveTextContent('لینک تازه')
    expect(editor).toHaveFocus()
    expect(onBodyChange).toHaveBeenLastCalledWith(
      expect.stringContaining('لینک تازه'),
    )
  })

  it('shows the link bubble menu and removes the link from it', async () => {
    const { onBodyChange } = renderEditor({
      body: '<p><a href="https://example.com">لینک</a></p>',
    })
    const user = userEvent.setup()

    const editor = await editorTextbox()
    await user.click(editor)
    await user.keyboard('{ArrowLeft}')

    const editButton = await screen.findByRole('button', {
      name: 'ویرایش لینک',
    })
    const deleteButton = screen.getByRole('button', { name: 'حذف لینک' })

    expect(
      screen.getByRole('button', { name: 'افزودن / ویرایش لینک' }),
    ).toHaveAttribute('data-variant', 'default')
    expect(editButton).toHaveAttribute('data-variant', 'outline')
    expect(deleteButton).toHaveAttribute('data-variant', 'destructive')

    await user.click(editButton)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('textbox', { name: 'متن' })).toHaveValue(
      'لینک',
    )

    await user.click(within(dialog).getByRole('button', { name: 'انصراف' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    await user.click(editor)
    await user.keyboard('{ArrowLeft}')
    await user.click(await screen.findByRole('button', { name: 'حذف لینک' }))

    expect(editor.querySelector('a')).toBeNull()
    expect(editor).toHaveFocus()
    expect(onBodyChange).toHaveBeenLastCalledWith(
      expect.stringContaining('<p dir="rtl">لینک</p>'),
    )
  })

  it('opens the add table dialog and inserts one cell with focus back in the editor', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'افزودن جدول' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: 'افزودن جدول' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('برای افزودن جدول از فرم زیر استفاده نمایید.'),
    ).toBeInTheDocument()

    const rowsInput = within(dialog).getByRole('spinbutton', {
      name: 'تعداد سطرها',
    })
    const columnsInput = within(dialog).getByRole('spinbutton', {
      name: 'تعداد ستون ها',
    })
    expect(rowsInput).toHaveValue(1)
    expect(columnsInput).toHaveValue(1)
    expect(rowsInput).toHaveAttribute('type', 'number')
    expect(columnsInput).toHaveAttribute('type', 'number')
    expect(rowsInput).toHaveClass(
      '[appearance:textfield]',
      '[&::-webkit-inner-spin-button]:appearance-none',
      '[&::-webkit-outer-spin-button]:appearance-none',
    )
    expect(rowsInput).toHaveFocus()

    expect(
      within(dialog).getByRole('button', { name: 'کاهش تعداد سطرها' }),
    ).toBeDisabled()
    expect(
      within(dialog).getByRole('button', { name: 'افزایش تعداد سطرها' }),
    ).toBeEnabled()
    expect(
      within(dialog).getByRole('button', { name: 'کاهش تعداد ستون ها' }),
    ).toBeDisabled()
    expect(
      within(dialog).getByRole('button', { name: 'افزایش تعداد ستون ها' }),
    ).toBeEnabled()

    expect(
      within(dialog).getByRole('button', { name: 'انصراف' }),
    ).toBeInTheDocument()

    const headerCheckbox = within(dialog).getByRole('checkbox', {
      name: 'اولین سطر به عنوان سرستون؟',
    })
    expect(headerCheckbox).not.toBeChecked()

    await user.click(within(dialog).getByRole('button', { name: 'افزودن' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const editor = await editorTextbox()
    const table = editor.querySelector('table')
    expect(table).not.toBeNull()
    expect(table?.querySelectorAll('tr')).toHaveLength(1)
    expect(table?.querySelectorAll('td')).toHaveLength(1)
    expect(table?.querySelectorAll('th')).toHaveLength(0)
    expect(onBodyChange).toHaveBeenCalled()
    expect(editor).toHaveFocus()
  })

  it('closes the add table dialog without inserting when cancelled', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'افزودن جدول' }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'انصراف' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(onBodyChange).not.toHaveBeenCalled()
    expect(document.querySelector('.ProseMirror table')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'افزودن جدول' }))
    const reopenedDialog = await screen.findByRole('dialog')

    await user.click(
      within(reopenedDialog).getByRole('button', { name: 'بستن' }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(onBodyChange).not.toHaveBeenCalled()
    expect(document.querySelector('.ProseMirror table')).toBeNull()
  })

  it('steps the table size with the minus and plus buttons', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'افزودن جدول' }))
    const dialog = await screen.findByRole('dialog')
    const rowsInput = within(dialog).getByRole('spinbutton', {
      name: 'تعداد سطرها',
    })
    const columnsInput = within(dialog).getByRole('spinbutton', {
      name: 'تعداد ستون ها',
    })
    const decrementRows = within(dialog).getByRole('button', {
      name: 'کاهش تعداد سطرها',
    })
    const incrementRows = within(dialog).getByRole('button', {
      name: 'افزایش تعداد سطرها',
    })
    const incrementColumns = within(dialog).getByRole('button', {
      name: 'افزایش تعداد ستون ها',
    })

    await user.click(incrementRows)
    await user.click(incrementRows)
    await user.click(incrementColumns)

    expect(rowsInput).toHaveValue(3)
    expect(columnsInput).toHaveValue(2)
    expect(decrementRows).toBeEnabled()

    await user.click(decrementRows)

    expect(rowsInput).toHaveValue(2)

    fireEvent.change(rowsInput, { target: { value: '10' } })
    expect(incrementRows).toBeDisabled()
    expect(decrementRows).toBeEnabled()

    fireEvent.change(rowsInput, { target: { value: '1' } })
    expect(decrementRows).toBeDisabled()
    expect(incrementRows).toBeEnabled()

    expect(onBodyChange).not.toHaveBeenCalled()
  })

  it('types inside table cells and keeps the table in the body', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'افزودن جدول' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'افزودن' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const editor = await editorTextbox()
    expect(editor).toHaveFocus()
    await user.keyboard('سلام')

    expect(editor.querySelector('table td p')).toHaveTextContent('سلام')
    expect(onBodyChange).toHaveBeenLastCalledWith(
      expect.stringMatching(/<table[\s\S]*سلام[\s\S]*<\/table>/),
    )
  })

  it('inserts the requested rows and columns with an optional header row', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'افزودن جدول' }))
    const dialog = await screen.findByRole('dialog')
    const rowsInput = within(dialog).getByRole('spinbutton', {
      name: 'تعداد سطرها',
    })
    const columnsInput = within(dialog).getByRole('spinbutton', {
      name: 'تعداد ستون ها',
    })

    await user.clear(rowsInput)
    await user.type(rowsInput, '2')
    await user.clear(columnsInput)
    await user.type(columnsInput, '3')
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'اولین سطر به عنوان سرستون؟',
      }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'افزودن' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const editor = await editorTextbox()
    const table = editor.querySelector('table')
    expect(table).not.toBeNull()
    expect(table?.querySelectorAll('tr')).toHaveLength(2)
    expect(table?.querySelectorAll('th')).toHaveLength(3)
    expect(table?.querySelectorAll('td')).toHaveLength(3)

    const columns = table?.querySelectorAll<HTMLTableColElement>('colgroup col')
    expect(columns).toHaveLength(3)

    for (const column of Array.from(columns ?? [])) {
      expect(column.style.width).toBe('')
    }

    expect(onBodyChange).toHaveBeenLastCalledWith(
      expect.stringContaining('<th'),
    )
    expect(onBodyChange).toHaveBeenLastCalledWith(
      expect.stringContaining('<td'),
    )
    expect(editor).toHaveFocus()
  })

  it('validates table sizes with Farsi messages and clears them on edit', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'افزودن جدول' }))
    const dialog = await screen.findByRole('dialog')
    const rowsInput = within(dialog).getByRole('spinbutton', {
      name: 'تعداد سطرها',
    })
    const columnsInput = within(dialog).getByRole('spinbutton', {
      name: 'تعداد ستون ها',
    })
    const addButton = within(dialog).getByRole('button', { name: 'افزودن' })

    await user.clear(rowsInput)
    await user.type(rowsInput, '0')
    await user.clear(columnsInput)
    await user.type(columnsInput, '11')
    await user.click(addButton)

    expect(
      within(dialog).getByText('حداقل یک سطر الزامی است.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('تعداد ستون ها بیشتر از ۱۰ است.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(rowsInput).toHaveAttribute('aria-invalid', 'true')
    expect(columnsInput).toHaveAttribute('aria-invalid', 'true')

    await user.clear(rowsInput)
    await user.type(rowsInput, '1')

    expect(
      within(dialog).queryByText('حداقل یک سطر الزامی است.'),
    ).not.toBeInTheDocument()

    await user.clear(columnsInput)
    await user.type(columnsInput, '1.5')
    await user.click(addButton)

    expect(
      within(dialog).getByText('تعداد ستون ها باید عدد صحیح باشد.'),
    ).toBeInTheDocument()

    fireEvent.change(columnsInput, { target: { value: 'ستون' } })
    await user.click(addButton)

    expect(
      within(dialog).getByText('تعداد ستون ها باید یک عدد باشد.'),
    ).toBeInTheDocument()
    expect(document.querySelector('.ProseMirror table')).toBeNull()
    expect(onBodyChange).not.toHaveBeenCalled()
  })

  it('renders tables in a horizontal scroll area with the code block scrollbar', async () => {
    const resizeCallbacks: Array<{
      target: Element
      callback: () => void
    }> = []

    class TestResizeObserver {
      private readonly callback: () => void

      constructor(callback: () => void) {
        this.callback = callback
      }

      observe(target: Element) {
        resizeCallbacks.push({ target, callback: this.callback })
      }

      unobserve() {}

      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver)

    renderEditor({
      body: '<table><tbody><tr><th><p>عنوان یک</p></th><th><p>عنوان دو</p></th></tr><tr><td><p>خانه</p></td><td><p>مدرسه</p></td></tr></tbody></table>',
    })

    const editor = await editorTextbox()
    const table = editor.querySelector('table')
    expect(table).not.toBeNull()
    expect(table?.querySelectorAll('th')).toHaveLength(2)
    expect(table?.querySelectorAll('td')).toHaveLength(2)
    expect(table?.querySelector('colgroup')).not.toBeNull()

    const wrapper = table?.closest('.table-scroll')
    expect(wrapper).not.toBeNull()

    const scrollArea = wrapper?.querySelector('[data-slot="scroll-area"]')
    expect(scrollArea).toHaveClass('table-scroll-area')

    const viewport = scrollArea?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    )
    expect(viewport).not.toBeNull()
    expect(viewport?.contains(table)).toBe(true)

    const content = viewport?.firstElementChild
    expect(content).toHaveAttribute('data-slot', 'scroll-area-content')
    expect(table?.parentElement).toBe(content)

    Object.defineProperties(viewport, {
      offsetWidth: { configurable: true, value: 160 },
      scrollWidth: { configurable: true, value: 480 },
      offsetHeight: { configurable: true, value: 120 },
      scrollHeight: { configurable: true, value: 120 },
    })

    for (const { target, callback } of resizeCallbacks) {
      if (scrollArea?.contains(target)) {
        callback()
      }
    }

    const horizontalBar = await waitFor(() => {
      const bar = scrollArea?.querySelector(
        '[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]',
      )
      expect(bar).not.toBeNull()
      return bar as HTMLElement
    })
    expect(horizontalBar).toHaveClass('table-scrollbar')
    expect(fireEvent.mouseDown(horizontalBar)).toBe(false)

    for (const { target, callback } of resizeCallbacks) {
      if (horizontalBar.contains(target)) {
        callback()
      }
    }

    await waitFor(() => {
      expect(
        horizontalBar.querySelector('[data-slot="scroll-area-thumb"]'),
      ).not.toBeNull()
    })

    vi.unstubAllGlobals()
  })

  it('themes tables and pins the column resize handle', async () => {
    const editorStyles = (
      await readFile('src/components/document-body-editor.css', 'utf8')
    ).replace(/\s+/g, ' ')

    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.table-scroll-area:has\(\[data-slot='scroll-area-scrollbar'\]\) \{[^}]*padding-bottom: 0\.625rem;/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.table-grid \{[^}]*width: 100%;[^}]*margin-block: 0;[^}]*border-collapse: collapse;[^}]*font-size: 0\.875em;[^}]*table-layout: fixed;/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.table-grid th \{[^}]*background-color: var\(--color-gray-100\);/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.table-grid th, \.document-body-editor \.ProseMirror \.table-grid td \{[^}]*position: relative;[^}]*padding: 0\.375rem;[^}]*border: 1px solid var\(--color-gray-400\);[^}]*vertical-align: top;/,
    )
    expect(editorStyles).toContain(
      '.document-body-editor .ProseMirror .table-grid tr:not(:has(th)):nth-child(2n of tr:not(:has(th))) { background-color: var(--color-gray-100); }',
    )
    expect(editorStyles).toContain(
      '.dark .document-body-editor .ProseMirror .table-grid th { background-color: var(--color-zinc-800); }',
    )
    expect(editorStyles).toContain(
      '.dark .document-body-editor .ProseMirror .table-grid th, .dark .document-body-editor .ProseMirror .table-grid td { border-color: var(--color-zinc-600); }',
    )
    expect(editorStyles).toContain(
      '.dark .document-body-editor .ProseMirror .table-grid tr:not(:has(th)):nth-child(2n of tr:not(:has(th))) { background-color: var(--color-zinc-800); }',
    )
    expect(editorStyles).not.toMatch(/\.table-grid[^{]*:hover/)
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror\.resize-cursor \{[^}]*cursor: col-resize;/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.table-grid \.column-resize-handle \{[^}]*position: absolute;[^}]*inset-inline-end: -0\.125rem;[^}]*width: 0\.25rem;[^}]*background-color: var\(--primary\);/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.table-scrollbar \{[^}]*z-index: 2;/,
    )
    expect(editorStyles).toMatch(
      /\.document-body-editor \.ProseMirror \.table-scrollbar \[data-slot='scroll-area-thumb'\] \{[^}]*background-color: color-mix\(in srgb, currentColor 25%, transparent\);/,
    )
  })

  it('shows the table bubble menu when clicking a stored table', async () => {
    renderEditor({
      body: '<table><tbody><tr><td><p>یک</p></td><td><p>دو</p></td></tr></tbody></table>',
    })

    const editor = await editorTextbox()
    const user = userEvent.setup()

    expect(
      screen.queryByRole('button', { name: 'حذف جدول' }),
    ).not.toBeInTheDocument()

    await user.click(editor.querySelectorAll('td p')[1] as HTMLElement)

    expect(
      await screen.findByRole('button', { name: 'حذف جدول' }),
    ).toBeInTheDocument()
  })

  it('offers table actions in a bubble menu and returns focus to the editor', async () => {
    const { onBodyChange } = renderEditor()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'افزودن جدول' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'افزودن' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    const editor = await editorTextbox()
    const table = editor.querySelector('table')
    expect(table?.querySelectorAll('tr')).toHaveLength(1)

    const addRowButton = await screen.findByRole('button', {
      name: 'افزودن سطر بعدی',
    })
    const deleteTableButton = screen.getByRole('button', { name: 'حذف جدول' })
    expect(deleteTableButton).toHaveAttribute('data-variant', 'destructive')
    expect(
      screen.getByRole('button', { name: 'حذف سطر فعلی' }),
    ).toHaveAttribute('data-variant', 'destructive')

    await user.click(addRowButton)
    expect(table?.querySelectorAll('tr')).toHaveLength(2)
    expect(editor).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'افزودن ستون بعدی' }))
    expect(
      table?.querySelectorAll('tr')[0]?.querySelectorAll('td'),
    ).toHaveLength(2)
    expect(editor).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'افزودن سرستون' }))
    expect(table?.querySelector('th')).not.toBeNull()

    await user.click(await screen.findByRole('button', { name: 'حذف سرستون' }))
    expect(table?.querySelector('th')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'حذف جدول' }))
    expect(editor.querySelector('table')).toBeNull()
    expect(onBodyChange).toHaveBeenCalled()
    expect(editor).toHaveFocus()
  })

  it('moves between table cells with the right-to-left arrow keys', async () => {
    renderEditor({
      body: '<table><tbody><tr><td><p>یک</p></td><td><p>دو</p></td></tr></tbody></table>',
    })

    const editor = await editorTextbox()
    const cells = editor.querySelectorAll('td')
    const firstParagraph = cells[0]?.querySelector('p')
    expect(firstParagraph).not.toBeNull()

    const user = userEvent.setup()
    await user.click(firstParagraph as HTMLElement)
    await user.keyboard('{ArrowLeft}')

    const selection = window.getSelection()
    expect(cells[1]?.contains(selection?.anchorNode ?? null)).toBe(true)

    await user.keyboard('{ArrowRight}')

    expect(cells[0]?.contains(window.getSelection()?.anchorNode ?? null)).toBe(
      true,
    )
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
