import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  addTableHeaderRow,
  hasTableHeaderRow,
  removeTableHeaderRow,
  resolveTableBubbleAnchor,
  tableStructureKey,
  type TableBubbleAnchor,
} from '@/lib/table'
import { posToDOMRect } from '@tiptap/core'
import { CellSelection, cellAround } from '@tiptap/pm/tables'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Columns2, Heading, Rows2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'

function DocumentTableMenu({ editor }: { editor: Editor | null }) {
  const tableState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      canAddColumnBefore: currentEditor?.can().addColumnBefore() ?? false,
      canAddColumnAfter: currentEditor?.can().addColumnAfter() ?? false,
      canDeleteColumn: currentEditor?.can().deleteColumn() ?? false,
      canAddRowBefore: currentEditor?.can().addRowBefore() ?? false,
      canAddRowAfter: currentEditor?.can().addRowAfter() ?? false,
      canDeleteRow: currentEditor?.can().deleteRow() ?? false,
      canDeleteTable: currentEditor?.can().deleteTable() ?? false,
      tableHasHeaderRow:
        currentEditor === null || currentEditor === undefined
          ? false
          : hasTableHeaderRow(currentEditor),
    }),
  })

  const anchorRef = useRef<TableBubbleAnchor | null>(null)
  const structureRef = useRef<string | null>(null)

  useEffect(() => {
    if (editor === null) {
      return
    }

    const clearAnchor = () => {
      anchorRef.current = null
    }

    editor.on('blur', clearAnchor)

    return () => {
      editor.off('blur', clearAnchor)
    }
  }, [editor])

  const referenceTableMenu = useCallback(() => {
    if (editor === null) {
      return null
    }

    const structureKey = tableStructureKey(editor)

    if (structureRef.current !== structureKey) {
      anchorRef.current = null
      structureRef.current = structureKey
    }

    const { selection } = editor.state

    if (selection instanceof CellSelection) {
      anchorRef.current = null
      return null
    }

    const cellPos = cellAround(selection.$from)
    const cell = cellPos ? editor.view.nodeDOM(cellPos.pos) : null

    if (!(cell instanceof HTMLElement)) {
      anchorRef.current = null
      return null
    }

    const anchored = resolveTableBubbleAnchor(
      cell,
      posToDOMRect(editor.view, selection.from, selection.to),
      anchorRef.current,
    )
    anchorRef.current = anchored.anchor

    return {
      getBoundingClientRect: () => anchored.rect,
      getClientRects: () => [anchored.rect],
    }
  }, [editor])

  if (editor === null) {
    return null
  }

  const {
    canAddColumnBefore = false,
    canAddColumnAfter = false,
    canDeleteColumn = false,
    canAddRowBefore = false,
    canAddRowAfter = false,
    canDeleteRow = false,
    canDeleteTable = false,
    tableHasHeaderRow = false,
  } = tableState ?? {}

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={0}
      shouldShow={({ editor: currentEditor, view }) => {
        const visible = view.hasFocus() && currentEditor.isActive('table')

        if (!visible) {
          anchorRef.current = null
        }

        return visible
      }}
      getReferencedVirtualElement={referenceTableMenu}
      options={{ placement: 'bottom' }}
      dir="rtl"
      className="rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <div className="flex items-center gap-1.5 p-1">
        <TableMenuButton
          label={tableHasHeaderRow ? 'حذف سرستون' : 'افزودن سرستون'}
          onClick={() => {
            if (tableHasHeaderRow) {
              removeTableHeaderRow(editor)
              return
            }

            addTableHeaderRow(editor)
          }}
          disabled={false}
        >
          <Heading />
        </TableMenuButton>

        <span className="mx-2" aria-hidden="true">
          -
        </span>

        <TableMenuButton
          label="افزودن سطر قبلی"
          disabled={!canAddRowBefore}
          onClick={() => {
            editor.chain().focus().addRowBefore().run()
          }}
        >
          <Rows2 />
        </TableMenuButton>
        <TableMenuButton
          label="افزودن سطر بعدی"
          disabled={!canAddRowAfter}
          onClick={() => {
            editor.chain().focus().addRowAfter().run()
          }}
        >
          <Rows2 />
        </TableMenuButton>
        <TableMenuButton
          label="حذف سطر فعلی"
          disabled={!canDeleteRow}
          destructive
          onClick={() => {
            editor.chain().focus().deleteRow().run()
          }}
        >
          <Trash2 />
        </TableMenuButton>

        <span className="mx-2" aria-hidden="true">
          -
        </span>

        <TableMenuButton
          label="افزودن ستون قبلی"
          disabled={!canAddColumnBefore}
          onClick={() => {
            editor.chain().focus().addColumnBefore().run()
          }}
        >
          <Columns2 />
        </TableMenuButton>
        <TableMenuButton
          label="افزودن ستون بعدی"
          disabled={!canAddColumnAfter}
          onClick={() => {
            editor.chain().focus().addColumnAfter().run()
          }}
        >
          <Columns2 />
        </TableMenuButton>
        <TableMenuButton
          label="حذف ستون فعلی"
          disabled={!canDeleteColumn}
          destructive
          onClick={() => {
            editor.chain().focus().deleteColumn().run()
          }}
        >
          <Trash2 />
        </TableMenuButton>

        <span className="mx-2" aria-hidden="true">
          -
        </span>

        <TableMenuButton
          label="حذف جدول"
          disabled={!canDeleteTable}
          destructive
          onClick={() => {
            editor.chain().focus().deleteTable().run()
          }}
        >
          <Trash2 />
        </TableMenuButton>
      </div>
    </BubbleMenu>
  )
}

function TableMenuButton({
  label,
  disabled,
  destructive = false,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  destructive?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={destructive ? 'destructive' : 'outline'}
          size="icon"
          aria-label={label}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export { DocumentTableMenu }
