import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createImageStore } from '../../electron/image-store.ts'
import {
  clearImageStore,
  imageDocumentDirectoryPath,
  imageDirectoryPath,
  imageReference,
  imageTrashDocumentDirectoryPath,
  imageTrashDirectoryPath,
  imageUrl,
  isImageCollectRequest,
  isImageSaveRequest,
  isImageSourceRequest,
  legacyImageJournalPath,
  listImageFileNames,
  readImageFile,
  referencedImageFileNames,
  writeImageFile,
} from '../../electron/images.ts'

const firstImage = '11111111-1111-4111-8111-111111111111.png'
const secondImage = '22222222-2222-4222-8222-222222222222.jpg'
const documentId = 7

let temporaryRoot: string | undefined

function temporaryRootPath(): string {
  temporaryRoot = mkdtempSync(path.join(tmpdir(), 'wordapp-images-test-'))
  return temporaryRoot
}

function storePaths() {
  const root = temporaryRootPath()

  return {
    root,
    directory: path.join(root, 'images'),
    trash: path.join(root, 'images-trash'),
    journal: path.join(root, 'image-journal.json'),
  }
}

async function openStore() {
  const paths = storePaths()
  const store = await createImageStore(paths.directory)
  return { ...paths, store }
}

function imageRequest(
  overrides: Partial<{
    documentId: number
    name: string
    type: string
    data: Uint8Array
  }> = {},
) {
  return {
    documentId,
    name: 'photo.png',
    type: 'image/png',
    data: new Uint8Array([1, 2, 3]),
    ...overrides,
  }
}

function imageBody(...sources: string[]): string {
  return sources.map((src) => `<img src="${src}">`).join('')
}

function fileNameOf(src: string): string {
  const reference = imageReference(src)

  if (reference === null) {
    throw new Error(`Not a stored image: ${src}`)
  }

  return reference.fileName
}

afterEach(() => {
  if (temporaryRoot !== undefined) {
    rmSync(temporaryRoot, { recursive: true, force: true })
    temporaryRoot = undefined
  }
})

describe('image paths', () => {
  it('stores dev images with the dev data and packaged images in userData', () => {
    expect(imageDirectoryPath('C:/wordapp', 'C:/userdata', false)).toBe(
      path.join('C:/wordapp', 'dev-data', 'images'),
    )
    expect(imageDirectoryPath('C:/wordapp', 'C:/userdata', true)).toBe(
      path.join('C:/userdata', 'images'),
    )
    expect(imageTrashDirectoryPath('C:/wordapp/dev-data/images')).toBe(
      path.join('C:/wordapp/dev-data/images-trash'),
    )
    expect(legacyImageJournalPath('C:/wordapp/dev-data/images')).toBe(
      path.join('C:/wordapp/dev-data/image-journal.json'),
    )
  })

  it('puts every document in its own images folder', () => {
    expect(imageDocumentDirectoryPath('C:/images', 7)).toBe(
      path.join('C:/images', '7'),
    )
    expect(imageTrashDocumentDirectoryPath('C:/images', 7)).toBe(
      path.join('C:/images-trash', '7'),
    )
  })
})

describe('imageReference', () => {
  it('reads the document and file name from a generated image url', () => {
    expect(imageReference(imageUrl(documentId, firstImage))).toEqual({
      documentId,
      fileName: firstImage,
    })
  })

  it('rejects urls that do not belong to the image scheme', () => {
    expect(imageReference(`https://image/7/${firstImage}`)).toBeNull()
    expect(imageReference(`wordapp-image://other/7/${firstImage}`)).toBeNull()
    expect(
      imageReference(`wordapp-image://image/7/${firstImage}?x=1`),
    ).toBeNull()
    expect(imageReference(`wordapp-image://image/7/${firstImage}#x`)).toBeNull()
  })

  it('rejects paths that could escape the image directory', () => {
    expect(imageReference('wordapp-image://image/../secret.png')).toBeNull()
    expect(
      imageReference('wordapp-image://image/%2e%2e%2fsecret.png'),
    ).toBeNull()
    expect(imageReference(`wordapp-image://image/7/${firstImage}/x`)).toBeNull()
    expect(imageReference('wordapp-image://image/7/not-a-uuid.png')).toBeNull()
    expect(imageReference(`wordapp-image://image/0/${firstImage}`)).toBeNull()
    expect(imageReference(`wordapp-image://image/-1/${firstImage}`)).toBeNull()
    expect(imageReference(`wordapp-image://image/1.5/${firstImage}`)).toBeNull()
    expect(
      imageReference(imageUrl(Number.MAX_SAFE_INTEGER + 1, firstImage)),
    ).toBeNull()
    expect(imageReference('wordapp-image://image/')).toBeNull()
  })
})

