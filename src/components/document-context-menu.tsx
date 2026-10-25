import type { ClipboardContent, ClipboardWritePayload } from '@/types/global'
import { useEditorState, type Editor } from '@tiptap/react'
import { ContextMenu } from 'radix-ui'
import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

const menuClassName =
  'z-50 max-h-(--radix-context-menu-content-available-height) min-w-52 origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border border-[#dadce0] bg-white py-1 text-[13px] text-[#202124] shadow-[0_2px_6px_rgba(32,33,36,0.28)] outline-hidden dark:border-[#3c4043] dark:bg-[#292a2d] dark:text-[#e8eaed]'

const menuItemClassName =
  'mx-1 flex h-7 cursor-default select-none items-center rounded-[4px] px-3 outline-hidden data-disabled:opacity-40 data-highlighted:bg-[#f1f3f4] dark:data-highlighted:bg-[#3c4043]'

function hasSelectedContent(editor: Editor | null | undefined): boolean {
  return (
    editor !== null &&
    editor !== undefined &&
    !editor.isDestroyed &&
    editor.isEditable &&
    !editor.state.selection.empty
  )
}

function hasSelectableContent(editor: Editor | null | undefined): boolean {
  return (
    editor !== null &&
    editor !== undefined &&
    !editor.isDestroyed &&
    editor.isEditable &&
    !editor.isEmpty
  )
}

function selectionClipboardPayload(editor: Editor): ClipboardWritePayload {
  const { dom, text } = editor.view.serializeForClipboard(
    editor.state.selection.content(),
  )

  return { text, html: dom.innerHTML }
}

function pasteClipboard(editor: Editor, content: ClipboardContent): void {
  const clipboardData = new DataTransfer()

  if (content.text !== '') {
    clipboardData.setData('text/plain', content.text)
  }

  if (content.html !== '') {
    clipboardData.setData('text/html', content.html)
  }

  if (content.image !== null && content.image.byteLength > 0) {
    clipboardData.items.add(
      new File([Uint8Array.from(content.image)], 'clipboard.png', {
        type: 'image/png',
      }),
    )
  }

  editor.view.dom.dispatchEvent(
    new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData,
    }),
  )
}

function DocumentContextMenu({
  editor,
  children,
}: {
  editor: Editor | null
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [clipboard, setClipboard] = useState<ClipboardContent | null>(null)
  const selectionWasEmpty = useRef<boolean | null>(null)
  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      canCut: hasSelectedContent(currentEditor),
      canCopy: hasSelectedContent(currentEditor),
      canSelectAll: hasSelectableContent(currentEditor),
    }),
  })

  const changeOpen = (nextOpen: boolean): void => {
    setOpen(nextOpen)

    if (!nextOpen) {
      return
    }

    setClipboard(null)

    const request = window.WordApp?.clipboard?.read()

    if (request === undefined) {
      return
    }

    void request.then(setClipboard, () => {})
  }

  const trackRightPress = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 2 || editor === null || editor.isDestroyed) {
      return
    }

    selectionWasEmpty.current = editor.state.selection.empty
  }

  const placeCaret = (event: ReactMouseEvent<HTMLElement>): void => {
    if (editor === null || editor.isDestroyed) {
      return
    }

    const collapse = selectionWasEmpty.current ?? editor.state.selection.empty
    selectionWasEmpty.current = null

    if (!collapse) {
      return
    }

    const position = editor.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    })

    editor.commands.focus()

    if (position !== null) {
      editor.commands.setTextSelection(position.pos)
    }
  }

  const focusEditor = (event: Event): void => {
    if (editor === null || editor.isDestroyed) {
      return
    }

    event.preventDefault()
    editor.commands.focus()
  }

  const writeSelection = (): void => {
    if (editor === null || editor.isDestroyed) {
      return
    }

    void window.WordApp?.clipboard?.write(selectionClipboardPayload(editor))
  }

  const cutSelection = (): void => {
    if (editor === null || editor.isDestroyed) {
      return
    }

    writeSelection()
    editor.commands.deleteSelection()
  }

  const pasteSelection = (): void => {
    if (editor === null || editor.isDestroyed || clipboard === null) {
      return
    }

    pasteClipboard(editor, clipboard)
  }

  const selectAll = (): void => {
    if (editor === null || editor.isDestroyed) {
      return
    }

    editor.commands.focus()
    editor.commands.selectAll()
  }

  return (
    <ContextMenu.Root open={open} onOpenChange={changeOpen}>
      <ContextMenu.Trigger
        asChild
        onContextMenu={placeCaret}
        onPointerDownCapture={trackRightPress}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          data-slot="document-context-menu"
          className={menuClassName}
          onCloseAutoFocus={focusEditor}
        >
          <ContextMenuItem
            label="برش"
            shortcut="Ctrl+X"
            disabled={!editorState?.canCut}
            onSelect={cutSelection}
          />
          <ContextMenuItem
            label="کپی"
            shortcut="Ctrl+C"
            disabled={!editorState?.canCopy}
            onSelect={writeSelection}
          />
          <ContextMenuItem
            label="چسباندن"
            shortcut="Ctrl+V"
            disabled={clipboard === null}
            onSelect={pasteSelection}
          />
          <ContextMenu.Separator
            data-slot="document-context-menu-separator"
            className="mx-2 my-1 h-px bg-[#e8eaed] dark:bg-[#3c4043]"
          />
          <ContextMenuItem
            label="انتخاب همه"
            shortcut="Ctrl+A"
            disabled={!editorState?.canSelectAll}
            onSelect={selectAll}
          />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

function ContextMenuItem({
  label,
  shortcut,
  disabled,
  onSelect,
}: {
  label: string
  shortcut: string
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <ContextMenu.Item
      className={menuItemClassName}
      disabled={disabled}
      onSelect={onSelect}
    >
      <span>{label}</span>
      <span
        data-slot="document-context-menu-shortcut"
        className="ms-auto ps-8 text-[#5f6368] dark:text-[#9aa0a6]"
      >
        {shortcut}
      </span>
    </ContextMenu.Item>
  )
}

export { DocumentContextMenu }
