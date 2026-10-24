import { randomUUID } from 'node:crypto'
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

export const imageScheme = 'wordapp-image'
export const imageHost = 'image'

const imageUrlPrefix = `${imageScheme}://${imageHost}/`
const imageFileNamePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/
const imageExtensionPattern = /\.(avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/i
const imageSourcePattern =
  /<img\b[^>]*\ssrc="wordapp-image:\/\/image\/(\d+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+)"/gi

const imageMimeExtensions = new Map([
  ['image/avif', 'avif'],
  ['image/bmp', 'bmp'],
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/pjpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/svg+xml', 'svg'],
  ['image/tiff', 'tiff'],
  ['image/vnd.microsoft.icon', 'ico'],
  ['image/webp', 'webp'],
  ['image/x-icon', 'ico'],
  ['image/x-ms-bmp', 'bmp'],
])

export type ImageSaveRequest = {
  documentId: number
  name: string
  type: string
  data: ArrayBuffer | ArrayBufferView
}

export type ImageSourceRequest = {
  documentId: number
  src: string
}

export type ImageCollectRequest = {
  documentId: number
  savedBody: string
  currentBody: string
}

export type SavedImage = {
  src: string
}

export type ImageReference = {
  documentId: number
  fileName: string
}

export type ImageDocumentBody = {
  id: number
  body: string
}

export function imageDirectoryPath(
  appRoot: string,
  userDataPath: string,
  isPackaged: boolean,
): string {
  return isPackaged
    ? path.join(userDataPath, 'images')
    : path.join(appRoot, 'dev-data', 'images')
}

export function imageDocumentDirectoryPath(
  directory: string,
  documentId: number,
): string {
  return path.join(directory, String(documentId))
}

export function imageTrashDirectoryPath(directory: string): string {
  return path.join(path.dirname(directory), 'images-trash')
}

export function imageTrashDocumentDirectoryPath(
  directory: string,
  documentId: number,
): string {
  return path.join(imageTrashDirectoryPath(directory), String(documentId))
}

export function legacyImageJournalPath(directory: string): string {
  return path.join(path.dirname(directory), 'image-journal.json')
}

export function imageUrl(documentId: number, fileName: string): string {
  return `${imageUrlPrefix}${documentId}/${fileName}`
}

export function imageReference(value: string): ImageReference | null {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (
    url.protocol !== `${imageScheme}:` ||
    url.hostname !== imageHost ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return null
  }

  const segments = url.pathname.split('/')

  if (segments.length !== 3 || segments[0] !== '') {
    return null
  }

  const [, rawDocumentId, fileName] = segments

  if (!/^[0-9]+$/.test(rawDocumentId)) {
    return null
  }

  const documentId = Number(rawDocumentId)

  if (!isImageDocumentId(documentId) || !imageFileNamePattern.test(fileName)) {
    return null
  }

  return { documentId, fileName: fileName.toLowerCase() }
}

export function referencedImageFileNames(
  html: string,
  documentId: number,
): Set<string> {
  const names = new Set<string>()

  for (const match of html.matchAll(imageSourcePattern)) {
    if (Number(match[1]) === documentId) {
      names.add(match[2].toLowerCase())
    }
  }

  return names
}

function normalizeImageExtension(extension: string): string {
  const lower = extension.toLowerCase()

  if (lower === 'jpe' || lower === 'jpeg') {
    return 'jpg'
  }

  if (lower === 'tif') {
    return 'tiff'
  }

  return lower
}

function imageExtensionFor(type: string, name: string): string | null {
  const lowerType = type.trim().toLowerCase()

  if (lowerType !== '' && !lowerType.startsWith('image/')) {
    return null
  }

  const byMime = imageMimeExtensions.get(lowerType)
  if (byMime !== undefined) {
    return byMime
  }

  const byName = imageExtensionPattern.exec(name)
  return byName === null ? null : normalizeImageExtension(byName[1])
}

function imageBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }

  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

function isImageDocumentId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function isImageSaveRequest(value: unknown): value is ImageSaveRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { documentId, name, type, data } = value as {
    documentId?: unknown
    name?: unknown
    type?: unknown
    data?: unknown
  }

  return (
    isImageDocumentId(documentId) &&
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 260 &&
    typeof type === 'string' &&
    type.length <= 120 &&
    (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) &&
    data.byteLength > 0
  )
}

export function isImageSourceRequest(
  value: unknown,
): value is ImageSourceRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { documentId, src } = value as {
    documentId?: unknown
    src?: unknown
  }

  return (
    isImageDocumentId(documentId) &&
    typeof src === 'string' &&
    imageReference(src) !== null
  )
}

