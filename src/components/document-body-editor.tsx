import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/number'
import { Placeholder } from '@tiptap/extension-placeholder'
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import {
  Bold,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Italic,
  Pilcrow,
  PilcrowLeft,
  PilcrowRight,
  Redo,
  Strikethrough,
  Underline,
  Undo,
} from 'lucide-react'
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

const paragraphTextStyle = {
  value: 'paragraph',
  label: 'پاراگراف',
  icon: <Pilcrow />,
}

const textStyleOptions = [
  paragraphTextStyle,
  {
    value: 'heading-2',
    label: `عنوان ${formatNumber(2, { group: false })}`,
    icon: <Heading2 />,
  },
  {
    value: 'heading-3',
    label: `عنوان ${formatNumber(3, { group: false })}`,
    icon: <Heading3 />,
  },
  {
    value: 'heading-4',
    label: `عنوان ${formatNumber(4, { group: false })}`,
    icon: <Heading4 />,
  },
  {
    value: 'heading-5',
    label: `عنوان ${formatNumber(5, { group: false })}`,
    icon: <Heading5 />,
  },
  {
    value: 'heading-6',
    label: `عنوان ${formatNumber(6, { group: false })}`,
    icon: <Heading6 />,
  },
]

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
    textDirection: 'rtl',
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
        className="flex w-full shrink-0 items-center gap-1 border-y bg-gray-100 px-6 py-1 dark:bg-zinc-700"
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

function textStyleValue(editor: Editor | null): string {
  if (editor === null) {
    return 'paragraph'
  }

  for (const level of [2, 3, 4, 5, 6] as const) {
    if (editor.isActive('heading', { level })) {
      return `heading-${level}`
    }
  }

  return 'paragraph'
}

function EditorToolbar({ editor }: { editor: Editor | null }) {
  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive('bold') ?? false,
      italic: currentEditor?.isActive('italic') ?? false,
      underline: currentEditor?.isActive('underline') ?? false,
      strike: currentEditor?.isActive('strike') ?? false,
      canUndo: currentEditor?.can().undo() ?? false,
      canRedo: currentEditor?.can().redo() ?? false,
      textStyle: textStyleValue(currentEditor),
      textDirection: currentEditor?.isActive({ dir: 'ltr' }) ? 'ltr' : 'rtl',
    }),
  })

  const currentTextStyle =
    textStyleOptions.find(
      (option) => option.value === editorState?.textStyle,
    ) ?? paragraphTextStyle

  const setTextStyle = (value: string): void => {
    if (editor === null) {
      return
    }

    if (value === 'paragraph') {
      editor.chain().focus().setParagraph().run()
      return
    }

    const level = Number(value.split('-')[1]) as 2 | 3 | 4 | 5 | 6
    editor.chain().focus().toggleHeading({ level }).run()
  }

  const setTextDirection = (value: string): void => {
    editor
      ?.chain()
      .focus()
      .setTextDirection(value as 'rtl' | 'ltr')
      .run()
  }

  return (
    <>
      <ToolbarButton
        label="برگرداندن"
        disabled={!editorState?.canUndo}
        onClick={() => editor?.chain().focus().undo().run()}
      >
        <Undo />
      </ToolbarButton>
      <ToolbarButton
        label="بازگرداندن"
        disabled={!editorState?.canRedo}
        onClick={() => editor?.chain().focus().redo().run()}
      >
        <Redo />
      </ToolbarButton>
      <Separator orientation="vertical" />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="جهت متن"
                disabled={editor === null}
                className="hover:bg-gray-300"
              >
                {editorState?.textDirection === 'ltr' ? (
                  <PilcrowRight />
                ) : (
                  <PilcrowLeft />
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>جهت متن</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="start"
          className="w-40"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuRadioGroup
            value={editorState?.textDirection ?? 'rtl'}
            onValueChange={setTextDirection}
          >
            <DropdownMenuRadioItem value="rtl" className="whitespace-nowrap">
              <PilcrowLeft />
              راست به چپ
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="ltr" className="whitespace-nowrap">
              <PilcrowRight />
              چپ به راست
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Select
        value={editorState?.textStyle ?? 'paragraph'}
        onValueChange={setTextStyle}
        disabled={editor === null}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger
              aria-label="سبک متن"
              className="w-32 border-transparent bg-transparent hover:bg-gray-300 dark:bg-transparent dark:hover:bg-muted/50"
            >
              <SelectValue>
                {currentTextStyle.icon}
                {currentTextStyle.label}
              </SelectValue>
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent>سبک متن</TooltipContent>
        </Tooltip>
        <SelectContent onCloseAutoFocus={(event) => event.preventDefault()}>
          <SelectGroup>
            {textStyleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.icon}
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Separator orientation="vertical" />
      <ToolbarButton
        label="توپر"
        disabled={editor === null}
        isToggle
        isActive={editorState?.bold ?? false}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold />
      </ToolbarButton>
      <ToolbarButton
        label="کج"
        disabled={editor === null}
        isToggle
        isActive={editorState?.italic ?? false}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </ToolbarButton>
      <ToolbarButton
        label="زیرخط دار"
        disabled={editor === null}
        isToggle
        isActive={editorState?.underline ?? false}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      >
        <Underline />
      </ToolbarButton>
      <ToolbarButton
        label="خط خورده"
        disabled={editor === null}
        isToggle
        isActive={editorState?.strike ?? false}
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
  isActive = false,
  isToggle = false,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  isActive?: boolean
  isToggle?: boolean
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
          aria-pressed={isToggle ? isActive : undefined}
          disabled={disabled}
          className={isActive ? undefined : 'hover:bg-gray-300'}
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
