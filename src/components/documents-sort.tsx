import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { DocumentListOrder } from '@/types/global'
import { useId, useState } from 'react'

function DocumentsSort({
  order,
  onOrderChange,
  isDisabled,
}: {
  order: DocumentListOrder
  onOrderChange: (order: DocumentListOrder) => void
  isDisabled: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerId = useId()

  return (
    <div className="flex flex-col gap-2 py-2">
      <label
        htmlFor={triggerId}
        className={cn(
          'w-fit text-sm',
          isDisabled ? 'cursor-default opacity-50' : 'cursor-pointer',
        )}
        onClick={() => {
          if (!isDisabled) {
            setIsOpen(true)
          }
        }}
      >
        ترتیب بر اساس تاریخ ایجاد
      </label>
      <Select
        open={isOpen}
        onOpenChange={setIsOpen}
        value={order}
        onValueChange={(value) => onOrderChange(value as DocumentListOrder)}
      >
        <SelectTrigger
          id={triggerId}
          aria-label="ترتیب بر اساس تاریخ ایجاد"
          className="w-48"
          disabled={isDisabled}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">جدید به قدیم</SelectItem>
          <SelectItem value="oldest">قدیم به جدید</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

export { DocumentsSort }
