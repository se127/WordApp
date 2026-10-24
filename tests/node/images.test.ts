import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createImageStore } from '../../electron/image-store.ts'
import type { ImageJournalEntry } from '../../electron/image-store.ts'
import {
  clearImageStore,
  imageDirectoryPath,
  imageFileNameFromUrl,
  imageJournalPath,
  imageTrashDirectoryPath,
  imageUrl,
  isImageReconcileRequest,
  isImageRestoreRequest,
  isImageSaveRequest,
  isImageSourceRequest,
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

function restoreRequest(
  src: string,
  data: ArrayBuffer | Uint8Array = new Uint8Array([1, 2, 3]),
  id = documentId,
) {
  return { documentId: id, src, data }
}

function journalEntries(journalPath: string): ImageJournalEntry[] {
  if (!existsSync(journalPath)) {
    return []
  }

  return JSON.parse(readFileSync(journalPath, 'utf8')).entries
}

function imageBody(...sources: string[]): string {
  return sources.map((src) => `<img src="${src}">`).join('')
}

afterEach(() => {
  if (temporaryRoot !== undefined) {
    rmSync(temporaryRoot, { recursive: true, force: true })
    temporaryRoot = undefined
  }

  vi.restoreAllMocks()
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
    expect(imageJournalPath('C:/wordapp/dev-data/images')).toBe(
      path.join('C:/wordapp/dev-data/image-journal.json'),
    )
  })
})

describe('imageFileNameFromUrl', () => {
  it('reads the file name from a generated image url', () => {
    expect(imageFileNameFromUrl(imageUrl(firstImage))).toBe(firstImage)
  })

  it('rejects urls that do not belong to the image scheme', () => {
    expect(imageFileNameFromUrl(`https://image/${firstImage}`)).toBeNull()
    expect(
      imageFileNameFromUrl(`wordapp-image://other/${firstImage}`),
    ).toBeNull()
    expect(
      imageFileNameFromUrl(`wordapp-image://image/${firstImage}?x=1`),
    ).toBeNull()
    expect(
      imageFileNameFromUrl(`wordapp-image://image/${firstImage}#x`),
    ).toBeNull()
  })

  it('rejects paths that could escape the image directory', () => {
    expect(
      imageFileNameFromUrl('wordapp-image://image/../secret.png'),
    ).toBeNull()
    expect(
      imageFileNameFromUrl('wordapp-image://image/%2e%2e%2fsecret.png'),
    ).toBeNull()
    expect(
      imageFileNameFromUrl('wordapp-image://image/not-a-uuid.png'),
    ).toBeNull()
    expect(imageFileNameFromUrl('wordapp-image://image/')).toBeNull()
  })
})

