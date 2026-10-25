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

describe('imageBubbleMenuAnchor', () => {
  it('anchors the menu inside the top-right corner of the image', async () => {
    const { imageBubbleMenuAnchor } = await importImageModule()
    const image = document.createElement('img')
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 200, 300, 150),
    )

    expect(imageBubbleMenuAnchor(image).getBoundingClientRect()).toEqual({
      x: 392,
      y: 208,
      width: 0,
      height: 0,
      top: 208,
      right: 392,
      bottom: 208,
      left: 392,
    })
  })

  it('re-reads the image rect every time the menu position updates', async () => {
    const { imageBubbleMenuAnchor } = await importImageModule()
    const image = document.createElement('img')
    const rect = vi.spyOn(image, 'getBoundingClientRect')
    rect.mockReturnValueOnce(new DOMRect(100, 200, 300, 150))
    rect.mockReturnValueOnce(new DOMRect(100, 120, 300, 150))
    const anchor = imageBubbleMenuAnchor(image)

    expect(anchor.getBoundingClientRect().top).toBe(208)
    expect(anchor.getBoundingClientRect().top).toBe(128)
  })
})

describe('editorScrollTarget', () => {
  it('uses the scroll viewport that wraps the editor', async () => {
    const { editorScrollTarget } = await importImageModule()
    const viewport = document.createElement('div')
    viewport.setAttribute('data-slot', 'scroll-area-viewport')
    const editor = document.createElement('div')
    viewport.append(editor)

    expect(editorScrollTarget(editor)).toBe(viewport)
  })

  it('falls back to the window when the editor has no scroll viewport', async () => {
    const { editorScrollTarget } = await importImageModule()

    expect(editorScrollTarget(document.createElement('div'))).toBe(window)
  })
})
