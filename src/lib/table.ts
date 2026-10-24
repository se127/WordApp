import { DocumentTableView } from '@/components/document-table-view'
import { formatNumber } from '@/lib/number'
import { Extension, findParentNode } from '@tiptap/core'
import { Table } from '@tiptap/extension-table'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import {
  TableMap,
  cellAround,
  goToNextCell,
  pointsAtCell,
  updateColumnsOnResize,
} from '@tiptap/pm/tables'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ReactNodeViewRenderer, type Editor } from '@tiptap/react'

export const DocumentTable = Table.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DocumentTableView, {
      contentDOMElementTag: 'tbody',
    })
  },
})

export const RtlTableArrowNavigation = Extension.create({
  name: 'rtlTableArrowNavigation',

  addKeyboardShortcuts() {
    const isInTable = () => this.editor.isActive('table')

    return {
      ArrowRight: () => {
        if (!isInTable()) {
          return false
        }

        return goToNextCell(-1)(this.editor.state, this.editor.view.dispatch)
      },
      ArrowLeft: () => {
        if (!isInTable()) {
          return false
        }

        return goToNextCell(1)(this.editor.state, this.editor.view.dispatch)
      },
    }
  },
})

export function hasTableNode(editor: Editor): boolean {
  let hasTable = false

  editor.state.doc.descendants((node) => {
    if (node.type.name === 'table') {
      hasTable = true
      return false
    }

    return !hasTable
  })

  return hasTable
}

const tableParentOf = (editor: Editor) =>
  findParentNode((node) => node.type.name === 'table')(editor.state.selection)

export function hasTableHeaderRow(editor: Editor): boolean {
  const tableParent = tableParentOf(editor)
  const firstCell = tableParent?.node.firstChild?.firstChild

  return firstCell?.type.name === 'tableHeader'
}

export function tableStructureKey(editor: Editor): string | null {
  const tableParent = tableParentOf(editor)

  if (tableParent === undefined) {
    return null
  }

  const map = TableMap.get(tableParent.node)
  const $cell = cellAround(editor.state.selection.$from)
  const cell = $cell ? map.findCell($cell.pos - tableParent.start) : null

  return cell
    ? `${map.height}:${map.width}:${cell.top}:${cell.left}`
    : `${map.height}:${map.width}`
}

export function addTableHeaderRow(editor: Editor): void {
  const tableParent = tableParentOf(editor)

  if (tableParent === undefined) {
    return
  }

  const firstRowPos = tableParent.pos + 2

  editor
    .chain()
    .focus()
    .setTextSelection(firstRowPos)
    .addRowBefore()
    .toggleHeaderRow()
    .run()
}

export function removeTableHeaderRow(editor: Editor): void {
  const tableParent = tableParentOf(editor)

  if (tableParent === undefined) {
    return
  }

  const firstRowPos = tableParent.pos + 2

  editor.chain().focus().setTextSelection(firstRowPos).deleteRow().run()
}

export type TableBubbleAnchor = {
  cell: HTMLElement
  left: number
  top: number
  width: number
  height: number
}

export function resolveTableBubbleAnchor(
  cell: HTMLElement,
  selectionRect: DOMRect,
  anchor: TableBubbleAnchor | null,
): { anchor: TableBubbleAnchor; rect: DOMRect } {
  const cellRect = cell.getBoundingClientRect()

  if (anchor?.cell === cell) {
    return {
      anchor,
      rect: new DOMRect(
        cellRect.left + anchor.left,
        cellRect.top + anchor.top,
        anchor.width,
        anchor.height,
      ),
    }
  }

  return {
    anchor: {
      cell,
      left: selectionRect.left - cellRect.left,
      top: selectionRect.top - cellRect.top,
      width: selectionRect.width,
      height: selectionRect.height,
    },
    rect: selectionRect,
  }
}

export const tableSizeLimit = 10

const tableSizeLabels = {
  rows: 'تعداد سطرها',
  columns: 'تعداد ستون ها',
}

