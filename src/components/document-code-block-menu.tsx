import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getCodeBlockPosition, removeCodeBlock } from '@/lib/code-block'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Trash2 } from 'lucide-react'

function DocumentCodeBlockMenu({ editor }: { editor: Editor | null }) {
  if (editor === null) {
    return null
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="codeBlockBubbleMenu"
      updateDelay={0}
      shouldShow={({ editor: currentEditor, view }) => {
        return view.hasFocus() && currentEditor.isActive('codeBlock')
      }}
      getReferencedVirtualElement={() => {
        const position = getCodeBlockPosition(editor)

        if (position === null) {
          return null
        }

        const codeBlock = editor.view.nodeDOM(position)

        return codeBlock instanceof HTMLElement ? codeBlock : null
      }}
      options={{ placement: 'bottom' }}
      dir="rtl"
      data-slot="code-block-bubble-menu"
      className="rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <div className="flex items-center gap-1.5 p-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              aria-label="حذف بلوک کد"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                removeCodeBlock(editor)
              }}
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>حذف بلوک کد</TooltipContent>
        </Tooltip>
      </div>
    </BubbleMenu>
  )
}

export { DocumentCodeBlockMenu }