describe('referencedImageFileNames', () => {
  it('collects every image url in a document body', () => {
    const body = `<p>متن</p><img src="${imageUrl(firstImage)}" alt="a"><img src="${imageUrl(secondImage)}" alt="b">`

    expect(referencedImageFileNames(body)).toEqual(
      new Set([firstImage, secondImage]),
    )
  })

  it('lowercases file names and ignores other schemes', () => {
    const upperCase = firstImage.toUpperCase()
    const body = `<img src="wordapp-image://image/${upperCase}"><img src="https://example.com/${firstImage}">`

    expect(referencedImageFileNames(body)).toEqual(new Set([firstImage]))
  })

  it('finds the image when another attribute comes first', () => {
    const body = `<img alt="a" src="${imageUrl(firstImage)}">`

    expect(referencedImageFileNames(body)).toEqual(new Set([firstImage]))
  })

  it('returns no names for a body without images', () => {
    expect(referencedImageFileNames('<p>متن</p>')).toEqual(new Set())
  })

  it('ignores an image url that only appears in text', () => {
    expect(referencedImageFileNames(`<p>${imageUrl(firstImage)}</p>`)).toEqual(
      new Set(),
    )
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
      isImageSourceRequest({ documentId, src: imageUrl(firstImage) }),
    ).toBe(true)
    expect(
      isImageSourceRequest({ documentId: 0, src: imageUrl(firstImage) }),
    ).toBe(false)
    expect(
      isImageSourceRequest({
        documentId,
        src: 'https://example.com/photo.png',
      }),
    ).toBe(false)
  })

  it('accepts stored bytes for a stored image url', () => {
    expect(isImageRestoreRequest(restoreRequest(imageUrl(firstImage)))).toBe(
      true,
    )
    expect(
      isImageRestoreRequest({
        documentId,
        src: imageUrl(firstImage),
        data: new Uint8Array(),
      }),
    ).toBe(false)
    expect(
      isImageRestoreRequest({ documentId, src: imageUrl(firstImage) }),
    ).toBe(false)
  })

  it('accepts reconciliation requests with both bodies', () => {
    const request = {
      documentId,
      savedBody: '<p>saved</p>',
      currentBody: '<p>current</p>',
    }

    expect(isImageReconcileRequest(request)).toBe(true)
    expect(isImageReconcileRequest({ ...request, savedBody: 1 })).toBe(false)
    expect(isImageReconcileRequest({ ...request, currentBody: null })).toBe(
      false,
    )
    expect(isImageReconcileRequest({ ...request, documentId: -1 })).toBe(false)
  })
})

describe('image store save', () => {
  it('stores an image and records it as pending until the body is saved', async () => {
    const { directory, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    const fileName = imageFileNameFromUrl(saved.src)

    expect(fileName).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    )
    expect(saved.src).toBe(imageUrl(fileName as string))
    expect(readFileSync(path.join(directory, fileName as string))).toEqual(
      Buffer.from([1, 2, 3]),
    )
    expect(journalEntries(journal)).toEqual([
      { action: 'add', documentId, src: saved.src },
    ])
  })

  it('uses the mime type and normalizes the extension', async () => {
    const { directory, store } = await openStore()
    const saved = await store.save(
      imageRequest({ name: 'photo.jpeg', type: 'image/jpeg' }),
    )
    const fileName = imageFileNameFromUrl(saved.src) as string

    expect(fileName.endsWith('.jpg')).toBe(true)
    expect(existsSync(path.join(directory, fileName))).toBe(true)
  })

  it('rejects files that are not images without writing anything', async () => {
    const { directory, journal, store } = await openStore()

    await expect(
      store.save(imageRequest({ name: 'notes.txt', type: 'text/plain' })),
    ).rejects.toThrow('The picked file is not a supported image.')
    expect(existsSync(directory)).toBe(false)
    expect(existsSync(journal)).toBe(false)
  })
})

describe('image store copy', () => {
  it('copies a stored image to a new file and records the copy as pending', async () => {
    const { directory, journal, store } = await openStore()
    const original = await store.save(imageRequest())
    const copied = await store.copy({
      documentId,
      src: original.src,
    })
    const copiedName = imageFileNameFromUrl(copied.src) as string

    expect(copiedName).not.toBe(imageFileNameFromUrl(original.src))
    expect(readFileSync(path.join(directory, copiedName))).toEqual(
      Buffer.from([1, 2, 3]),
    )
    expect(journalEntries(journal)).toHaveLength(2)
    expect(journalEntries(journal)[1]).toEqual({
      action: 'add',
      documentId,
      src: copied.src,
    })
  })

  it('copies an image that is waiting in the trash', async () => {
    const { store } = await openStore()
    const original = await store.save(imageRequest())
    await store.remove({ documentId, src: original.src })

    const copied = await store.copy({ documentId, src: original.src })

    expect(copied.src).not.toBe(original.src)
  })

  it('rejects a source that is not a stored image or is missing', async () => {
    const { store } = await openStore()

    await expect(
      store.copy({ documentId, src: 'https://example.com/photo.png' }),
    ).rejects.toThrow('The image source is not a stored image.')
    await expect(
      store.copy({ documentId, src: imageUrl(firstImage) }),
    ).rejects.toThrow('The stored image is missing.')
  })
})