describe('referencedImageFileNames', () => {
  it('collects every image url of the document', () => {
    const body = `<p>متن</p><img src="${imageUrl(documentId, firstImage)}" alt="a"><img src="${imageUrl(documentId, secondImage)}" alt="b">`

    expect(referencedImageFileNames(body, documentId)).toEqual(
      new Set([firstImage, secondImage]),
    )
  })

  it('ignores the images of another document', () => {
    const body = `<img src="${imageUrl(documentId + 1, firstImage)}">`

    expect(referencedImageFileNames(body, documentId)).toEqual(new Set())
  })

  it('lowercases file names and ignores other schemes', () => {
    const upperCase = firstImage.toUpperCase()
    const body = `<img src="wordapp-image://image/${documentId}/${upperCase}"><img src="https://example.com/${firstImage}">`

    expect(referencedImageFileNames(body, documentId)).toEqual(
      new Set([firstImage]),
    )
  })

  it('finds the image when another attribute comes first', () => {
    const body = `<img alt="a" src="${imageUrl(documentId, firstImage)}">`

    expect(referencedImageFileNames(body, documentId)).toEqual(
      new Set([firstImage]),
    )
  })

  it('returns no names for a body without images', () => {
    expect(referencedImageFileNames('<p>متن</p>', documentId)).toEqual(
      new Set(),
    )
  })

  it('ignores an image url that only appears in text', () => {
    expect(
      referencedImageFileNames(
        `<p>${imageUrl(documentId, firstImage)}</p>`,
        documentId,
      ),
    ).toEqual(new Set())
  })
})

describe('image request validation', () => {
  it('accepts an uploaded image payload', () => {
    expect(isImageSaveRequest(imageRequest())).toBe(true)
  })

  it('rejects uploads without a document, bytes, or the right shape', () => {
    expect(isImageSaveRequest(null)).toBe(false)
    expect(isImageSaveRequest(imageRequest({ documentId: Number.NaN }))).toBe(
      false,
    )
    expect(isImageSaveRequest(imageRequest({ documentId: 0 }))).toBe(false)
    expect(isImageSaveRequest(imageRequest({ data: new Uint8Array() }))).toBe(
      false,
    )
    expect(isImageSaveRequest(imageRequest({ name: '' }))).toBe(false)
    expect(isImageSaveRequest(imageRequest({ type: 1 as never }))).toBe(false)
  })

  it('accepts stored image sources with a document', () => {
    expect(
      isImageSourceRequest({
        documentId,
        src: imageUrl(documentId, firstImage),
      }),
    ).toBe(true)
    expect(
      isImageSourceRequest({
        documentId: 0,
        src: imageUrl(documentId, firstImage),
      }),
    ).toBe(false)
    expect(
      isImageSourceRequest({
        documentId,
        src: 'https://example.com/photo.png',
      }),
    ).toBe(false)
  })

  it('accepts collection requests with both bodies', () => {
    const request = {
      documentId,
      savedBody: '<p>saved</p>',
      currentBody: '<p>current</p>',
    }

    expect(isImageCollectRequest(request)).toBe(true)
    expect(isImageCollectRequest({ ...request, savedBody: 1 })).toBe(false)
    expect(isImageCollectRequest({ ...request, currentBody: null })).toBe(false)
    expect(isImageCollectRequest({ ...request, documentId: -1 })).toBe(false)
  })
})

