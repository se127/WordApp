import {
  isDocumentSaving,
  subscribeToDocumentSaves,
} from '@/lib/close-handshake'
import { LoaderCircle } from 'lucide-react'
import { useSyncExternalStore } from 'react'

function DocumentSaveStatus() {
  const isSaving = useSyncExternalStore(
    subscribeToDocumentSaves,
    isDocumentSaving,
    isDocumentSaving,
  )

  if (!isSaving) {
    return null
  }

  return (
    <div
      dir="rtl"
      role="status"
      aria-label="در حال ذخیره..."
      className="flex items-center gap-2 text-sm whitespace-nowrap"
    >
      <LoaderCircle className="size-4 animate-spin" />
      در حال ذخیره...
    </div>
  )
}

export { DocumentSaveStatus }
