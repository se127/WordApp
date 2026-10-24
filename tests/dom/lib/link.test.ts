import { getLinkRange, linkHrefError, linkTextError } from '@/lib/link'
import { Editor } from '@tiptap/core'
import { Link } from '@tiptap/extension-link'
import { StarterKit } from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

function createLinkEditor() {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false }),
    ],
    content: '<p>پیش <a href="https://example.com">لینک</a> پس</p>',
  })
  let from = 0
  let to = 0

  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === 'link')) {
      from = pos
      to = pos + node.nodeSize
    }
  })

  return { editor, from, to }
}

describe('link validation', () => {
  it('requires link text', () => {
    expect(linkTextError('')).toBe('متن لینک را وارد کنید.')
    expect(linkTextError('   ')).toBe('متن لینک را وارد کنید.')
    expect(linkTextError('متن')).toBeNull()
  })

  it('requires a valid URL', () => {
    expect(linkHrefError('')).toBe('مقدار وارد شده باید یک URL باشد.')
    expect(linkHrefError('example.com')).toBe(
      'مقدار وارد شده باید یک URL باشد.',
    )
    expect(linkHrefError('https://example.com')).toBeNull()
    expect(linkHrefError(' mailto:test@example.com ')).toBeNull()
  })
})

describe('getLinkRange', () => {
  it('returns the full link range for a cursor inside a link', () => {
    const { editor, from, to } = createLinkEditor()

    editor.commands.setTextSelection(from + 1)

    expect(getLinkRange(editor)).toEqual({ from, to })

    editor.destroy()
  })

  it('returns the selected range when the selection is not collapsed', () => {
    const { editor, from } = createLinkEditor()

    editor.commands.setTextSelection({ from: from + 1, to: from + 2 })

    expect(getLinkRange(editor)).toEqual({ from: from + 1, to: from + 2 })

    editor.destroy()
  })

  it('returns the caret when it is outside a link', () => {
    const { editor } = createLinkEditor()

    editor.commands.setTextSelection(1)

    expect(getLinkRange(editor)).toEqual({ from: 1, to: 1 })

    editor.destroy()
  })
})
