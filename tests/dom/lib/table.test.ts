import { resolveTableBubbleAnchor, tableStructureKey } from '@/lib/table'
import { Editor } from '@tiptap/core'
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table'
import { StarterKit } from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

function createCell(initialRect: DOMRect) {
  const cell = document.createElement('td')
  let cellRect = initialRect
  cell.getBoundingClientRect = () => cellRect

  return {
    cell,
    moveTo: (rect: DOMRect) => {
      cellRect = rect
    },
  }
}

describe('resolveTableBubbleAnchor', () => {
  it('keeps the anchor while the selection moves inside one cell', () => {
    const { cell } = createCell(new DOMRect(100, 200, 300, 40))
    const first = resolveTableBubbleAnchor(
      cell,
      new DOMRect(150, 205, 2, 20),
      null,
    )

    const second = resolveTableBubbleAnchor(
      cell,
      new DOMRect(220, 205, 2, 20),
      first.anchor,
    )

    expect(second.rect.left).toBe(150)
    expect(second.rect.top).toBe(205)
    expect(second.rect.width).toBe(2)
    expect(second.rect.height).toBe(20)
  })

  it('follows the cell when the cell moves, such as while scrolling', () => {
    const { cell, moveTo } = createCell(new DOMRect(100, 200, 300, 40))
    const first = resolveTableBubbleAnchor(
      cell,
      new DOMRect(150, 205, 2, 20),
      null,
    )

    moveTo(new DOMRect(100, 160, 300, 40))

    const scrolled = resolveTableBubbleAnchor(
      cell,
      new DOMRect(220, 205, 2, 20),
      first.anchor,
    )

    expect(scrolled.rect.left).toBe(150)
    expect(scrolled.rect.top).toBe(165)
  })

  it('moves the anchor when the selection enters another cell', () => {
    const firstCell = createCell(new DOMRect(100, 200, 300, 40))
    const first = resolveTableBubbleAnchor(
      firstCell.cell,
      new DOMRect(150, 205, 2, 20),
      null,
    )

    const secondCell = createCell(new DOMRect(100, 240, 300, 40))
    const second = resolveTableBubbleAnchor(
      secondCell.cell,
      new DOMRect(180, 245, 2, 20),
      first.anchor,
    )

    expect(second.anchor.cell).toBe(secondCell.cell)
    expect(second.rect.left).toBe(180)
    expect(second.rect.top).toBe(245)
  })
})

describe('tableStructureKey', () => {
  it('changes when a row or column is added', () => {
    const editor = new Editor({
      extensions: [StarterKit, Table, TableRow, TableHeader, TableCell],
      content:
        '<table><tbody><tr><td><p>یک</p></td><td><p>دو</p></td></tr></tbody></table>',
    })

    editor.commands.setTextSelection(4)
    const initial = tableStructureKey(editor)
    expect(initial).toBe('1:2:0:0')

    editor.commands.addRowAfter()
    const withRow = tableStructureKey(editor)
    expect(withRow).not.toBe(initial)
    expect(withRow).toContain('2:2')

    editor.commands.addColumnAfter()
    expect(tableStructureKey(editor)).toMatch(/^2:3:/)

    editor.destroy()
  })

  it('changes when the selection moves to another cell', () => {
    const editor = new Editor({
      extensions: [StarterKit, Table, TableRow, TableHeader, TableCell],
      content:
        '<table><tbody><tr><td><p>یک</p></td><td><p>دو</p></td></tr></tbody></table>',
    })

    editor.commands.setTextSelection(4)
    expect(tableStructureKey(editor)).toBe('1:2:0:0')

    editor.commands.goToNextCell()
    expect(tableStructureKey(editor)).toBe('1:2:0:1')

    editor.destroy()
  })
})