describe('image store remove', () => {
  it('moves the file to the trash, returns its bytes, and journals the removal', async () => {
    const { directory, trash, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    const fileName = imageFileNameFromUrl(saved.src) as string

    const data = await store.remove({ documentId, src: saved.src })

    expect(new Uint8Array(data as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3]),
    )
    expect(existsSync(path.join(directory, fileName))).toBe(false)
    expect(readFileSync(path.join(trash, fileName))).toEqual(
      Buffer.from([1, 2, 3]),
    )
    expect(journalEntries(journal)).toEqual([
      { action: 'add', documentId, src: saved.src },
      { action: 'remove', documentId, src: saved.src },
    ])
  })

  it('returns the bytes again when the file is already in the trash', async () => {
    const { store } = await openStore()
    const saved = await store.save(imageRequest())

    await store.remove({ documentId, src: saved.src })
    const data = await store.remove({ documentId, src: saved.src })

    expect(new Uint8Array(data as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3]),
    )
  })

  it('answers an invalid or missing source with no bytes', async () => {
    const { journal, store } = await openStore()

    await expect(
      store.remove({ documentId, src: 'https://example.com/photo.png' }),
    ).resolves.toBeNull()
    await expect(
      store.remove({ documentId, src: imageUrl(firstImage) }),
    ).resolves.toBeNull()
    expect(journalEntries(journal)).toEqual([])
  })
})

