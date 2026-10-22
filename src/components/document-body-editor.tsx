import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
import {
  fontSizes,
  normalizePastedFontSizes,
  parseFontSize,
  snapFontSize,
} from '@/lib/font-size'
import { formatNumber } from '@/lib/number'
import { cn } from '@/lib/utils'
import { Highlight } from '@tiptap/extension-highlight'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Subscript as SubscriptExtension } from '@tiptap/extension-subscript'
import { Superscript as SuperscriptExtension } from '@tiptap/extension-superscript'
import { TextAlign } from '@tiptap/extension-text-align'
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style'
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  PilcrowLeft,
  PilcrowRight,
  Redo,
  Square,
  Strikethrough,
  Subscript,
  Superscript,
  Type,
  Underline,
  Undo,
} from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import './document-body-editor.css'

const documentBodyExtensions = [
  StarterKit,
  TextStyle,
  Color,
  FontSize,
  Highlight.configure({ multicolor: true }),
  Placeholder.configure({ placeholder: 'متن سند را اینجا بنویسید...' }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  SuperscriptExtension,
  SubscriptExtension,
]
const documentBodyEditorProps = {
  attributes: {
    role: 'textbox',
    'aria-label': 'متن سند',
    'aria-multiline': 'true',
  },
  transformPastedHTML: (html: string): string => normalizePastedFontSizes(html),
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

const fontSizeOptions = fontSizes.map((size) => ({
  value: `${size}px`,
  label: `${formatNumber(size, { group: false })}px`,
}))

const defaultFontSize = fontSizeOptions[0]

const textAlignOptions = [
  { value: 'right', label: 'راست چین', icon: <AlignRight /> },
  { value: 'left', label: 'چپ چین', icon: <AlignLeft /> },
  { value: 'center', label: 'وسط چین', icon: <AlignCenter /> },
  { value: 'justify', label: 'بلوکی', icon: <AlignJustify /> },
]

const textPositionOptions = [
  { value: 'baseline', label: 'معمولی', icon: <Baseline /> },
  { value: 'superscript', label: 'بالا نویس', icon: <Superscript /> },
  { value: 'subscript', label: 'پایین نویس', icon: <Subscript /> },
]

const colorGrid = [
  [
    '#000000',
    '#262626',
    '#404040',
    '#595959',
    '#737373',
    '#8c8c8c',
    '#a6a6a6',
    '#bfbfbf',
    '#d9d9d9',
    '#ffffff',
  ],
  [
    '#7f1d1d',
    '#991b1b',
    '#b91c1c',
    '#dc2626',
    '#ef4444',
    '#f87171',
    '#fca5a5',
    '#fecaca',
    '#fee2e2',
    '#fef2f2',
  ],
  [
    '#7c2d12',
    '#9a3412',
    '#c2410c',
    '#ea580c',
    '#f97316',
    '#fb923c',
    '#fdba74',
    '#fed7aa',
    '#ffedd5',
    '#fff7ed',
  ],
  [
    '#14532d',
    '#166534',
    '#15803d',
    '#16a34a',
    '#22c55e',
    '#4ade80',
    '#86efac',
    '#bbf7d0',
    '#dcfce7',
    '#f0fdf4',
  ],
  [
    '#1e3a8a',
    '#1e40af',
    '#1d4ed8',
    '#2563eb',
    '#3b82f6',
    '#60a5fa',
    '#93c5fd',
    '#bfdbfe',
    '#dbeafe',
    '#eff6ff',
  ],
  [
    '#581c87',
    '#6b21a8',
    '#7e22ce',
    '#9333ea',
    '#a855f7',
    '#c084fc',
    '#d8b4fe',
    '#e9d5ff',
    '#f3e8ff',
    '#fdf4ff',
  ],
]

function fontSizeValue(editor: Editor | null): string {
  if (editor === null) {
    return defaultFontSize.value
  }

  const current = editor.getAttributes('textStyle').fontSize as
    string | undefined
  const size = parseFontSize(current) ?? fontSizes[0]

  return `${snapFontSize(size)}px`
}

function textAlignValue(editor: Editor | null): string {
  if (editor === null) {
    return 'right'
  }

  const attributes = editor.isActive('heading')
    ? editor.getAttributes('heading')
    : editor.getAttributes('paragraph')
  const textAlign = attributes.textAlign

  if (typeof textAlign === 'string') {
    return textAlign
  }

  return editor.isActive({ dir: 'ltr' }) ? 'left' : 'right'
}

function textPositionValue(
  editor: Editor | null,
): 'baseline' | 'subscript' | 'superscript' {
  if (editor?.isActive('superscript')) {
    return 'superscript'
  }

  if (editor?.isActive('subscript')) {
    return 'subscript'
  }

  return 'baseline'
}

function useEditorFocusAfterToolbarSelection(editor: Editor | null) {
  const focusEditorOnClose = useRef(false)

  const markToolbarSelection = (): void => {
    focusEditorOnClose.current = true
  }

  const handleCloseAutoFocus = (event: Event): void => {
    if (!focusEditorOnClose.current) {
      return
    }

    event.preventDefault()
    focusEditorOnClose.current = false
    editor?.chain().focus().run()
  }

  return { markToolbarSelection, handleCloseAutoFocus }
}

function handleSelectItemKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  markSelection: () => void,
): void {
  if (event.key === 'Enter' || event.key === ' ') {
    markSelection()
  }
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
      bulletList: currentEditor?.isActive('bulletList') ?? false,
      orderedList: currentEditor?.isActive('orderedList') ?? false,
      canUndo: currentEditor?.can().undo() ?? false,
      canRedo: currentEditor?.can().redo() ?? false,
      textStyle: textStyleValue(currentEditor),
      textDirection: currentEditor?.isActive({ dir: 'ltr' }) ? 'ltr' : 'rtl',
      textAlign: textAlignValue(currentEditor),
      textPosition: textPositionValue(currentEditor),
      fontSize: fontSizeValue(currentEditor),
      textColor: currentEditor?.getAttributes('textStyle').color as
        string | undefined,
      highlightColor: currentEditor?.getAttributes('highlight').color as
        string | undefined,
    }),
  })

  const directionFocus = useEditorFocusAfterToolbarSelection(editor)
  const textStyleFocus = useEditorFocusAfterToolbarSelection(editor)
  const fontSizeFocus = useEditorFocusAfterToolbarSelection(editor)
  const textAlignFocus = useEditorFocusAfterToolbarSelection(editor)
  const textPositionFocus = useEditorFocusAfterToolbarSelection(editor)

  const currentTextStyle =
    textStyleOptions.find(
      (option) => option.value === editorState?.textStyle,
    ) ?? paragraphTextStyle

  const currentFontSize =
    fontSizeOptions.find((option) => option.value === editorState?.fontSize) ??
    defaultFontSize

  const currentTextAlign =
    textAlignOptions.find(
      (option) => option.value === editorState?.textAlign,
    ) ?? textAlignOptions[0]

  const currentTextPosition =
    textPositionOptions.find(
      (option) => option.value === editorState?.textPosition,
    ) ?? textPositionOptions[0]

  const setTextStyle = (value: string): void => {
    if (editor === null) {
      return
    }

    textStyleFocus.markToolbarSelection()

    if (value === 'paragraph') {
      editor.chain().focus().setParagraph().run()
      return
    }

    const level = Number(value.split('-')[1]) as 2 | 3 | 4 | 5 | 6
    editor.chain().focus().toggleHeading({ level }).run()
  }

  const setTextDirection = (value: string): void => {
    if (editor === null) {
      return
    }

    directionFocus.markToolbarSelection()
    editor
      .chain()
      .focus()
      .setTextDirection(value as 'rtl' | 'ltr')
      .run()
  }

  const setFontSize = (value: string): void => {
    if (editor === null) {
      return
    }

    fontSizeFocus.markToolbarSelection()
    editor.chain().focus().setFontSize(value).run()
  }

  const setTextAlign = (value: string): void => {
    if (editor === null) {
      return
    }

    textAlignFocus.markToolbarSelection()
    editor.chain().focus().setTextAlign(value).run()
  }

  const setTextPosition = (value: string): void => {
    if (editor === null) {
      return
    }

    textPositionFocus.markToolbarSelection()

    if (value === 'superscript') {
      editor.chain().focus().unsetSubscript().setSuperscript().run()
      return
    }

    if (value === 'subscript') {
      editor.chain().focus().unsetSuperscript().setSubscript().run()
      return
    }

    editor.chain().focus().unsetSuperscript().unsetSubscript().run()
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
          onCloseAutoFocus={directionFocus.handleCloseAutoFocus}
        >
          <DropdownMenuRadioGroup
            value={editorState?.textDirection ?? 'rtl'}
            onValueChange={setTextDirection}
          >
            <DropdownMenuRadioItem
              value="rtl"
              className="whitespace-nowrap"
              onSelect={directionFocus.markToolbarSelection}
            >
              <PilcrowLeft />
              راست به چپ
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="ltr"
              className="whitespace-nowrap"
              onSelect={directionFocus.markToolbarSelection}
            >
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
              className="w-32 border-input bg-white hover:bg-white dark:bg-zinc-800 dark:hover:bg-zinc-800"
            >
              <SelectValue>
                {currentTextStyle.icon}
                {currentTextStyle.label}
              </SelectValue>
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent>سبک متن</TooltipContent>
        </Tooltip>
        <SelectContent onCloseAutoFocus={textStyleFocus.handleCloseAutoFocus}>
          <SelectGroup>
            {textStyleOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                onPointerUp={textStyleFocus.markToolbarSelection}
                onKeyDown={(event) =>
                  handleSelectItemKeyDown(
                    event,
                    textStyleFocus.markToolbarSelection,
                  )
                }
              >
                {option.icon}
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Separator orientation="vertical" />
      <Select
        value={editorState?.fontSize ?? defaultFontSize.value}
        onValueChange={setFontSize}
        disabled={editor === null}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger
              aria-label="اندازه ی متن"
              className="w-24 border-input bg-white hover:bg-white dark:bg-zinc-800 dark:hover:bg-zinc-800"
            >
              <SelectValue>{currentFontSize.label}</SelectValue>
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent>اندازه ی متن</TooltipContent>
        </Tooltip>
        <SelectContent onCloseAutoFocus={fontSizeFocus.handleCloseAutoFocus}>
          <SelectGroup>
            {fontSizeOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                onPointerUp={fontSizeFocus.markToolbarSelection}
                onKeyDown={(event) =>
                  handleSelectItemKeyDown(
                    event,
                    fontSizeFocus.markToolbarSelection,
                  )
                }
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
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
      <ToolbarColorPicker
        editor={editor}
        label="رنگ متن"
        icon={<Type />}
        currentColor={editorState?.textColor}
        defaultColor="currentColor"
        onPick={(color) => editor?.chain().focus().setColor(color).run()}
        onReset={() => editor?.chain().focus().unsetColor().run()}
      />
      <ToolbarColorPicker
        editor={editor}
        label="رنگ پس زمینه"
        icon={<Highlighter />}
        currentColor={editorState?.highlightColor}
        defaultColor="#fef08a"
        onPick={(color) =>
          editor?.chain().focus().setHighlight({ color }).run()
        }
        onReset={() => editor?.chain().focus().unsetHighlight().run()}
      />
      <Separator orientation="vertical" />
      <ToolbarButton
        label="لیست نقطه ای"
        disabled={editor === null}
        isToggle
        isActive={editorState?.bulletList ?? false}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List />
      </ToolbarButton>
      <ToolbarButton
        label="لیست نشانه دار"
        disabled={editor === null}
        isToggle
        isActive={editorState?.orderedList ?? false}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered />
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
                aria-label="تراز متن"
                disabled={editor === null}
                className="hover:bg-gray-300"
              >
                {currentTextAlign.icon}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>تراز متن</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="start"
          className="w-40"
          onCloseAutoFocus={textAlignFocus.handleCloseAutoFocus}
        >
          <DropdownMenuRadioGroup
            value={editorState?.textAlign ?? 'right'}
            onValueChange={setTextAlign}
          >
            {textAlignOptions.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className="whitespace-nowrap"
                onSelect={textAlignFocus.markToolbarSelection}
              >
                {option.icon}
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="موقعیت متن"
                disabled={editor === null}
                className="hover:bg-gray-300"
              >
                {currentTextPosition.icon}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>موقعیت متن</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="start"
          className="w-40"
          onCloseAutoFocus={textPositionFocus.handleCloseAutoFocus}
        >
          <DropdownMenuRadioGroup
            value={editorState?.textPosition ?? 'baseline'}
            onValueChange={setTextPosition}
          >
            {textPositionOptions.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className="whitespace-nowrap"
                onSelect={textPositionFocus.markToolbarSelection}
              >
                {option.icon}
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
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

function moveColorPickerFocus(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== 'Tab') {
    return
  }

  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      '[data-color-picker-item]',
    ),
  )

  if (items.length === 0) {
    return
  }

  event.preventDefault()

  const currentIndex = items.findIndex(
    (item) => item === document.activeElement,
  )
  const step = event.shiftKey ? -1 : 1
  const nextIndex =
    currentIndex === -1
      ? event.shiftKey
        ? items.length - 1
        : 0
      : (currentIndex + step + items.length) % items.length

  items[nextIndex]?.focus()
}

function ToolbarColorPicker({
  editor,
  label,
  icon,
  currentColor,
  defaultColor,
  onPick,
  onReset,
}: {
  editor: Editor | null
  label: string
  icon: ReactNode
  currentColor: string | undefined
  defaultColor: string
  onPick: (color: string) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const { markToolbarSelection, handleCloseAutoFocus } =
    useEditorFocusAfterToolbarSelection(editor)

  const pickColor = (color: string): void => {
    markToolbarSelection()
    onPick(color)
    setOpen(false)
  }

  const resetColor = (): void => {
    markToolbarSelection()
    onReset()
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={label}
              disabled={editor === null}
              className="hover:bg-gray-300"
            >
              <span className="flex flex-col items-center justify-center gap-0.5">
                {icon}
                <span
                  className="h-0.5 w-full"
                  style={{
                    backgroundColor: currentColor ?? defaultColor,
                  }}
                />
              </span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="w-64"
        onCloseAutoFocus={handleCloseAutoFocus}
        onKeyDown={moveColorPickerFocus}
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="justify-center"
            data-color-picker-item
            onSelect={resetColor}
          >
            <span className="relative size-4">
              <Square className="size-4" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="h-full w-0.5 rotate-45 bg-destructive" />
              </span>
            </span>
            پیش فرض
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="grid grid-cols-10 gap-1 p-2">
          {colorGrid.flat().map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              data-color-picker-item
              className={cn(
                'size-5 shrink-0 appearance-none rounded border border-border outline-none',
                currentColor === color
                  ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background'
                  : 'hover:ring-2 hover:ring-black hover:ring-offset-1 hover:ring-offset-background focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:hover:ring-white dark:focus-visible:ring-white',
              )}
              style={{ backgroundColor: color }}
              onClick={() => {
                pickColor(color)
              }}
            />
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { DocumentBodyEditor }
