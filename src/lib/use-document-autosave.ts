import { registerCloseSave } from '@/lib/close-handshake'
import {
  forgetDocumentChanges,
  rememberedDocumentChanges,
  rememberDocumentChanges,
  setRememberedDocumentWait,
} from '@/lib/document-recovery'
import { documentSaveDebounceMs, useDocumentSave } from '@/lib/document-save'
import { collectDocumentImages } from '@/lib/image'
import { registerPendingChanges } from '@/lib/pending-changes'
import type { DocumentChanges, DocumentRecord } from '@/types/global'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

function useDocumentAutosave(document: DocumentRecord) {
  const queryClient = useQueryClient()
  const [recovered] = useState(() =>
    rememberedDocumentChanges(queryClient, document.id),
  )
  const saveDocument = useDocumentSave(document.id)
  const recoveredTitle = recovered?.changes.title
  const recoveredBody = recovered?.changes.body
  const initialTitle =
    recoveredTitle === undefined ? document.title : recoveredTitle
  const initialBody =
    recoveredBody === undefined ? document.body : recoveredBody
  const [title, setTitle] = useState(initialTitle ?? '')
  const body = initialBody
  const savedTitleRef = useRef<string | null>(document.title)
  const savedBodyRef = useRef(document.body)
  const pendingTitleRef = useRef<string | null | undefined>(
    recoveredTitle !== undefined && recoveredTitle !== document.title
      ? recoveredTitle
      : undefined,
  )
  const pendingBodyRef = useRef<string | null>(
    recoveredBody !== undefined && recoveredBody !== document.body
      ? recoveredBody
      : null,
  )
  const revisionRef = useRef(recovered?.revision ?? 0)
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

          const nextRevision = revisionRef.current
          const saved = await saveDocument(
            nextChanges,
            () => suspendedRef.current,
          )
          if (suspendedRef.current) {
            return true
          }
          if (!saved) {
            const latestChanges = pendingChanges()
            if (latestChanges !== null) {
              rememberDocumentChanges(
                queryClient,
                document.id,
                latestChanges,
                revisionRef.current,
                null,
              )
            }
            return false
          }

          forgetDocumentChanges(queryClient, document.id, nextRevision)

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

          if (nextChanges.body !== undefined) {
            await collectDocumentImages(
              document.id,
              nextChanges.body,
              pendingBodyRef.current ?? nextChanges.body,
            ).catch(() => {})
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
  }, [clearTimer, document.id, pendingChanges, queryClient, saveDocument])

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
      revisionRef.current += 1
      if (pendingChanges() === null) {
        forgetDocumentChanges(queryClient, document.id)
        if (saveLoopRef.current === null) {
          clearTimer()
          return
        }
      }
      scheduleSave()
    },
    [clearTimer, document.id, pendingChanges, queryClient, scheduleSave],
  )

  const updateBody = useCallback(
    (nextBody: string): void => {
      pendingBodyRef.current = nextBody
      revisionRef.current += 1
      if (pendingChanges() === null) {
        forgetDocumentChanges(queryClient, document.id)
        if (saveLoopRef.current === null) {
          clearTimer()
          return
        }
      }
      scheduleSave()
    },
    [clearTimer, document.id, pendingChanges, queryClient, scheduleSave],
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
    if (pendingChanges() === null) {
      forgetDocumentChanges(queryClient, document.id)
    }
  }, [document.id, pendingChanges, queryClient])

  useEffect(() => {
    return () => {
      if (suspendedRef.current) {
        return
      }

      const changes = pendingChanges()
      if (changes !== null) {
        rememberDocumentChanges(
          queryClient,
          document.id,
          changes,
          revisionRef.current,
          saveLoopRef.current,
        )
      }

      if (timerRef.current !== null) {
        const flushing = flush()
        setRememberedDocumentWait(queryClient, document.id, flushing)
      }
    }
  }, [document.id, flush, pendingChanges, queryClient])

  useEffect(() => registerCloseSave(flush), [flush])

  useEffect(
    () =>
      registerPendingChanges(() => {
        const changes = pendingChanges()
        return changes === null ? null : { documentId: document.id, changes }
      }),
    [document.id, pendingChanges],
  )

  return {
    title,
    body,
    updateTitle,
    updateBody,
    saveNow: flush,
    pauseAutosave,
    resumeAutosave,
  }
}

export { useDocumentAutosave }
