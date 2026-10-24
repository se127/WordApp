import { ScrollBar } from '@/components/ui/scroll-area'
import { updateColumns } from '@tiptap/extension-table'
import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react'
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'
import { useLayoutEffect, useRef } from 'react'

const defaultCellMinWidth = 25

function DocumentTableView({ node, extension }: NodeViewProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const table = wrapperRef.current?.querySelector<HTMLTableElement>(
      'table[data-node-view-content]',
    )

    if (table === null || table === undefined) {
      return
    }

    let colgroup = table.querySelector<HTMLTableColElement>('colgroup')

    if (colgroup === null) {
      colgroup = document.createElement('colgroup')
      table.prepend(colgroup)
    }

    const options = extension.options as { cellMinWidth?: number }
    const cellMinWidth = options.cellMinWidth ?? defaultCellMinWidth

    updateColumns(node, colgroup, table, cellMinWidth)
  }, [node, extension])

  return (
    <NodeViewWrapper ref={wrapperRef} className="table-scroll">
      <ScrollAreaPrimitive.Root
        data-slot="scroll-area"
        dir="rtl"
        type="auto"
        className="table-scroll-area relative"
      >
        <ScrollAreaPrimitive.Viewport
          data-slot="scroll-area-viewport"
          className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
          disableImplicitContentElement
        >
          <ScrollAreaPrimitive.Content data-slot="scroll-area-content">
            <NodeViewContent<'table'>
              as="table"
              dir="rtl"
              className="table-grid"
              style={{ whiteSpace: 'normal' }}
            />
          </ScrollAreaPrimitive.Content>
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar
          className="table-scrollbar"
          orientation="horizontal"
          onMouseDownCapture={(event) => {
            event.preventDefault()
          }}
        />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    </NodeViewWrapper>
  )
}

export { DocumentTableView }
