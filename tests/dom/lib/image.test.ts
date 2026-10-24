import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const firstImage =
  'wordapp-image://image/7/11111111-1111-4111-8111-111111111111.png'
const copiedImage =
  'wordapp-image://image/7/33333333-3333-4333-8333-333333333333.png'

let images: {
  save: ReturnType<typeof vi.fn>
  copy: ReturnType<typeof vi.fn>
  collect: ReturnType<typeof vi.fn>
}

async function importImageModule() {
  vi.resetModules()
  return import('@/lib/image')
}

beforeEach(() => {
  images = {
    save: vi.fn(async () => ({ src: copiedImage })),
    copy: vi.fn(async () => ({ src: copiedImage })),
    collect: vi.fn(async () => {}),
  }
  window.WordApp = { images } as unknown as Window['WordApp']
})

afterEach(() => {
  Reflect.deleteProperty(window, 'WordApp')
  vi.restoreAllMocks()
})

describe('isImageFile', () => {
  it('accepts image mime types and image extensions', async () => {
    const { isImageFile } = await importImageModule()

    expect(
      isImageFile(new File(['x'], 'photo.png', { type: 'image/png' })),
    ).toBe(true)
    expect(isImageFile(new File(['x'], 'photo.png', { type: '' }))).toBe(true)
    expect(
      isImageFile(new File(['x'], 'notes.txt', { type: 'text/plain' })),
    ).toBe(false)
  })
})

describe('saveDocumentImage', () => {
  it('stores the picked image for the document', async () => {
    const { saveDocumentImage } = await importImageModule()

    await expect(
      saveDocumentImage(
        new File(['image-bytes'], 'photo.png', { type: 'image/png' }),
        7,
      ),
    ).resolves.toBe(copiedImage)
    expect(images.save).toHaveBeenCalledExactlyOnceWith({
      documentId: 7,
      name: 'photo.png',
      type: 'image/png',
      data: expect.any(ArrayBuffer),
    })
  })
})

describe('copyDocumentImage', () => {
  it('copies a stored image for the document', async () => {
    const { copyDocumentImage } = await importImageModule()

    await expect(copyDocumentImage(firstImage, 7)).resolves.toBe(copiedImage)
    expect(images.copy).toHaveBeenCalledExactlyOnceWith({
      documentId: 7,
      src: firstImage,
    })
  })

  it('reports a missing stored image without saving it again', async () => {
    const { copyDocumentImage } = await importImageModule()
    images.copy.mockRejectedValueOnce(new Error('The stored image is missing.'))

    await expect(copyDocumentImage(firstImage, 7)).rejects.toThrow(
      'The stored image is missing.',
    )
    expect(images.save).not.toHaveBeenCalled()
  })
})

describe('collectDocumentImages', () => {
  it('collects the images the saved and current bodies reference', async () => {
    const { collectDocumentImages } = await importImageModule()

    await collectDocumentImages(7, '<p>saved</p>', '<p>current</p>')

    expect(images.collect).toHaveBeenCalledExactlyOnceWith({
      documentId: 7,
      savedBody: '<p>saved</p>',
      currentBody: '<p>current</p>',
    })
  })
})
