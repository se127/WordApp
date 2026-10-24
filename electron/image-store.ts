import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  imageFileNameForCopy,
  imageFileNameForSave,
  imageFileNameFromUrl,
  imageJournalPath,
  imageUrl,
  moveImageFileFromTrash,
  moveImageFileToTrash,
  overwriteImageFile,
  readImageFile,
  readImageFileFromTrash,
  referencedImageFileNames,
  removeImageFileEverywhere,
  restoreImageFile,
  writeImageFile,
} from './images.ts'
import type {
  ImageReconcileRequest,
  ImageRestoreRequest,
  ImageSaveRequest,
  ImageSourceRequest,
  SavedImage,
} from './images.ts'

export type ImageJournalEntry = {
  action: 'add' | 'remove'
  documentId: number
  src: string
}

export type ImageStore = {
  save: (request: ImageSaveRequest) => Promise<SavedImage>
  copy: (request: ImageSourceRequest) => Promise<SavedImage>
  remove: (request: ImageSourceRequest) => Promise<ArrayBuffer | null>
  restore: (request: ImageRestoreRequest) => Promise<SavedImage>
  reconcile: (request: ImageReconcileRequest) => Promise<void>
  recover: (
    getDocument: (id: number) => Promise<{ body: string } | undefined>,
  ) => Promise<void>
  removeDocument: (documentId: number, body: string) => Promise<void>
}

type JournalDocument = {
  body: string
}

function isJournalEntry(value: unknown): value is ImageJournalEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { action, documentId, src } = value as {
    action?: unknown
    documentId?: unknown
    src?: unknown
  }

  return (
    (action === 'add' || action === 'remove') &&
    typeof documentId === 'number' &&
    Number.isSafeInteger(documentId) &&
    documentId > 0 &&
    typeof src === 'string' &&
    imageFileNameFromUrl(src) !== null
  )
}

