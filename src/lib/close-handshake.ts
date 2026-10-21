const closeSaveHandlers = new Set<() => Promise<void>>()
const pendingSaves = new Set<Promise<unknown>>()

function registerCloseSave(handler: () => Promise<void>): () => void {
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

async function flushBeforeClose(): Promise<void> {
  await Promise.allSettled(
    [...closeSaveHandlers].map((handler) =>
      Promise.resolve().then(() => handler()),
    ),
  )
  await Promise.allSettled([...pendingSaves])
  window.WordApp?.lifecycle?.closeReady()
}

function listenForClose(): () => void {
  return (
    window.WordApp?.lifecycle?.onBeforeClose(() => {
      void flushBeforeClose()
    }) ?? (() => {})
  )
}

export { listenForClose, registerCloseSave, trackDocumentSave }
