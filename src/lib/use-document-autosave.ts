import { registerCloseSave } from '@/lib/close-handshake'
import { documentSaveDebounceMs, useDocumentSave } from '@/lib/document-save'
import type { DocumentChanges, DocumentRecord } from '@/types/global'
import { useCallback, useEffect, useRef, useState } from 'react'

function useDocumentAutosave(document: DocumentRecord) {
  const saveDocument = useDocumentSave(document.id)
  const [title, setTitle] = useState(document.title ?? '')
  const savedTitleRef = useRef<string | null>(document.title)
  const savedBodyRef = useRef(document.body)
  const pendingTitleRef = useRef<string | null | undefined>(undefined)
  const pendingBodyRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveLoopRef = useRef<Promise<boolean> | null>(null)
  const suspendedRef = useRef(false)

  const pendingChanges = useCallback((): DocumentChanges | null => {
    const pendingTitle = pendingTitleRef.current
    const pendingBody = pendingBodyRef.current
    const titleChanged =
      pendingTitle !== undefined && pendingTitle !== savedTitleRef.current
    const bodyChanged =
      pendingBody !== null && pendingBody !== savedBodyRef.current

    if (!titleChanged && !bodyChanged) {
      return null
    }

    return {
      title: pendingTitle === undefined ? savedTitleRef.current : pendingTitle,
      body: pendingBody === null ? savedBodyRef.current : pendingBody,
    }
  }, [])

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimer()
    if (suspendedRef.current) {
      return true
    }

    while (true) {
      if (suspendedRef.current) {
        return true
      }

      const activeSave = saveLoopRef.current
      if (activeSave !== null) {
        const saved = await activeSave
        if (suspendedRef.current) {
          return true
        }
        if (!saved) {
          return false
        }
        continue
      }

      const changes = pendingChanges()
      if (changes === null) {
        return true
      }

      const saveLoop = (async () => {
        while (true) {
          if (suspendedRef.current) {
            return true
          }

          const nextChanges = pendingChanges()
          if (nextChanges === null) {
            return true
          }

          const saved = await saveDocument(
            nextChanges,
            () => suspendedRef.current,
          )
          if (suspendedRef.current) {
            return true
          }
          if (!saved) {
            return false
          }

          if (nextChanges.title !== undefined) {
            savedTitleRef.current = nextChanges.title
            if (pendingTitleRef.current === nextChanges.title) {
              pendingTitleRef.current = undefined
            }
          }

          if (nextChanges.body !== undefined) {
            savedBodyRef.current = nextChanges.body
            if (pendingBodyRef.current === nextChanges.body) {
              pendingBodyRef.current = null
            }
          }
        }
      })()

      saveLoopRef.current = saveLoop
      const saved = await saveLoop

      if (saveLoopRef.current === saveLoop) {
        saveLoopRef.current = null
      }

      if (suspendedRef.current) {
        return true
      }
      if (!saved) {
        return false
      }
    }
  }, [clearTimer, pendingChanges, saveDocument])

  const scheduleSave = useCallback((): void => {
    clearTimer()
    if (suspendedRef.current) {
      return
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void flush()
    }, documentSaveDebounceMs)
  }, [clearTimer, flush])

  const updateTitle = useCallback(
    (nextTitle: string): void => {
      setTitle(nextTitle)
      pendingTitleRef.current = nextTitle.trim() === '' ? null : nextTitle
      scheduleSave()
    },
    [scheduleSave],
  )

  const updateBody = useCallback(
    (nextBody: string): void => {
      pendingBodyRef.current = nextBody
      scheduleSave()
    },
    [scheduleSave],
  )

  const pauseAutosave = useCallback((): void => {
    suspendedRef.current = true
    clearTimer()
  }, [clearTimer])

  const resumeAutosave = useCallback((): void => {
    if (!suspendedRef.current) {
      return
    }

    suspendedRef.current = false
    if (pendingChanges() !== null) {
      scheduleSave()
    }
  }, [pendingChanges, scheduleSave])

  useEffect(() => {
    return () => {
      clearTimer()
      void flush()
    }
  }, [clearTimer, flush])

  useEffect(() => registerCloseSave(flush), [flush])

  return {
    title,
    updateTitle,
    updateBody,
    pauseAutosave,
    resumeAutosave,
  }
}

export { useDocumentAutosave }