describe('image store restore', () => {
  it('moves a removed image back and clears its removal journal entry', async () => {
    const { directory, trash, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    const fileName = imageFileNameFromUrl(saved.src) as string
    await store.remove({ documentId, src: saved.src })

    await store.restore(restoreRequest(saved.src))

    expect(readFileSync(path.join(directory, fileName))).toEqual(
      Buffer.from([1, 2, 3]),
    )
    expect(existsSync(path.join(trash, fileName))).toBe(false)
    expect(journalEntries(journal)).toEqual([
      { action: 'add', documentId, src: saved.src },
    ])
  })

  it('writes the supplied bytes back when the trash file is gone', async () => {
    const { directory, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    const fileName = imageFileNameFromUrl(saved.src) as string
    await store.remove({ documentId, src: saved.src })
    rmSync(path.join(imageTrashDirectoryPath(directory), fileName))
    const reopened = await createImageStore(directory)

    await reopened.restore(
      restoreRequest(saved.src, new Uint8Array([4, 5, 6, 7])),
    )

    expect(readFileSync(path.join(directory, fileName))).toEqual(
      Buffer.from([4, 5, 6, 7]),
    )
    expect(journalEntries(journal)).toEqual([
      { action: 'add', documentId, src: saved.src },
    ])
  })

  it('rejects a source that is not a stored image', async () => {
    const { store } = await openStore()

    await expect(
      store.restore(restoreRequest('https://example.com/photo.png')),
    ).rejects.toThrow('The image source is not a stored image.')
  })
})

describe('image store reconcile', () => {
  it('clears a pending add once the saved body contains it', async () => {
    const { directory, journal, store } = await openStore()
    const saved = await store.save(imageRequest())

    await store.reconcile({
      documentId,
      savedBody: imageBody(saved.src),
      currentBody: imageBody(saved.src),
    })

    expect(journalEntries(journal)).toEqual([])
    expect(
      existsSync(
        path.join(directory, imageFileNameFromUrl(saved.src) as string),
      ),
    ).toBe(true)
  })

  it('keeps a pending add while only the editor body contains it', async () => {
    const { journal, store } = await openStore()
    const saved = await store.save(imageRequest())

    await store.reconcile({
      documentId,
      savedBody: '',
      currentBody: imageBody(saved.src),
    })

    expect(journalEntries(journal)).toEqual([
      { action: 'add', documentId, src: saved.src },
    ])
  })

  it('deletes a pending add that left both bodies', async () => {
    const { directory, journal, store } = await openStore()
    const saved = await store.save(imageRequest())

    await store.reconcile({
      documentId,
      savedBody: '',
      currentBody: '',
    })

    expect(journalEntries(journal)).toEqual([])
    expect(
      existsSync(
        path.join(directory, imageFileNameFromUrl(saved.src) as string),
      ),
    ).toBe(false)
  })

  it('keeps a removal in the trash while the saved body still contains it', async () => {
    const { trash, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    await store.remove({ documentId, src: saved.src })

    await store.reconcile({
      documentId,
      savedBody: imageBody(saved.src),
      currentBody: '',
    })

    expect(
      existsSync(path.join(trash, imageFileNameFromUrl(saved.src) as string)),
    ).toBe(true)
    expect(journalEntries(journal)).toContainEqual({
      action: 'remove',
      documentId,
      src: saved.src,
    })
  })

  it('restores an undone image and tracks it as pending for the next save', async () => {
    const { directory, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    const fileName = imageFileNameFromUrl(saved.src) as string
    await store.remove({ documentId, src: saved.src })

    await store.reconcile({
      documentId,
      savedBody: '',
      currentBody: imageBody(saved.src),
    })

    expect(existsSync(path.join(directory, fileName))).toBe(true)
    expect(journalEntries(journal)).toEqual([
      { action: 'add', documentId, src: saved.src },
    ])
  })

  it('deletes the trash once the removal is saved', async () => {
    const { trash, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    const fileName = imageFileNameFromUrl(saved.src) as string
    await store.remove({ documentId, src: saved.src })

    await store.reconcile({
      documentId,
      savedBody: '',
      currentBody: '',
    })

    expect(existsSync(path.join(trash, fileName))).toBe(false)
    expect(journalEntries(journal)).toEqual([])
  })

  it('leaves entries of other documents alone', async () => {
    const { journal, store } = await openStore()
    const saved = await store.save(imageRequest())

    await store.reconcile({
      documentId: documentId + 1,
      savedBody: '',
      currentBody: '',
    })

    expect(journalEntries(journal)).toEqual([
      { action: 'add', documentId, src: saved.src },
    ])
  })
})

describe('image store recovery', () => {
  function documentWith(...sources: string[]) {
    return { body: imageBody(...sources) }
  }

  it('keeps an added image that reached the saved body', async () => {
    const { directory, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    const getDocument = vi.fn(async () => documentWith(saved.src))

    await store.recover(getDocument)

    expect(getDocument).toHaveBeenCalledExactlyOnceWith(documentId)
    expect(journalEntries(journal)).toEqual([])
    expect(
      existsSync(
        path.join(directory, imageFileNameFromUrl(saved.src) as string),
      ),
    ).toBe(true)
  })

  it('deletes an added image that never reached the saved body', async () => {
    const { directory, journal, store } = await openStore()
    const saved = await store.save(imageRequest())

    await store.recover(async () => documentWith())

    expect(journalEntries(journal)).toEqual([])
    expect(
      existsSync(
        path.join(directory, imageFileNameFromUrl(saved.src) as string),
      ),
    ).toBe(false)
  })

  it('restores a removed image that is still in the saved body', async () => {
    const { directory, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    const fileName = imageFileNameFromUrl(saved.src) as string
    await store.remove({ documentId, src: saved.src })

    await store.recover(async () => documentWith(saved.src))

    expect(readFileSync(path.join(directory, fileName))).toEqual(
      Buffer.from([1, 2, 3]),
    )
    expect(journalEntries(journal)).toEqual([])
  })

  it('deletes the trash of a removal that reached the saved body', async () => {
    const { trash, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    const fileName = imageFileNameFromUrl(saved.src) as string
    await store.remove({ documentId, src: saved.src })

    await store.recover(async () => documentWith())

    expect(existsSync(path.join(trash, fileName))).toBe(false)
    expect(journalEntries(journal)).toEqual([])
  })

  it('deletes the files of a document that no longer exists', async () => {
    const { directory, trash, journal, store } = await openStore()
    const added = await store.save(imageRequest())
    const removed = await store.save(imageRequest({ name: 'second.png' }))
    const removedName = imageFileNameFromUrl(removed.src) as string
    await store.remove({ documentId, src: removed.src })

    await store.recover(async () => undefined)

    expect(journalEntries(journal)).toEqual([])
    expect(
      existsSync(
        path.join(directory, imageFileNameFromUrl(added.src) as string),
      ),
    ).toBe(false)
    expect(existsSync(path.join(trash, removedName))).toBe(false)
  })

  it('keeps entries whose document read failed', async () => {
    const { journal, store } = await openStore()
    const saved = await store.save(imageRequest())

    await store.recover(async () => {
      throw new Error('database unavailable')
    })

    expect(journalEntries(journal)).toEqual([
      { action: 'add', documentId, src: saved.src },
    ])
  })
})

describe('image store document deletion', () => {
  it('removes saved and pending images of the deleted document only', async () => {
    const { directory, trash, journal, store } = await openStore()
    const saved = await store.save(imageRequest())
    const pending = await store.save(imageRequest({ name: 'pending.png' }))
    const removed = await store.save(imageRequest({ name: 'removed.png' }))
    const removedName = imageFileNameFromUrl(removed.src) as string
    await store.remove({ documentId, src: removed.src })
    const other = await store.save(imageRequest({ documentId: documentId + 1 }))
    const otherName = imageFileNameFromUrl(other.src) as string

    await store.removeDocument(documentId, imageBody(saved.src))

    expect(
      existsSync(
        path.join(directory, imageFileNameFromUrl(saved.src) as string),
      ),
    ).toBe(false)
    expect(
      existsSync(
        path.join(directory, imageFileNameFromUrl(pending.src) as string),
      ),
    ).toBe(false)
    expect(existsSync(path.join(trash, removedName))).toBe(false)
    expect(existsSync(path.join(directory, otherName))).toBe(true)
    expect(journalEntries(journal)).toEqual([
      { action: 'add', documentId: documentId + 1, src: other.src },
    ])
  })

  it('removes the files of the saved body even without journal entries', async () => {
    const { directory, store } = await openStore()

    await writeImageFile(directory, secondImage, new Uint8Array([1]))
    await store.removeDocument(documentId, imageBody(imageUrl(secondImage)))

    expect(existsSync(path.join(directory, secondImage))).toBe(false)
  })
})

describe('clearImageStore', () => {
  it('removes the images, the trash, and the journal', async () => {
    const { directory, trash, journal } = storePaths()
    mkdirSync(directory, { recursive: true })
    mkdirSync(trash, { recursive: true })
    writeFileSync(path.join(directory, firstImage), 'image')
    writeFileSync(path.join(trash, secondImage), 'image')
    writeFileSync(journal, JSON.stringify({ entries: [] }))

    await clearImageStore(directory)

    expect(existsSync(directory)).toBe(false)
    expect(existsSync(trash)).toBe(false)
    expect(existsSync(journal)).toBe(false)
  })
})

describe('image journal file', () => {
  it('survives reopening the store', async () => {
    const { directory, journal } = storePaths()
    const firstStore = await createImageStore(directory)
    const saved = await firstStore.save(imageRequest())
    const secondStore = await createImageStore(directory)

    await secondStore.reconcile({
      documentId,
      savedBody: imageBody(saved.src),
      currentBody: imageBody(saved.src),
    })

    expect(journalEntries(journal)).toEqual([])
  })

  it('moves an unreadable journal aside and starts clean', async () => {
    const { directory, journal } = storePaths()
    writeFileSync(journal, '{not json')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(createImageStore(directory)).resolves.toBeDefined()

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('The image journal could not be read:'),
    )
    expect(
      readdirSync(path.dirname(journal)).some((name) =>
        name.startsWith('image-journal.json.corrupt-'),
      ),
    ).toBe(true)
  })
})

describe('writeImageFile', () => {
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
})
