import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getLinkRange, removeLink } from '@/lib/link'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Edit3, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

function DocumentLinkMenu({
  editor,
  onEdit,
}: {
  editor: Editor | null
  onEdit: () => void
}) {
  if (editor === null) {
    return null
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="linkBubbleMenu"
      updateDelay={0}
      shouldShow={({ editor: currentEditor, view }) => {
        return view.hasFocus() && currentEditor.isActive('link')
      }}
      options={{ placement: 'bottom' }}
      dir="rtl"
      className="rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <div className="flex items-center gap-1.5 p-1">
        <LinkMenuButton label="ویرایش لینک" onClick={onEdit}>
          <Edit3 />
        </LinkMenuButton>
        <LinkMenuButton
          label="حذف لینک"
          destructive
          onClick={() => {
            removeLink(editor, getLinkRange(editor))
          }}
        >
          <Trash2 />
        </LinkMenuButton>
      </div>
    </BubbleMenu>
  )
}

function LinkMenuButton({
  label,
  destructive = false,
  onClick,
  children,
}: {
  label: string
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

export { DocumentLinkMenu }
