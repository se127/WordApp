import { getMarkRange } from '@tiptap/core'
import type { Editor } from '@tiptap/react'

type LinkRange = {
  from: number
  to: number
}

function getLinkRange(editor: Editor): LinkRange {
  const { selection } = editor.state
  const range = { from: selection.from, to: selection.to }
  const link = editor.state.schema.marks.link

  if (link === undefined || !selection.empty || !editor.isActive('link')) {
    return range
  }

  return getMarkRange(selection.$from, link) ?? range
}

function linkTextError(value: string): string | null {
  if (value.trim().length === 0) {
    return 'متن لینک را وارد کنید.'
  }

  return null
}

function linkHrefError(value: string): string | null {
  const href = value.trim()

  if (href.length === 0) {
    return 'مقدار وارد شده باید یک URL باشد.'
  }

  try {
    new URL(href)
    return null
  } catch {
    return 'مقدار وارد شده باید یک URL باشد.'
  }
}

function setLink(
  editor: Editor,
  range: LinkRange,
  text: string,
  href: string,
): void {
  const { doc, schema } = editor.state
  const link = schema.marks.link

  if (link === undefined) {
    return
  }

  const linkAtStart = getMarkRange(doc.resolve(range.from), link)
  const linkAtEnd = getMarkRange(doc.resolve(range.to), link)
  const chain = editor.chain().focus()

  if (linkAtStart !== null && linkAtStart !== undefined) {
    if (linkAtStart.from < range.from) {
      chain
        .setTextSelection({ from: linkAtStart.from, to: range.from })
        .unsetLink()
    }
  }

  if (linkAtEnd !== null && linkAtEnd !== undefined) {
    if (range.to < linkAtEnd.to) {
      chain.setTextSelection({ from: range.to, to: linkAtEnd.to }).unsetLink()
    }
  }

  chain
    .insertContentAt(range, {
      type: 'text',
      text,
      marks: [
        {
          type: 'link',
          attrs: {
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        },
      ],
    })
    .setTextSelection({ from: range.from, to: range.from + text.length })
    .run()
}

function removeLink(editor: Editor, range: LinkRange): void {
  editor.chain().focus().setTextSelection(range).unsetLink().run()
}

export {
  getLinkRange,
  linkHrefError,
  linkTextError,
  removeLink,
  setLink,
  type LinkRange,
}
