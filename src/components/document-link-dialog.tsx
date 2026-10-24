import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  linkHrefError,
  linkTextError,
  removeLink,
  setLink,
  type LinkRange,
} from '@/lib/link'
import type { Editor } from '@tiptap/react'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useId, useRef, useState, type FormEvent } from 'react'

type DocumentLinkDialogValues = {
  range: LinkRange
  text: string
  href: string
  isEditing: boolean
}

function DocumentLinkDialog({
  editor,
  open,
  initialValues,
  onOpenChange,
}: {
  editor: Editor | null
  open: boolean
  initialValues: DocumentLinkDialogValues | null
  onOpenChange: (open: boolean) => void
}) {
  const [text, setText] = useState(initialValues?.text ?? '')
  const [href, setHref] = useState(initialValues?.href ?? '')
  const [textError, setTextError] = useState<string | null>(null)
  const [hrefError, setHrefError] = useState<string | null>(null)
  const rangeRef = useRef<LinkRange | null>(initialValues?.range ?? null)
  const textInputRef = useRef<HTMLInputElement | null>(null)
  const focusEditorOnClose = useRef(false)
  const textId = useId()
  const hrefId = useId()
  const textErrorId = useId()
  const hrefErrorId = useId()
  const isEditing = initialValues?.isEditing ?? false

  const closeAfterEdit = (): void => {
    focusEditorOnClose.current = true
    onOpenChange(false)
  }

  const submitLink = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    const nextTextError = linkTextError(text)
    const nextHrefError = linkHrefError(href)
    const range = rangeRef.current

    setTextError(nextTextError)
    setHrefError(nextHrefError)

    if (
      nextTextError !== null ||
      nextHrefError !== null ||
      editor === null ||
      range === null
    ) {
      return
    }

    setLink(editor, range, text.trim(), href.trim())
    closeAfterEdit()
  }

  const deleteLink = (): void => {
    const range = rangeRef.current

    if (editor === null || range === null) {
      return
    }

    removeLink(editor, range)
    closeAfterEdit()
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
            textInputRef.current?.focus()
            textInputRef.current?.select()
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
              افزودن / ویرایش لینک
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              برای افزودن یا ویرایش لینک از فرم زیر استفاده نمایید.
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
          <form className="grid gap-6" noValidate onSubmit={submitLink}>
            <div className="grid gap-2">
              <label htmlFor={textId} className="text-sm font-medium">
                متن
              </label>
              <Input
                ref={textInputRef}
                id={textId}
                type="text"
                value={text}
                autoComplete="on"
                aria-invalid={textError !== null}
                aria-describedby={textError !== null ? textErrorId : undefined}
                onChange={(event) => {
                  setText(event.target.value)
                  setTextError(null)
                }}
              />
              {textError === null ? null : (
                <p
                  id={textErrorId}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {textError}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <label htmlFor={hrefId} className="text-sm font-medium">
                آدرس (URL)
              </label>
              <Input
                id={hrefId}
                type="url"
                dir="ltr"
                value={href}
                autoComplete="on"
                aria-invalid={hrefError !== null}
                aria-describedby={hrefError !== null ? hrefErrorId : undefined}
                onChange={(event) => {
                  setHref(event.target.value)
                  setHrefError(null)
                }}
              />
              {hrefError === null ? null : (
                <p
                  id={hrefErrorId}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {hrefError}
                </p>
              )}
            </div>
            <div className="-mx-6 -mb-6 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                انصراف
              </Button>
              {isEditing ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={deleteLink}
                >
                  حذف لینک
                </Button>
              ) : null}
              <Button type="submit" disabled={editor === null}>
                {isEditing ? 'ذخیره' : 'افزودن'}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { DocumentLinkDialog, type DocumentLinkDialogValues }
