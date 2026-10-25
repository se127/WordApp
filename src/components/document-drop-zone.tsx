import { insertDocumentImages } from '@/lib/image'
import type { Editor } from '@tiptap/core'
import { ImagePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function DocumentDropZone({
  editor,
  documentId,
}: {
  editor: Editor | null
  documentId: number
}) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const dragDepth = useRef(0)

  useEffect(() => {
    const hideDropZone = (): void => {
      dragDepth.current = 0
      setIsDraggingFiles(false)
    }

    const handleDragEnter = (event: DragEvent): void => {
      if (!carriesFiles(event)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      dragDepth.current += 1
      setIsDraggingFiles(true)
    }

    const handleDragOver = (event: DragEvent): void => {
      if (!carriesFiles(event)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (event.dataTransfer !== null) {
        event.dataTransfer.dropEffect = 'copy'
      }

      setIsDraggingFiles(true)
    }

    const handleDragLeave = (): void => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)

      if (dragDepth.current === 0) {
        setIsDraggingFiles(false)
      }
    }

    const handleDrop = (event: DragEvent): void => {
      if (!carriesFiles(event)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      hideDropZone()

      if (editor === null || event.dataTransfer === null) {
        return
      }

      void insertDocumentImages(editor, documentId, [
        ...event.dataTransfer.files,
      ])
    }

    window.addEventListener('dragenter', handleDragEnter, true)
    window.addEventListener('dragover', handleDragOver, true)
    window.addEventListener('dragleave', handleDragLeave, true)
    window.addEventListener('drop', handleDrop, true)
    window.addEventListener('dragend', hideDropZone)
    window.addEventListener('blur', hideDropZone)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter, true)
      window.removeEventListener('dragover', handleDragOver, true)
      window.removeEventListener('dragleave', handleDragLeave, true)
      window.removeEventListener('drop', handleDrop, true)
      window.removeEventListener('dragend', hideDropZone)
      window.removeEventListener('blur', hideDropZone)
    }
  }, [editor, documentId])

  if (!isDraggingFiles) {
    return null
  }

  return (
    <div
      dir="rtl"
      aria-hidden="true"
      data-slot="document-drop-zone"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-background/95 p-10 text-center">
        <ImagePlus className="size-8" />
        <p className="text-lg font-medium">محل رها کردن فایل</p>
      </div>
    </div>
  )
}

export { DocumentDropZone }
