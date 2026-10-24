import { net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { imageFileNameFromUrl, imageScheme } from './images.ts'

function notFound(): Response {
  return new Response(null, { status: 404 })
}

export function registerImageSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: imageScheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ])
}

export function handleImageProtocol(imageDirectory: string): void {
  protocol.handle(imageScheme, (request) => {
    const fileName = imageFileNameFromUrl(request.url)

    if (fileName === null) {
      return notFound()
    }

    const fileUrl = pathToFileURL(
      path.join(imageDirectory, fileName),
    ).toString()

    return net.fetch(fileUrl).catch(notFound)
  })
}
