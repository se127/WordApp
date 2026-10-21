import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Placeholder } from '@tiptap/extension-placeholder'
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Bold, Italic, Strikethrough, Underline } from 'lucide-react'
import type { ReactNode } from 'react'
import './document-body-editor.css'

const documentBodyExtensions = [
  StarterKit,
  Placeholder.configure({ placeholder: 'متن سند را اینجا بنویسید...' }),
]
const documentBodyEditorProps = {
  attributes: {
    role: 'textbox',
    'aria-label': 'متن سند',
    'aria-multiline': 'true',
  },
}

function DocumentBodyEditor({
  body,
  onBodyChange,
}: {
  body: string
  onBodyChange: (body: string) => void
}) {
  const editor = useEditor({
    extensions: documentBodyExtensions,
    content: body,
    onUpdate: ({ editor: updatedEditor }) => {
      onBodyChange(updatedEditor.isEmpty ? '' : updatedEditor.getHTML())
    },
    editorProps: documentBodyEditorProps,
  })

  return (
    <div className="document-body-editor flex min-h-0 w-full flex-1 flex-col">
      <div
        role="toolbar"
        aria-label="ابزارهای ویرایش متن"
        dir="rtl"
        className="flex w-full shrink-0 items-center gap-1 border-y bg-emerald-50 px-6 py-1 dark:bg-zinc-900"
      >
        <EditorToolbar editor={editor} />
      </div>

      <ScrollArea type="auto" className="min-h-0 flex-1">
        <div
          dir="rtl"
          className="document-body-prose prose min-h-full max-w-none text-foreground prose-neutral dark:text-white dark:prose-invert"
        >
          <EditorContent editor={editor} className="min-h-full" />
        </div>
      </ScrollArea>
    </div>
  )
}

function EditorToolbar({ editor }: { editor: Editor | null }) {
  const activeMarks = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive('bold') ?? false,
      italic: currentEditor?.isActive('italic') ?? false,
      underline: currentEditor?.isActive('underline') ?? false,
      strike: currentEditor?.isActive('strike') ?? false,
    }),
  })

  return (
    <>
      <ToolbarButton
        label="توپر"
        disabled={editor === null}
        isActive={activeMarks?.bold ?? false}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold />
      </ToolbarButton>
      <ToolbarButton
        label="کج"
        disabled={editor === null}
        isActive={activeMarks?.italic ?? false}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </ToolbarButton>
      <ToolbarButton
        label="زیرخط دار"
        disabled={editor === null}
        isActive={activeMarks?.underline ?? false}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      >
        <Underline />
      </ToolbarButton>
      <ToolbarButton
        label="خط خورده"
        disabled={editor === null}
        isActive={activeMarks?.strike ?? false}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolbarButton>
    </>
  )
}

function ToolbarButton({
  label,
  disabled,
  isActive,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  isActive: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={isActive ? 'default' : 'ghost'}
          size="icon"
          aria-label={label}
          aria-pressed={isActive}
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

export { DocumentBodyEditor }
