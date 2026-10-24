import { Button } from '@/components/ui/button'
import { ScrollBar } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/number'
import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react'
import { Check, ClipboardCopy, LoaderCircle } from 'lucide-react'
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

const copyLoaderMinimumMs = 400
const copySuccessDurationMs = 1500

type CopyState = 'idle' | 'copying' | 'copied'

function writeToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()

  return copied
    ? Promise.resolve()
    : Promise.reject(new Error('Clipboard is unavailable'))
}

function CodeBlockScrollArea({
  children,
  viewportRef,
}: {
  children: ReactNode
  viewportRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      dir="ltr"
      type="auto"
      className="code-block-scroll relative"
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
        disableImplicitContentElement
      >
        <ScrollAreaPrimitive.Content data-slot="scroll-area-content">
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar className="code-block-scrollbar" />
      <ScrollBar className="code-block-scrollbar" orientation="horizontal" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

export function CodeBlockView({ node, editor, getPos }: NodeViewProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const code = node.textContent
  const lineCount = code.split('\n').length
  const lineNumbers = Array.from({ length: lineCount }, (_, index) =>
    formatNumber(index + 1, { group: false }),
  ).join('\n')
  const isIdle = copyState === 'idle'

  useEffect(() => {
    if (copyState !== 'copied') {
      return
    }

    const timeout = window.setTimeout(
      () => setCopyState('idle'),
      copySuccessDurationMs,
    )

    return () => window.clearTimeout(timeout)
  }, [copyState])

  useEffect(() => {
    const resetHorizontalScrollAtLineStart = () => {
      const pos = getPos()

      if (pos === undefined) {
        return
      }

      const { selection } = editor.state

      if (!selection.empty) {
        return
      }

      const block = editor.state.doc.nodeAt(pos)

      if (block === null || block.type.name !== 'codeBlock') {
        return
      }

      const offset = selection.from - (pos + 1)

      if (offset < 0 || offset > block.content.size) {
        return
      }

      const lineStart = block.textContent.slice(0, offset).lastIndexOf('\n') + 1

      if (offset !== lineStart) {
        return
      }

      queueMicrotask(() => {
        if (viewportRef.current !== null) {
          viewportRef.current.scrollLeft = 0
        }
      })
    }

    editor.on('selectionUpdate', resetHorizontalScrollAtLineStart)

    return () => {
      editor.off('selectionUpdate', resetHorizontalScrollAtLineStart)
    }
  }, [editor, getPos])

  const copyCode = () => {
    if (!isIdle) {
      return
    }

    setCopyState('copying')

    Promise.all([
      writeToClipboard(code).then(
        () => true,
        () => false,
      ),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, copyLoaderMinimumMs)
      }),
    ]).then(([copied]) => {
      setCopyState(copied ? 'copied' : 'idle')
    })
  }

  return (
    <NodeViewWrapper>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-3 z-10 border border-border bg-white text-zinc-900 shadow-sm hover:bg-white hover:text-zinc-900 disabled:opacity-100 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-900 dark:hover:text-white"
            aria-label="کپی"
            aria-busy={copyState === 'copying'}
            contentEditable={false}
            disabled={!isIdle}
            onClick={copyCode}
          >
            {copyState === 'copying' ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : copyState === 'copied' ? (
              <Check className="size-4" />
            ) : (
              <ClipboardCopy className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>کپی</TooltipContent>
      </Tooltip>

      <CodeBlockScrollArea viewportRef={viewportRef}>
        <div className="code-block-row">
          <span
            className="code-block-gutter"
            contentEditable={false}
            aria-hidden="true"
          >
            {lineNumbers}
          </span>
          <NodeViewContent<'pre'>
            as="pre"
            dir="ltr"
            spellCheck={false}
            className="code-block-content"
            style={{ whiteSpace: 'pre' }}
          />
        </div>
      </CodeBlockScrollArea>
    </NodeViewWrapper>
  )
}
