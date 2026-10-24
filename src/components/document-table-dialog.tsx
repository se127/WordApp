import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { parseTableSize, tableSizeError, tableSizeLimit } from '@/lib/table'
import type { Editor } from '@tiptap/react'
import { Minus, Plus, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'

function DocumentTableDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [rows, setRows] = useState('1')
  const [columns, setColumns] = useState('1')
  const [withHeaderRow, setWithHeaderRow] = useState(false)
  const [rowsError, setRowsError] = useState<string | null>(null)
  const [columnsError, setColumnsError] = useState<string | null>(null)
  const rowsInputRef = useRef<HTMLInputElement | null>(null)
  const focusEditorOnClose = useRef(false)
  const rowsId = useId()
  const columnsId = useId()
  const headerRowId = useId()
  const rowsErrorId = useId()
  const columnsErrorId = useId()

  const insertTable = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    const nextRowsError = tableSizeError('rows', rows)
    const nextColumnsError = tableSizeError('columns', columns)

    setRowsError(nextRowsError)
    setColumnsError(nextColumnsError)

    if (nextRowsError !== null || nextColumnsError !== null) {
      return
    }

    const rowCount = parseTableSize(rows)
    const columnCount = parseTableSize(columns)

    if (rowCount === null || columnCount === null || editor === null) {
      return
    }

    editor
      .chain()
      .insertTable({
        rows: rowCount,
        cols: columnCount,
        withHeaderRow,
      })
      .run()

    setRows('1')
    setColumns('1')
    setWithHeaderRow(false)
    focusEditorOnClose.current = true
    onOpenChange(false)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          dir="rtl"
          className="fixed start-1/2 top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl bg-popover p-6 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm rtl:translate-x-1/2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            rowsInputRef.current?.focus()
            rowsInputRef.current?.select()
          }}
          onCloseAutoFocus={(event) => {
            if (!focusEditorOnClose.current) {
              return
            }

            event.preventDefault()
            focusEditorOnClose.current = false
            editor?.chain().focus().run()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <DialogPrimitive.Title className="font-heading text-base font-medium">
              افزودن جدول
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              برای افزودن جدول از فرم زیر استفاده نمایید.
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="بستن"
              className="absolute end-4 top-4"
            >
              <X className="size-4" />
            </Button>
          </DialogPrimitive.Close>
          <form className="grid gap-6" noValidate onSubmit={insertTable}>
            <TableSizeField
              inputRef={rowsInputRef}
              id={rowsId}
              label="تعداد سطرها"
              value={rows}
              error={rowsError}
              errorId={rowsErrorId}
              onChange={(value) => {
                setRows(value)
                setRowsError(null)
              }}
            />
            <TableSizeField
              id={columnsId}
              label="تعداد ستون ها"
              value={columns}
              error={columnsError}
              errorId={columnsErrorId}
              onChange={(value) => {
                setColumns(value)
                setColumnsError(null)
              }}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id={headerRowId}
                checked={withHeaderRow}
                onCheckedChange={(checked) => {
                  setWithHeaderRow(checked === true)
                }}
              />
              <label htmlFor={headerRowId} className="text-sm font-medium">
                اولین سطر به عنوان سرستون؟
              </label>
            </div>
            <div className="-mx-6 -mb-6 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                انصراف
              </Button>
              <Button type="submit" disabled={editor === null}>
                افزودن
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function TableSizeField({
  inputRef,
  id,
  label,
  value,
  error,
  errorId,
  onChange,
}: {
  inputRef?: RefObject<HTMLInputElement | null>
  id: string
  label: string
  value: string
  error: string | null
  errorId: string
  onChange: (value: string) => void
}) {
  const size = parseTableSize(value)
  const atMinimum = size !== null && size <= 1
  const atMaximum = size !== null && size >= tableSizeLimit

  const step = (delta: number): void => {
    const current = parseTableSize(value) ?? 0
    const next = Math.min(tableSizeLimit, Math.max(1, current + delta))

    onChange(String(next))
  }

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div
        data-invalid={error !== null}
        className="flex h-8 w-full items-center gap-0.5 rounded-lg border border-input bg-transparent px-0.5 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 data-[invalid=true]:border-destructive data-[invalid=true]:ring-3 data-[invalid=true]:ring-destructive/20 dark:bg-input/30 dark:data-[invalid=true]:border-destructive/50 dark:data-[invalid=true]:ring-destructive/40"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`کاهش ${label}`}
          disabled={atMinimum}
          onClick={() => {
            step(-1)
          }}
        >
          <Minus />
        </Button>
        <Input
          ref={inputRef}
          id={id}
          type="number"
          value={value}
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby={error !== null ? errorId : undefined}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          className="h-7 w-auto min-w-0 flex-1 [appearance:textfield] rounded-none border-0 bg-transparent px-1 py-0 text-center outline-none focus-visible:border-0 focus-visible:ring-0 aria-invalid:border-0 aria-invalid:ring-0 dark:bg-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`افزایش ${label}`}
          disabled={atMaximum}
          onClick={() => {
            step(1)
          }}
        >
          <Plus />
        </Button>
      </div>
      {error === null ? null : (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export { DocumentTableDialog }
