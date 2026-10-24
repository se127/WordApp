import { net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  imageDocumentDirectoryPath,
  imageReference,
  imageScheme,
} from './images.ts'

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
    const reference = imageReference(request.url)

    if (reference === null) {
      return notFound()
    }

    const fileUrl = pathToFileURL(
      path.join(
        imageDocumentDirectoryPath(imageDirectory, reference.documentId),
        reference.fileName,
      ),
    ).toString()

    return net.fetch(fileUrl).catch(() => {
      const legacyFileUrl = pathToFileURL(
        path.join(imageDirectory, reference.fileName),
      ).toString()

      return net.fetch(legacyFileUrl).catch(notFound)
    })
  })
}