type TableSizeField = keyof typeof tableSizeLabels

const persianDigits = '۰۱۲۳۴۵۶۷۸۹'
const arabicDigits = '٠١٢٣٤٥٦٧٨٩'
const tableSizeNumberPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)$/

function toLatinDigits(value: string): string {
  return Array.from(value, (character) => {
    const persianIndex = persianDigits.indexOf(character)

    if (persianIndex !== -1) {
      return String(persianIndex)
    }

    const arabicIndex = arabicDigits.indexOf(character)

    if (arabicIndex !== -1) {
      return String(arabicIndex)
    }

    return character
  }).join('')
}

export function parseTableSize(value: string): number | null {
  const normalized = toLatinDigits(value.trim())

  if (!tableSizeNumberPattern.test(normalized)) {
    return null
  }

  const size = Number(normalized)

  return Number.isInteger(size) ? size : null
}

export function tableSizeError(
  field: TableSizeField,
  value: string,
): string | null {
  const label = tableSizeLabels[field]
  const normalized = toLatinDigits(value.trim())
  const size = parseTableSize(value)

  if (size === null) {
    if (!tableSizeNumberPattern.test(normalized)) {
      return `${label} باید یک عدد باشد.`
    }

    return `${label} باید عدد صحیح باشد.`
  }

  if (size < 1) {
    return field === 'rows'
      ? 'حداقل یک سطر الزامی است.'
      : 'حداقل یک ستون الزامی است.'
  }

  if (size > tableSizeLimit) {
    return `${label} بیشتر از ${formatNumber(tableSizeLimit, { group: false })} است.`
  }

  return null
}

type Dragging = {
  startX: number
  startWidth: number
  isRTL: boolean
}

type ResizeAction =
  | { setHandle: number; setDragging?: undefined }
  | { setDragging: Dragging | null; setHandle?: undefined }

type ColumnResizingOptions = {
  handleWidth?: number
  cellMinWidth?: number
  defaultCellMinWidth?: number
  lastColumnResizable?: boolean
}

type CellResizeAttributes = {
  colspan?: number
  colwidth?: number[] | null
}

const noActiveHandle = -1

class ResizeState {
  activeHandle: number
  dragging: Dragging | null

  constructor(activeHandle: number, dragging: Dragging | null) {
    this.activeHandle = activeHandle
    this.dragging = dragging
  }

  apply(transaction: Transaction): ResizeState {
    const action = transaction.getMeta(rtlTableColumnResizingKey) as
      ResizeAction | undefined

    if (action?.setHandle !== undefined) {
      return new ResizeState(action.setHandle, null)
    }

    if (action?.setDragging !== undefined) {
      return new ResizeState(this.activeHandle, action.setDragging)
    }

    if (this.activeHandle > noActiveHandle && transaction.docChanged) {
      let handle = transaction.mapping.map(this.activeHandle, -1)

      if (!pointsAtCell(transaction.doc.resolve(handle))) {
        handle = noActiveHandle
      }

      return new ResizeState(handle, this.dragging)
    }

    return this
  }
}

const rtlTableColumnResizingKey = new PluginKey<ResizeState>(
  'rtlTableColumnResizing',
)

function rtlColumnResizing(options: ColumnResizingOptions = {}): Plugin {
  const {
    handleWidth = 5,
    cellMinWidth = 25,
    defaultCellMinWidth = 100,
    lastColumnResizable = true,
  } = options
  let activeHandleIsRTL = false

  return new Plugin({
    key: rtlTableColumnResizingKey,
    state: {
      init() {
        return new ResizeState(noActiveHandle, null)
      },
      apply(transaction, previous) {
        return previous.apply(transaction)
      },
    },
    props: {
      attributes: (state: EditorState): Record<string, string> => {
        const resizeState = rtlTableColumnResizingKey.getState(state)

        return resizeState !== undefined &&
          resizeState.activeHandle > noActiveHandle
          ? { class: 'resize-cursor' }
          : {}
      },
      handleDOMEvents: {
        mousemove: (view, event) => {
          handleMouseMove(
            view,
            event,
            handleWidth,
            lastColumnResizable,
            (isRTL) => {
              activeHandleIsRTL = isRTL
            },
          )
        },
        mouseleave: (view) => {
          handleMouseLeave(view)
        },
        mousedown: (view, event) => {
          return handleMouseDown(
            view,
            event,
            cellMinWidth,
            defaultCellMinWidth,
            activeHandleIsRTL,
          )
        },
      },
      decorations: (state: EditorState) => {
        const resizeState = rtlTableColumnResizingKey.getState(state)

        if (
          resizeState !== undefined &&
          resizeState.activeHandle > noActiveHandle
        ) {
          return handleDecorations(state, resizeState.activeHandle)
        }

        return DecorationSet.empty
      },
    },
  })
}