async function loadJournal(filePath: string): Promise<ImageJournalEntry[]> {
  let text: string

  try {
    text = await readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }

  try {
    const parsed: unknown = JSON.parse(text)

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('The image journal is not an object.')
    }

    const entries = (parsed as { entries?: unknown }).entries

    if (!Array.isArray(entries)) {
      throw new Error('The image journal has no entries.')
    }

    return entries.filter(isJournalEntry)
  } catch (error) {
    const backupPath = `${filePath}.corrupt-${Date.now()}`
    await rename(filePath, backupPath).catch(() => {})
    console.error(
      `The image journal could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return []
  }
}

async function persistJournal(
  filePath: string,
  entries: ImageJournalEntry[],
): Promise<void> {
  if (entries.length === 0) {
    await rm(filePath, { force: true })
    return
  }

  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  await writeFile(
    temporaryPath,
    JSON.stringify({ version: 1, entries }),
    'utf8',
  )
  await rename(temporaryPath, filePath)
}

function sameEntry(left: ImageJournalEntry, right: ImageJournalEntry): boolean {
  return (
    left.action === right.action &&
    left.documentId === right.documentId &&
    left.src === right.src
  )
}

function withEntry(
  entries: ImageJournalEntry[],
  entry: ImageJournalEntry,
): ImageJournalEntry[] {
  return entries.some((current) => sameEntry(current, entry))
    ? entries
    : [...entries, entry]
}

export async function createImageStore(directory: string): Promise<ImageStore> {
  const journalPath = imageJournalPath(directory)
  let entries = await loadJournal(journalPath)
  const removedImageBytes = new Map<string, ArrayBuffer>()
  let operationQueue: Promise<unknown> = Promise.resolve()

  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationQueue.then(operation, operation)
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const updateEntries = async (
    nextEntries: ImageJournalEntry[],
  ): Promise<void> => {
    await persistJournal(journalPath, nextEntries)
    entries = nextEntries
  }

  const addJournalEntry = async (entry: ImageJournalEntry): Promise<void> => {
    if (entries.some((current) => sameEntry(current, entry))) {
      return
    }

    await updateEntries([...entries, entry])
  }

  const restoreFile = async (src: string): Promise<boolean> => {
    if (await moveImageFileFromTrash(directory, src)) {
      removedImageBytes.delete(src)
      return true
    }

    if ((await readImageFile(directory, src)) !== null) {
      removedImageBytes.delete(src)
      return true
    }

    const data = removedImageBytes.get(src)
    const fileName = imageFileNameFromUrl(src)

    if (data === undefined || fileName === null) {
      return false
    }

    await overwriteImageFile(directory, fileName, data)
    removedImageBytes.delete(src)
    return true
  }

  const save = (request: ImageSaveRequest): Promise<SavedImage> =>
    run(async () => {
      const fileName = imageFileNameForSave(request)

      if (fileName === null) {
        throw new Error('The picked file is not a supported image.')
      }

      const src = imageUrl(fileName)
      const entry: ImageJournalEntry = {
        action: 'add',
        documentId: request.documentId,
        src,
      }

      await addJournalEntry(entry)

      try {
        await writeImageFile(directory, fileName, request.data)
      } catch (error) {
        await updateEntries(
          entries.filter((current) => !sameEntry(current, entry)),
        ).catch(() => {})
        throw error
      }

      return { src }
    })

  const copy = (request: ImageSourceRequest): Promise<SavedImage> =>
    run(async () => {
      const copyName = imageFileNameForCopy(request.src)

      if (copyName === null) {
        throw new Error('The image source is not a stored image.')
      }

      const data =
        (await readImageFile(directory, request.src)) ??
        (await readImageFileFromTrash(directory, request.src))

      if (data === null) {
        throw new Error('The stored image is missing.')
      }

      const src = imageUrl(copyName)
      const entry: ImageJournalEntry = {
        action: 'add',
        documentId: request.documentId,
        src,
      }

      await addJournalEntry(entry)

      try {
        await writeImageFile(directory, copyName, data)
      } catch (error) {
        await updateEntries(
          entries.filter((current) => !sameEntry(current, entry)),
        ).catch(() => {})
        throw error
      }

      return { src }
    })

  const remove = (request: ImageSourceRequest): Promise<ArrayBuffer | null> =>
    run(async () => {
      if (imageFileNameFromUrl(request.src) === null) {
        return null
      }

      const entry: ImageJournalEntry = {
        action: 'remove',
        documentId: request.documentId,
        src: request.src,
      }

      await addJournalEntry(entry)

      const data = await moveImageFileToTrash(directory, request.src)

      if (data === null) {
        await updateEntries(
          entries.filter((current) => !sameEntry(current, entry)),
        )
        return null
      }

      removedImageBytes.set(request.src, data)
      return data
    })

  const restore = (request: ImageRestoreRequest): Promise<SavedImage> =>
    run(async () => {
      const fileName = imageFileNameFromUrl(request.src)

      if (fileName === null) {
        throw new Error('The image source is not a stored image.')
      }

      const nextEntries = entries.filter(
        (entry) =>
          entry.action !== 'remove' ||
          entry.documentId !== request.documentId ||
          entry.src !== request.src,
      )
      const nextWithAdd = withEntry(nextEntries, {
        action: 'add',
        documentId: request.documentId,
        src: request.src,
      })

      await updateEntries(nextWithAdd)

      if (!(await restoreFile(request.src))) {
        await restoreImageFile(directory, request)
      }

      removedImageBytes.delete(request.src)

      return { src: request.src }
    })

  const reconcile = (request: ImageReconcileRequest): Promise<void> =>
    run(async () => {
      const savedNames = referencedImageFileNames(request.savedBody)
      const currentNames = referencedImageFileNames(request.currentBody)
      const nextEntries: ImageJournalEntry[] = []
      let changed = false
      const appendNext = (entry: ImageJournalEntry): void => {
        if (!nextEntries.some((current) => sameEntry(current, entry))) {
          nextEntries.push(entry)
        }
      }

      for (const entry of entries) {
        if (entry.documentId !== request.documentId) {
          appendNext(entry)
          continue
        }

        const fileName = imageFileNameFromUrl(entry.src)

        if (fileName === null) {
          changed = true
          continue
        }

        const inSaved = savedNames.has(fileName)
        const inCurrent = currentNames.has(fileName)

        if (entry.action === 'add') {
          if (inSaved) {
            changed = true
            continue
          }

          if (inCurrent) {
            appendNext(entry)
            continue
          }

          await removeImageFileEverywhere(directory, entry.src)
          removedImageBytes.delete(entry.src)
          changed = true
          continue
        }

        if (inCurrent) {
          if (await restoreFile(entry.src)) {
            if (!inSaved) {
              appendNext({
                action: 'add',
                documentId: entry.documentId,
                src: entry.src,
              })
            }

            changed = true
            continue
          }

          appendNext(entry)
          continue
        }

        if (inSaved) {
          appendNext(entry)
          continue
        }

        await removeImageFileEverywhere(directory, entry.src)
        removedImageBytes.delete(entry.src)
        changed = true
      }

      if (changed) {
        await updateEntries(nextEntries)
      }
    })

  const recover = (
    getDocument: (id: number) => Promise<JournalDocument | undefined>,
  ): Promise<void> =>
    run(async () => {
      const nextEntries: ImageJournalEntry[] = []

      for (const entry of entries) {
        let document: JournalDocument | undefined

        try {
          document = await getDocument(entry.documentId)
        } catch {
          nextEntries.push(entry)
          continue
        }

        const fileName = imageFileNameFromUrl(entry.src)

        if (fileName === null) {
          continue
        }

        if (document === undefined) {
          await removeImageFileEverywhere(directory, entry.src)
          removedImageBytes.delete(entry.src)
          continue
        }

        const inBody = referencedImageFileNames(document.body).has(fileName)

        if (entry.action === 'add') {
          if (inBody) {
            await moveImageFileFromTrash(directory, entry.src)
          } else {
            await removeImageFileEverywhere(directory, entry.src)
            removedImageBytes.delete(entry.src)
          }

          continue
        }

        if (inBody) {
          await restoreFile(entry.src)
        } else {
          await removeImageFileEverywhere(directory, entry.src)
          removedImageBytes.delete(entry.src)
        }
      }

      await updateEntries(nextEntries)
    })

  const removeDocument = (documentId: number, body: string): Promise<void> =>
    run(async () => {
      const sources = new Set<string>()

      for (const fileName of referencedImageFileNames(body)) {
        sources.add(imageUrl(fileName))
      }

      const nextEntries = entries.filter((entry) => {
        if (entry.documentId !== documentId) {
          return true
        }

        sources.add(entry.src)
        return false
      })

      for (const src of sources) {
        await removeImageFileEverywhere(directory, src)
        removedImageBytes.delete(src)
      }

      if (nextEntries.length !== entries.length) {
        await updateEntries(nextEntries)
      }
    })

  return {
    save,
    copy,
    remove,
    restore,
    reconcile,
    recover,
    removeDocument,
  }
}
