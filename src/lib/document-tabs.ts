import { createContext } from 'react'

export type DocumentTab = {
  id: number
  title: string
}

export type DocumentTabsValue = {
  tabs: DocumentTab[]
  openDocumentTab: (tab: DocumentTab) => void
  closeDocumentTab: (id: number) => void
}

const emptyDocumentTabs: DocumentTabsValue = {
  tabs: [],
  openDocumentTab: () => {},
  closeDocumentTab: () => {},
}

export const DocumentTabsContext = createContext(emptyDocumentTabs)

const documentPathPattern = /^\/documents\/(\d+)$/

export function activeDocumentId(pathname: string): number | undefined {
  const match = documentPathPattern.exec(pathname)
  return match === null ? undefined : Number(match[1])
}

export function tabAfterClosing(
  tabs: DocumentTab[],
  closingId: number,
): DocumentTab | undefined {
  const index = tabs.findIndex((tab) => tab.id === closingId)
  if (index === -1) {
    return undefined
  }

  const nextTab = tabs[index + 1]
  if (nextTab !== undefined) {
    return nextTab
  }

  return index === 0 ? undefined : tabs[index - 1]
}