function handleMouseMove(
  view: EditorView,
  event: MouseEvent,
  handleWidth: number,
  lastColumnResizable: boolean,
  setActiveHandleIsRTL: (isRTL: boolean) => void,
): void {
  const resizeState = rtlTableColumnResizingKey.getState(view.state)

  if (resizeState === undefined || resizeState.dragging !== null) {
    return
  }

  const target = domCellAround(event.target as HTMLElement | null)
  let cell = noActiveHandle
  let isRTL = false

  if (target !== null) {
    const { left, right } = target.getBoundingClientRect()

    if (event.clientX - left <= handleWidth) {
      isRTL = isTableRTL(domTableAround(target))
      cell = edgeCell(view, event, isRTL ? 'end' : 'start', handleWidth)
    } else if (right - event.clientX <= handleWidth) {
      isRTL = isTableRTL(domTableAround(target))
      cell = edgeCell(view, event, isRTL ? 'start' : 'end', -handleWidth)
    }
  }

  if (cell === resizeState.activeHandle) {
    return
  }

  if (!lastColumnResizable && cell !== noActiveHandle) {
    const $cell = view.state.doc.resolve(cell)
    const table = $cell.node(-1)
    const map = TableMap.get(table)
    const tableStart = $cell.start(-1)

    if (
      map.colCount($cell.pos - tableStart) +
        ($cell.nodeAfter?.attrs.colspan ?? 1) -
        1 ===
      map.width - 1
    ) {
      return
    }
  }

  if (cell !== noActiveHandle) {
    setActiveHandleIsRTL(isRTL)
  }

  updateHandle(view, cell)
}

function handleMouseLeave(view: EditorView): void {
  const resizeState = rtlTableColumnResizingKey.getState(view.state)

  if (
    resizeState !== undefined &&
    resizeState.activeHandle > noActiveHandle &&
    resizeState.dragging === null
  ) {
    updateHandle(view, noActiveHandle)
  }
}

function handleMouseDown(
  view: EditorView,
  event: MouseEvent,
  cellMinWidth: number,
  defaultCellMinWidth: number,
  isRTL: boolean,
): boolean {
  if (!view.editable) {
    return false
  }

  const windowRef = view.dom.ownerDocument.defaultView ?? window
  const resizeState = rtlTableColumnResizingKey.getState(view.state)

  if (
    resizeState === undefined ||
    resizeState.activeHandle === noActiveHandle ||
    resizeState.dragging !== null
  ) {
    return false
  }

  const cellNode = view.state.doc.nodeAt(resizeState.activeHandle)

  if (cellNode === null) {
    return false
  }

  const width = currentColWidth(view, resizeState.activeHandle, cellNode.attrs)

  view.dispatch(
    view.state.tr.setMeta(rtlTableColumnResizingKey, {
      setDragging: { startX: event.clientX, startWidth: width, isRTL },
    }),
  )

  const finish = (finishEvent: MouseEvent) => {
    windowRef.removeEventListener('mouseup', finish)
    windowRef.removeEventListener('mousemove', move)
    const state = rtlTableColumnResizingKey.getState(view.state)

    if (state?.dragging) {
      updateColumnWidth(
        view,
        state.activeHandle,
        draggedWidth(state.dragging, finishEvent, cellMinWidth),
      )
      view.dispatch(
        view.state.tr.setMeta(rtlTableColumnResizingKey, { setDragging: null }),
      )
    }
  }

  const move = (moveEvent: MouseEvent) => {
    if (!moveEvent.buttons) {
      finish(moveEvent)
      return
    }

    const state = rtlTableColumnResizingKey.getState(view.state)

    if (!state?.dragging) {
      return
    }

    const dragged = draggedWidth(state.dragging, moveEvent, cellMinWidth)
    displayColumnWidth(view, state.activeHandle, dragged, defaultCellMinWidth)
  }

  displayColumnWidth(view, resizeState.activeHandle, width, defaultCellMinWidth)

  windowRef.addEventListener('mouseup', finish)
  windowRef.addEventListener('mousemove', move)

  event.preventDefault()
  return true
}

