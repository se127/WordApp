const closeSaveHandlers = new Set<() => Promise<boolean>>()
const pendingSaves = new Set<Promise<unknown>>()

function isDocumentSaving(): boolean {
  return pendingSaves.size > 0
}

function registerCloseSave(handler: () => Promise<boolean>): () => void {
  closeSaveHandlers.add(handler)
  return () => {
    closeSaveHandlers.delete(handler)
  }
}

function trackDocumentSave<T>(promise: Promise<T>): Promise<T> {
  pendingSaves.add(promise)
  void promise.then(
    () => {
      pendingSaves.delete(promise)
    },
    () => {
      pendingSaves.delete(promise)
    },
  )
  return promise
}

async function flushDocumentSaves(): Promise<boolean> {
  const handlerResults = await Promise.allSettled(
    [...closeSaveHandlers].map((handler) =>
      Promise.resolve().then(() => handler()),
    ),
  )
  const pendingResults = await Promise.allSettled([...pendingSaves])

  return (
    handlerResults.every(
      (result) => result.status === 'fulfilled' && result.value,
    ) && pendingResults.every((result) => result.status === 'fulfilled')
  )
}

async function flushBeforeClose(): Promise<void> {
  if (await flushDocumentSaves()) {
    window.WordApp?.lifecycle?.closeReady()
  } else {
    window.WordApp?.lifecycle?.closeCancelled()
  }
}

function listenForClose(): () => void {
  return (
    window.WordApp?.lifecycle?.onBeforeClose(() => {
      void flushBeforeClose()
    }) ?? (() => {})
  )
}

export {
  flushDocumentSaves,
  isDocumentSaving,
  listenForClose,
  registerCloseSave,
  trackDocumentSave,
}