describe('image store save', () => {
  it('stores an image in its document folder without a journal', async () => {
    const { directory, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    const fileName = fileNameOf(saved.src)

    expect(imageReference(saved.src)?.documentId).toBe(documentId)
    expect(fileName).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    )
    expect(saved.src).toBe(imageUrl(documentId, fileName))
    expect(
      readFileSync(
        path.join(imageDocumentDirectoryPath(directory, documentId), fileName),
      ),
    ).toEqual(Buffer.from([1, 2, 3]))
    expect(existsSync(journal)).toBe(false)
  })

  it('uses the mime type and normalizes the extension', async () => {
    const { directory, store } = await openStore()
    const saved = await store.save(
      imageRequest({ name: 'photo.jpeg', type: 'image/jpeg' }),
    )
    const fileName = fileNameOf(saved.src)

    expect(fileName.endsWith('.jpg')).toBe(true)
    expect(
      existsSync(
        path.join(imageDocumentDirectoryPath(directory, documentId), fileName),
      ),
    ).toBe(true)
  })

  it('rejects files that are not images without writing anything', async () => {
    const { directory, store } = await openStore()

    await expect(
      store.save(imageRequest({ name: 'notes.txt', type: 'text/plain' })),
    ).rejects.toThrow('The picked file is not a supported image.')
    expect(existsSync(directory)).toBe(false)
  })
})

describe('image store copy', () => {
  it('copies a stored image into the same document folder', async () => {
    const { directory, store } = await openStore()
    const original = await store.save(imageRequest())
    const copied = await store.copy({ documentId, src: original.src })
    const copiedName = fileNameOf(copied.src)

    expect(copiedName).not.toBe(fileNameOf(original.src))
    expect(imageReference(copied.src)?.documentId).toBe(documentId)
    expect(
      readFileSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId),
          copiedName,
        ),
      ),
    ).toEqual(Buffer.from([1, 2, 3]))
  })

  it('copies an image of another document into the requested document', async () => {
    const { directory, store } = await openStore()
    const original = await store.save(imageRequest())

    const copied = await store.copy({
      documentId: documentId + 1,
      src: original.src,
    })

    expect(imageReference(copied.src)?.documentId).toBe(documentId + 1)
    expect(
      existsSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId + 1),
          fileNameOf(copied.src),
        ),
      ),
    ).toBe(true)
  })

  it('copies an image that is waiting in the trash', async () => {
    const { store } = await openStore()
    const original = await store.save(imageRequest())
    await store.collect({ documentId, savedBody: '', currentBody: '' })

    const copied = await store.copy({ documentId, src: original.src })

    expect(copied.src).not.toBe(original.src)
  })

  it('rejects a source that is not a stored image or is missing', async () => {
    const { store } = await openStore()

    await expect(
      store.copy({ documentId, src: 'https://example.com/photo.png' }),
    ).rejects.toThrow('The image source is not a stored image.')
    await expect(
      store.copy({ documentId, src: imageUrl(documentId, firstImage) }),
    ).rejects.toThrow('The stored image is missing.')
  })
})