function currentColWidth(
  view: EditorView,
  cellPos: number,
  attrs: CellResizeAttributes,
): number {
  const lastWidth = attrs.colwidth?.[attrs.colwidth.length - 1]

  if (lastWidth) {
    return lastWidth
  }

  const dom = view.domAtPos(cellPos)
  const cellDom = dom.node.childNodes[dom.offset] as HTMLElement | undefined

  if (!cellDom) {
    return 100
  }

  let domWidth = cellDom.offsetWidth
  let parts = attrs.colspan ?? 1

  if (attrs.colwidth) {
    for (let index = 0; index < (attrs.colspan ?? 1); index += 1) {
      const colWidth = attrs.colwidth[index]

      if (colWidth) {
        domWidth -= colWidth
        parts -= 1
      }
    }
  }

  return domWidth / parts
}

function domCellAround(target: HTMLElement | null): HTMLElement | null {
  while (target && target.nodeName !== 'TD' && target.nodeName !== 'TH') {
    target = target.classList.contains('ProseMirror')
      ? null
      : (target.parentNode as HTMLElement | null)
  }

  return target
}

function domTableAround(target: HTMLElement | null): HTMLTableElement | null {
  while (target && target.nodeName !== 'TABLE') {
    target = target.classList.contains('ProseMirror')
      ? null
      : (target.parentNode as HTMLElement | null)
  }

  return target as HTMLTableElement | null
}

function isTableRTL(table: HTMLTableElement | null): boolean {
  if (table === null) {
    return false
  }

  return (
    table.ownerDocument.defaultView?.getComputedStyle(table).direction === 'rtl'
  )
}

function edgeCell(
  view: EditorView,
  event: MouseEvent,
  side: 'start' | 'end',
  offset: number,
): number {
  const found = view.posAtCoords({
    left: event.clientX + offset,
    top: event.clientY,
  })

  if (!found) {
    return noActiveHandle
  }

  const $cell = cellAround(view.state.doc.resolve(found.pos))

  if (!$cell) {
    return noActiveHandle
  }

  if (side === 'end') {
    return $cell.pos
  }

  const map = TableMap.get($cell.node(-1))
  const start = $cell.start(-1)
  const index = map.map.indexOf($cell.pos - start)

  if (index % map.width === 0) {
    return noActiveHandle
  }

  const previousCellPos = map.map[index - 1]

  if (previousCellPos === undefined) {
    return noActiveHandle
  }

  return start + previousCellPos
}

function draggedWidth(
  dragging: Dragging,
  event: MouseEvent,
  resizeMinWidth: number,
): number {
  const offset = event.clientX - dragging.startX

  return Math.max(
    resizeMinWidth,
    dragging.startWidth + (dragging.isRTL ? -offset : offset),
  )
}

function updateHandle(view: EditorView, value: number): void {
  view.dispatch(
    view.state.tr.setMeta(rtlTableColumnResizingKey, { setHandle: value }),
  )
}

