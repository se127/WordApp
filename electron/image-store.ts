import { rm } from 'node:fs/promises'
import {
  emptyImageTrash,
  imageDocumentDirectoryPath,
  imageFileNameForCopy,
  imageFileNameForSave,
  imageReference,
  imageTrashDocumentDirectoryPath,
  imageUrl,
  legacyImageJournalPath,
  listImageDocumentIds,
  listImageFileNames,
  moveImageFileFromTrash,
  moveImageFileToDirectory,
  moveImageFileToTrash,
  readImageFile,
  referencedImageFileNames,
  removeImageDocument,
  removeImageFile,
  writeImageFile,
} from './images.ts'
import type {
  ImageCollectRequest,
  ImageDocumentBody,
  ImageSaveRequest,
  ImageSourceRequest,
  SavedImage,
} from './images.ts'

export type ImageStore = {
  save: (request: ImageSaveRequest) => Promise<SavedImage>
  copy: (request: ImageSourceRequest) => Promise<SavedImage>
  collect: (request: ImageCollectRequest) => Promise<void>
  sweep: (documents: readonly ImageDocumentBody[]) => Promise<void>
  removeDocument: (documentId: number) => Promise<void>
}

export async function createImageStore(directory: string): Promise<ImageStore> {
  let operationQueue: Promise<unknown> = Promise.resolve()

  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationQueue.then(operation, operation)
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const save = (request: ImageSaveRequest): Promise<SavedImage> =>
    run(async () => {
      const fileName = imageFileNameForSave(request)

      if (fileName === null) {
        throw new Error('The picked file is not a supported image.')
      }

      await writeImageFile(
        imageDocumentDirectoryPath(directory, request.documentId),
        fileName,
        request.data,
      )

      return { src: imageUrl(request.documentId, fileName) }
    })

  const copy = (request: ImageSourceRequest): Promise<SavedImage> =>
    run(async () => {
      const reference = imageReference(request.src)

      if (reference === null) {
        throw new Error('The image source is not a stored image.')
      }

      const data =
        (await readImageFile(
          imageDocumentDirectoryPath(directory, reference.documentId),
          reference.fileName,
        )) ??
        (await readImageFile(
          imageTrashDocumentDirectoryPath(directory, reference.documentId),
          reference.fileName,
        ))

      if (data === null) {
        throw new Error('The stored image is missing.')
      }

      const fileName = imageFileNameForCopy(reference.fileName)

      if (fileName === null) {
        throw new Error('The image source is not a stored image.')
      }

      await writeImageFile(
        imageDocumentDirectoryPath(directory, request.documentId),
        fileName,
        data,
      )

      return { src: imageUrl(request.documentId, fileName) }
    })

  const collect = (request: ImageCollectRequest): Promise<void> =>
    run(async () => {
      const referenced = new Set([
        ...referencedImageFileNames(request.savedBody, request.documentId),
        ...referencedImageFileNames(request.currentBody, request.documentId),
      ])
      const documentDirectory = imageDocumentDirectoryPath(
        directory,
        request.documentId,
      )
      const present = new Set(await listImageFileNames(documentDirectory))

      for (const fileName of referenced) {
        if (!present.has(fileName)) {
          await moveImageFileFromTrash(directory, request.documentId, fileName)
        }
      }

      for (const fileName of present) {
        if (!referenced.has(fileName)) {
          await moveImageFileToTrash(directory, request.documentId, fileName)
        }
      }
    })

  const sweep = (documents: readonly ImageDocumentBody[]): Promise<void> =>
    run(async () => {
      const owners = new Map<string, number>()
      const referencedByDocument = new Map<number, Set<string>>()

      for (const { id, body } of documents) {
        const names = referencedImageFileNames(body, id)
        referencedByDocument.set(id, names)

        for (const fileName of names) {
          owners.set(fileName, id)
        }
      }

      for (const fileName of await listImageFileNames(directory)) {
        const owner = owners.get(fileName)

        if (owner === undefined) {
          await removeImageFile(directory, fileName)
          continue
        }

        await moveImageFileToDirectory(
          directory,
          imageDocumentDirectoryPath(directory, owner),
          fileName,
        )
      }

      for (const documentId of await listImageDocumentIds(directory)) {
        const documentDirectory = imageDocumentDirectoryPath(
          directory,
          documentId,
        )
        const referenced = referencedByDocument.get(documentId)

        if (referenced === undefined) {
          await rm(documentDirectory, { recursive: true, force: true })
          continue
        }

        for (const fileName of await listImageFileNames(documentDirectory)) {
          if (!referenced.has(fileName)) {
            await moveImageFileToTrash(directory, documentId, fileName)
          }
        }
      }

      for (const { id } of documents) {
        for (const fileName of referencedByDocument.get(id) ?? []) {
          await moveImageFileFromTrash(directory, id, fileName)
        }
      }

      await emptyImageTrash(directory)
      await rm(legacyImageJournalPath(directory), { force: true })
    })

  const removeDocument = (documentId: number): Promise<void> =>
    run(async () => {
      await removeImageDocument(directory, documentId)
    })

  return { save, copy, collect, sweep, removeDocument }
}
