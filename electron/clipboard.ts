export type ClipboardContent = {
  text: string
  html: string
  image: Uint8Array | null
}

export type ClipboardWritePayload = {
  text: string
  html: string
}

export function isClipboardWritePayload(
  value: unknown,
): value is ClipboardWritePayload {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const payload = value as Record<string, unknown>

  return typeof payload.text === 'string' && typeof payload.html === 'string'
}