export function isImageCollectRequest(
  value: unknown,
): value is ImageCollectRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { documentId, savedBody, currentBody } = value as {
    documentId?: unknown
    savedBody?: unknown
    currentBody?: unknown
  }

  return (
    isImageDocumentId(documentId) &&
    typeof savedBody === 'string' &&
    typeof currentBody === 'string'
  )
}

export function imageFileNameForSave(request: ImageSaveRequest): string | null {
  const extension = imageExtensionFor(request.type, request.name)
  return extension === null ? null : `${randomUUID()}.${extension}`
}

export function imageFileNameForCopy(fileName: string): string | null {
  if (!imageFileNamePattern.test(fileName)) {
    return null
  }

  return `${randomUUID()}.${path.extname(fileName).slice(1)}`
}

export async function writeImageFile(
  directory: string,
  fileName: string,
  data: ArrayBuffer | ArrayBufferView,
): Promise<void> {
  if (!imageFileNamePattern.test(fileName)) {
    throw new Error('The image file name is not valid.')
  }

  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, fileName), imageBytes(data), {
    flag: 'wx',
  })
}

export async function readImageFile(
  directory: string,
  fileName: string,
): Promise<ArrayBuffer | null> {
  if (!imageFileNamePattern.test(fileName)) {
    return null
  }

  try {
    const data = await readFile(path.join(directory, fileName))
    return new Uint8Array(data).buffer
  } catch {
    return null
  }
}

export async function removeImageFile(
  directory: string,
  fileName: string,
): Promise<void> {
  if (!imageFileNamePattern.test(fileName)) {
    return
  }

  await rm(path.join(directory, fileName), { force: true })
}

export async function listImageFileNames(directory: string): Promise<string[]> {
  try {
    const names = await readdir(directory)
    return names.filter((name) => imageFileNamePattern.test(name))
  } catch {
    return []
  }
}

export async function listImageDocumentIds(
  directory: string,
): Promise<number[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => Number(entry.name))
      .filter(isImageDocumentId)
  } catch {
    return []
  }
}

export async function moveImageFileToTrash(
  directory: string,
  documentId: number,
  fileName: string,
): Promise<boolean> {
  if (!imageFileNamePattern.test(fileName)) {
    return false
  }

  return moveImageFile(
    imageDocumentDirectoryPath(directory, documentId),
    imageTrashDocumentDirectoryPath(directory, documentId),
    fileName,
  )
}

export async function moveImageFileFromTrash(
  directory: string,
  documentId: number,
  fileName: string,
): Promise<boolean> {
  if (!imageFileNamePattern.test(fileName)) {
    return false
  }

  return moveImageFile(
    imageTrashDocumentDirectoryPath(directory, documentId),
    imageDocumentDirectoryPath(directory, documentId),
    fileName,
  )
}

export async function moveImageFileToDirectory(
  sourceDirectory: string,
  targetDirectory: string,
  fileName: string,
): Promise<boolean> {
  if (!imageFileNamePattern.test(fileName)) {
    return false
  }

  return moveImageFile(sourceDirectory, targetDirectory, fileName)
}

async function moveImageFile(
  sourceDirectory: string,
  targetDirectory: string,
  fileName: string,
): Promise<boolean> {
  const sourcePath = path.join(sourceDirectory, fileName)
  const targetPath = path.join(targetDirectory, fileName)

  try {
    await access(sourcePath)
  } catch {
    return false
  }

  await mkdir(targetDirectory, { recursive: true }).catch(() => {})
  await rm(targetPath, { force: true }).catch(() => {})

  try {
    await rename(sourcePath, targetPath)
    return true
  } catch {
    return false
  }
}

export async function removeImageDocument(
  directory: string,
  documentId: number,
): Promise<void> {
  await Promise.allSettled([
    rm(imageDocumentDirectoryPath(directory, documentId), {
      recursive: true,
      force: true,
    }),
    rm(imageTrashDocumentDirectoryPath(directory, documentId), {
      recursive: true,
      force: true,
    }),
  ])
}

export async function emptyImageTrash(directory: string): Promise<void> {
  await rm(imageTrashDirectoryPath(directory), {
    recursive: true,
    force: true,
  })
}

export async function clearImageStore(directory: string): Promise<void> {
  await Promise.all([
    rm(directory, { recursive: true, force: true }),
    rm(imageTrashDirectoryPath(directory), { recursive: true, force: true }),
    rm(legacyImageJournalPath(directory), { force: true }),
  ])
}