function updateColumnWidth(
  view: EditorView,
  cell: number,
  width: number,
): void {
  const $cell = view.state.doc.resolve(cell)
  const table = $cell.node(-1)
  const map = TableMap.get(table)
  const start = $cell.start(-1)
  const column =
    map.colCount($cell.pos - start) + ($cell.nodeAfter?.attrs.colspan ?? 1) - 1
  const transaction = view.state.tr

  for (let row = 0; row < map.height; row += 1) {
    const mapIndex = row * map.width + column

    if (row && map.map[mapIndex] === map.map[mapIndex - map.width]) {
      continue
    }

    const position = map.map[mapIndex]

    if (position === undefined) {
      continue
    }

    const attrs = table.nodeAt(position)?.attrs

    if (!attrs) {
      continue
    }

    const index =
      (attrs.colspan ?? 1) === 1 ? 0 : column - map.colCount(position)

    if (attrs.colwidth && attrs.colwidth[index] === width) {
      continue
    }

    const colwidth = attrs.colwidth
      ? attrs.colwidth.slice()
      : (Array(attrs.colspan ?? 1).fill(0) as number[])

    colwidth[index] = width
    transaction.setNodeMarkup(start + position, null, {
      ...attrs,
      colwidth,
    })
  }

  if (transaction.docChanged) {
    view.dispatch(transaction)
  }
}

function displayColumnWidth(
  view: EditorView,
  cell: number,
  width: number,
  defaultCellMinWidth: number,
): void {
  const $cell = view.state.doc.resolve(cell)
  const table = $cell.node(-1)
  const start = $cell.start(-1)
  const column =
    TableMap.get(table).colCount($cell.pos - start) +
    ($cell.nodeAfter?.attrs.colspan ?? 1) -
    1

  let dom = view.domAtPos(start).node as HTMLElement | null

  while (dom !== null && dom.nodeName !== 'TABLE') {
    dom = dom.parentNode as HTMLElement | null
  }

  if (dom === null) {
    return
  }

  const colgroup = dom.querySelector('colgroup')

  if (colgroup === null) {
    return
  }

  updateColumnsOnResize(
    table,
    colgroup as HTMLTableColElement,
    dom as HTMLTableElement,
    defaultCellMinWidth,
    column,
    width,
  )
}

function handleDecorations(state: EditorState, cell: number): DecorationSet {
  const decorations: Decoration[] = []
  const $cell = state.doc.resolve(cell)
  const table = $cell.node(-1)
  const map = TableMap.get(table)
  const start = $cell.start(-1)
  const column =
    map.colCount($cell.pos - start) + ($cell.nodeAfter?.attrs.colspan ?? 1) - 1
  const resizeState = rtlTableColumnResizingKey.getState(state)

  for (let row = 0; row < map.height; row += 1) {
    const index = column + row * map.width
    const isLastCellOfColumn =
      column === map.width - 1 || map.map[index] !== map.map[index + 1]
    const isFirstRowOfCell =
      row === 0 || map.map[index] !== map.map[index - map.width]

    if (!isLastCellOfColumn || !isFirstRowOfCell) {
      continue
    }

    const cellPos = map.map[index]

    if (cellPos === undefined) {
      continue
    }

    const size = table.nodeAt(cellPos)?.nodeSize ?? 0
    const position = start + cellPos + size - 1
    const handle = document.createElement('div')

    handle.className = 'column-resize-handle'

    if (resizeState?.dragging) {
      decorations.push(
        Decoration.node(start + cellPos, start + cellPos + size, {
          class: 'column-resize-dragging',
        }),
      )
    }

    decorations.push(Decoration.widget(position, handle))
  }

  return DecorationSet.create(state.doc, decorations)
}

export const RtlTableColumnResizing = Extension.create<ColumnResizingOptions>({
  name: 'rtlTableColumnResizing',

  addOptions() {
    return {
      handleWidth: 5,
      cellMinWidth: 25,
      defaultCellMinWidth: 100,
      lastColumnResizable: true,
    }
  },

  addProseMirrorPlugins() {
    if (!this.editor.isEditable) {
      return []
    }

    return [rtlColumnResizing(this.options)]
  },
})
