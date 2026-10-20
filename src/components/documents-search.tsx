import { Button } from '@/components/ui/button'
import { LoaderCircle, Search, X } from 'lucide-react'
import { useId, useRef } from 'react'

function DocumentsSearch({
  value,
  onValueChange,
  isPending,
}: {
  value: string
  onValueChange: (value: string) => void
  isPending: boolean
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const hasValue = value !== ''

  return (
    <div className="flex flex-col gap-2 py-2">
      <label htmlFor={inputId} className="w-fit text-sm">
        جستجوی عنوان
      </label>
      <div className="relative w-72">
        {isPending ? (
          <LoaderCircle
            role="status"
            aria-label="در حال جستجوی عنوان"
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin"
          />
        ) : (
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={value}
          placeholder="عنوان سند"
          autoComplete="off"
          spellCheck={false}
          aria-busy={isPending}
          className="h-8 w-full rounded-lg border border-input bg-transparent ps-9 pe-9 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden"
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && hasValue) {
              event.preventDefault()
              onValueChange('')
            }
          }}
        />
        {hasValue ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="پاک کردن جستجو"
            className="absolute end-0.5 top-1/2 -translate-y-1/2"
            onClick={() => {
              onValueChange('')
              inputRef.current?.focus()
            }}
          >
            <X />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export { DocumentsSearch }