describe('image store collect', () => {
  it('keeps an image the saved body references', async () => {
    const { directory, store } = await openStore()
    const saved = await store.save(imageRequest())

    await store.collect({
      documentId,
      savedBody: imageBody(saved.src),
      currentBody: imageBody(saved.src),
    })

    expect(
      existsSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId),
          fileNameOf(saved.src),
        ),
      ),
    ).toBe(true)
  })

  it('keeps an image only the editor body references', async () => {
    const { directory, store } = await openStore()
    const saved = await store.save(imageRequest())

    await store.collect({
      documentId,
      savedBody: '',
      currentBody: imageBody(saved.src),
    })

    expect(
      existsSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId),
          fileNameOf(saved.src),
        ),
      ),
    ).toBe(true)
  })

  it('moves an image both bodies left to the trash', async () => {
    const { directory, store } = await openStore()
    const saved = await store.save(imageRequest())

    await store.collect({ documentId, savedBody: '', currentBody: '' })

    expect(
      existsSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId),
          fileNameOf(saved.src),
        ),
      ),
    ).toBe(false)
    expect(
      readFileSync(
        path.join(
          imageTrashDocumentDirectoryPath(directory, documentId),
          fileNameOf(saved.src),
        ),
      ),
    ).toEqual(Buffer.from([1, 2, 3]))
  })

  it('restores an undone image from the trash', async () => {
    const { directory, store } = await openStore()
    const saved = await store.save(imageRequest())
    await store.collect({ documentId, savedBody: '', currentBody: '' })

    await store.collect({
      documentId,
      savedBody: imageBody(saved.src),
      currentBody: imageBody(saved.src),
    })

    expect(
      existsSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId),
          fileNameOf(saved.src),
        ),
      ),
    ).toBe(true)
  })

  it('leaves the images of other documents alone', async () => {
    const { directory, store } = await openStore()
    const saved = await store.save(imageRequest({ documentId: documentId + 1 }))

    await store.collect({ documentId, savedBody: '', currentBody: '' })

    expect(
      existsSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId + 1),
          fileNameOf(saved.src),
        ),
      ),
    ).toBe(true)
  })
})

describe('image store sweep', () => {
  it('moves legacy flat files into the folder of the document that references them', async () => {
    const { directory, store } = await openStore()
    await writeImageFile(directory, firstImage, new Uint8Array([1, 2, 3]))

    await store.sweep([
      { id: documentId, body: imageBody(imageUrl(documentId, firstImage)) },
    ])

    expect(existsSync(path.join(directory, firstImage))).toBe(false)
    expect(
      readFileSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId),
          firstImage,
        ),
      ),
    ).toEqual(Buffer.from([1, 2, 3]))
  })

  it('deletes a legacy flat file that no document references', async () => {
    const { directory, store } = await openStore()
    await writeImageFile(directory, firstImage, new Uint8Array([1]))
    await writeImageFile(directory, secondImage, new Uint8Array([2]))

    await store.sweep([
      { id: documentId, body: imageBody(imageUrl(documentId, firstImage)) },
    ])

    expect(existsSync(path.join(directory, secondImage))).toBe(false)
  })

  it('removes the legacy journal file', async () => {
    const { journal, store } = await openStore()
    writeFileSync(journal, '{}')

    await store.sweep([])

    expect(existsSync(journal)).toBe(false)
  })

  it('restores a referenced image that is waiting in the trash', async () => {
    const { directory, store } = await openStore()
    const saved = await store.save(imageRequest())
    await store.collect({ documentId, savedBody: '', currentBody: '' })

    await store.sweep([{ id: documentId, body: imageBody(saved.src) }])

    expect(
      existsSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId),
          fileNameOf(saved.src),
        ),
      ),
    ).toBe(true)
    expect(existsSync(imageTrashDirectoryPath(directory))).toBe(false)
  })

  it('deletes an unreferenced file and empties the trash', async () => {
    const { directory, trash, store } = await openStore()
    const saved = await store.save(imageRequest())

    await store.sweep([{ id: documentId, body: '' }])

    expect(
      existsSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId),
          fileNameOf(saved.src),
        ),
      ),
    ).toBe(false)
    expect(existsSync(trash)).toBe(false)
  })

  it('deletes the folders of a document that no longer exists', async () => {
    const { directory, store } = await openStore()
    await store.save(imageRequest())
    const other = await store.save(imageRequest({ documentId: documentId + 1 }))

    await store.sweep([{ id: documentId + 1, body: imageBody(other.src) }])

    expect(existsSync(imageDocumentDirectoryPath(directory, documentId))).toBe(
      false,
    )
    expect(
      existsSync(imageDocumentDirectoryPath(directory, documentId + 1)),
    ).toBe(true)
  })

  it('keeps a body-less document folder empty but present after a clean sweep', async () => {
    const { directory, store } = await openStore()
    await writeImageFile(
      imageDocumentDirectoryPath(directory, documentId),
      firstImage,
      new Uint8Array([1]),
    )

    await store.sweep([{ id: documentId, body: '<p>متن</p>' }])

    expect(
      existsSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId),
          firstImage,
        ),
      ),
    ).toBe(false)
  })
})

describe('image store document deletion', () => {
  it('removes the files and the trash of the deleted document only', async () => {
    const { directory, store } = await openStore()
    const kept = await store.save(imageRequest())
    const removed = await store.save(imageRequest({ name: 'second.png' }))
    await store.collect({
      documentId,
      savedBody: imageBody(kept.src),
      currentBody: imageBody(kept.src),
    })
    const other = await store.save(imageRequest({ documentId: documentId + 1 }))

    expect(
      existsSync(
        path.join(
          imageTrashDocumentDirectoryPath(directory, documentId),
          fileNameOf(removed.src),
        ),
      ),
    ).toBe(true)

    await store.removeDocument(documentId)

    expect(existsSync(imageDocumentDirectoryPath(directory, documentId))).toBe(
      false,
    )
    expect(
      existsSync(imageTrashDocumentDirectoryPath(directory, documentId)),
    ).toBe(false)
    expect(
      existsSync(
        path.join(
          imageDocumentDirectoryPath(directory, documentId + 1),
          fileNameOf(other.src),
        ),
      ),
    ).toBe(true)
  })
})

describe('clearImageStore', () => {
  it('removes the images, the trash, and the legacy journal', async () => {
    const { directory, trash, journal } = storePaths()
    mkdirSync(imageDocumentDirectoryPath(directory, documentId), {
      recursive: true,
    })
    mkdirSync(path.join(trash, String(documentId)), { recursive: true })
    writeFileSync(
      path.join(imageDocumentDirectoryPath(directory, documentId), firstImage),
      'image',
    )
    writeFileSync(path.join(trash, String(documentId), secondImage), 'image')
    writeFileSync(journal, JSON.stringify({ entries: [] }))

    await clearImageStore(directory)

    expect(existsSync(directory)).toBe(false)
    expect(existsSync(trash)).toBe(false)
    expect(existsSync(journal)).toBe(false)
  })
})

describe('image files', () => {
  it('lists only stored image file names of a folder', async () => {
    const { directory } = await openStore()
    const documentDirectory = imageDocumentDirectoryPath(directory, documentId)
    await writeImageFile(documentDirectory, firstImage, new Uint8Array([1]))
    writeFileSync(path.join(documentDirectory, 'notes.txt'), 'text')

    expect(await listImageFileNames(documentDirectory)).toEqual([firstImage])
  })

  it('reads a stored file and answers a missing one with null', async () => {
    const { directory, store } = await openStore()
    const saved = await store.save(imageRequest())
    const documentDirectory = imageDocumentDirectoryPath(directory, documentId)

    const data = await readImageFile(documentDirectory, fileNameOf(saved.src))

    expect(new Uint8Array(data as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3]),
    )
    expect(await readImageFile(documentDirectory, secondImage)).toBeNull()
    expect(await readImageFile(documentDirectory, '../secret.png')).toBeNull()
  })

  it('writes a validated image file name', async () => {
    const { directory } = storePaths()

    await writeImageFile(directory, firstImage, new Uint8Array([4, 5]))

    expect(readFileSync(path.join(directory, firstImage))).toEqual(
      Buffer.from([4, 5]),
    )
  })

  it('rejects a file name that could escape the image directory', async () => {
    const { directory } = storePaths()

    await expect(
      writeImageFile(directory, '../secret.png', new Uint8Array([1])),
    ).rejects.toThrow('The image file name is not valid.')
  })

  it('does not create the images folder before the first save', async () => {
    const { directory } = await openStore()

    expect(existsSync(directory)).toBe(false)
  })
})
