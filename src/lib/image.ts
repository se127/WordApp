import { Extension, type Editor } from '@tiptap/core'
import { Image } from '@tiptap/extension-image'
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const imageMimePattern = /^image\//
const imageExtensionPattern = /\.(avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp)$/i
const storedImagePrefix = 'wordapp-image://image/'

export const DocumentImage = Image.configure({ allowBase64: false })

export function isImageFile(file: File): boolean {
  return (
    imageMimePattern.test(file.type) ||
    (file.type === '' && imageExtensionPattern.test(file.name))
  )
}

export function saveDocumentImage(
  file: File,
  documentId: number,
): Promise<string> {
  return file.arrayBuffer().then((data) => {
    return window.WordApp.images
      .save({
        documentId,
        name: file.name,
        type: file.type,
        data,
      })
      .then((saved) => saved.src)
  })
}

export function copyDocumentImage(
  src: string,
  documentId: number,
): Promise<string> {
  return window.WordApp.images.copy({ documentId, src }).then((saved) => {
    return saved.src
  })
}

export function collectDocumentImages(
  documentId: number,
  savedBody: string,
  currentBody: string,
): Promise<void> {
  return window.WordApp.images
    .collect({ documentId, savedBody, currentBody })
    .then(() => {})
}

export function imagePosition(
  view: EditorView,
  image: HTMLImageElement,
): number | null {
  if (!view.dom.contains(image)) {
    return null
  }

  const position = view.posAtDOM(image, 0)
  const resolved = view.state.doc.resolve(position)

  if (resolved.nodeAfter?.type.name === 'image') {
    return position
  }

  if (resolved.nodeBefore?.type.name === 'image') {
    return position - resolved.nodeBefore.nodeSize
  }

  return null
}

export function selectedImagePosition(view: EditorView): number | null {
  const { selection } = view.state

  if (!(selection instanceof NodeSelection)) {
    return null
  }

  return selection.node.type.name === 'image' ? selection.from : null
}

function imageSelectionPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations: (state) => {
        const decorations: Decoration[] = []

        state.doc.descendants((node, position) => {
          if (node.type.name !== 'image') {
            return true
          }

          decorations.push(
            Decoration.node(position, position + node.nodeSize, {
              tabindex: '0',
            }),
          )

          return false
        })

        return DecorationSet.create(state.doc, decorations)
      },
      handleDOMEvents: {
        focusin: (view, event) => {
          if (!(event.target instanceof HTMLImageElement)) {
            return false
          }

          const position = imagePosition(view, event.target)

          if (position === null || selectedImagePosition(view) === position) {
            return false
          }

          view.dispatch(
            view.state.tr.setSelection(
              NodeSelection.create(view.state.doc, position),
            ),
          )

          return false
        },
      },
    },
  })
}

function selectAdjacentImage(
  editor: Editor,
  direction: 'up' | 'down',
): boolean {
  const { selection } = editor.state

  if (!selection.empty) {
    return false
  }

  const { $from } = selection

  if (!$from.parent.isTextblock) {
    return false
  }

  if (
    (direction === 'down' &&
      $from.parentOffset !== $from.parent.content.size) ||
    (direction === 'up' && $from.parentOffset !== 0)
  ) {
    return false
  }

  const blockPosition =
    direction === 'down' ? $from.after($from.depth) : $from.before($from.depth)
  const resolved = editor.state.doc.resolve(blockPosition)
  const adjacent =
    direction === 'down' ? resolved.nodeAfter : resolved.nodeBefore

  if (adjacent?.type.name !== 'image') {
    return false
  }

  const position =
    direction === 'down' ? blockPosition : blockPosition - adjacent.nodeSize

  editor.commands.setNodeSelection(position)

  return true
}

function localImageSourcesInSlice(slice: Slice): string[] {
  const sources = new Set<string>()

  slice.content.descendants((node) => {
    if (
      node.type.name === 'image' &&
      typeof node.attrs.src === 'string' &&
      node.attrs.src.startsWith(storedImagePrefix)
    ) {
      sources.add(node.attrs.src)
    }

    return true
  })

  return [...sources]
}

function mapSliceImageSources(
  slice: Slice,
  replacements: ReadonlyMap<string, string>,
): Slice {
  const mapFragment = (fragment: Fragment): Fragment => {
    const nodes: ProseMirrorNode[] = []

    fragment.forEach((node) => {
      if (node.type.name === 'image') {
        const src = node.attrs.src
        const replacement =
          typeof src === 'string' ? replacements.get(src) : undefined

        nodes.push(
          replacement === undefined
            ? node
            : node.type.create(
                { ...node.attrs, src: replacement },
                node.content,
                node.marks,
              ),
        )
        return
      }

      nodes.push(
        node.content.size === 0 ? node : node.copy(mapFragment(node.content)),
      )
    })

    return Fragment.fromArray(nodes)
  }

  return new Slice(mapFragment(slice.content), slice.openStart, slice.openEnd)
}

function imagePastePlugin(editor: Editor, documentId: number): Plugin {
  return new Plugin({
    props: {
      handlePaste: (_view, event, slice) => {
        const sources = localImageSourcesInSlice(slice)

        if (sources.length === 0) {
          return false
        }

        event.preventDefault()

        Promise.all(
          sources.map((src) =>
            copyDocumentImage(src, documentId)
              .then((copy) => [src, copy] as const)
              .catch(() => null),
          ),
        )
          .then((pairs) => {
            if (editor.isDestroyed) {
              return
            }

            const replacements = new Map(
              pairs.filter(
                (pair): pair is readonly [string, string] => pair !== null,
              ),
            )

            const content =
              replacements.size === 0
                ? slice
                : mapSliceImageSources(slice, replacements)

            editor.view.dispatch(
              editor.state.tr.replaceSelection(content).scrollIntoView(),
            )
          })
          .catch(() => {})

        return true
      },
    },
  })
}

type DocumentImageSelectionOptions = {
  documentId: number
}

export const DocumentImageSelection =
  Extension.create<DocumentImageSelectionOptions>({
    name: 'documentImageSelection',

    addOptions() {
      return { documentId: 0 }
    },

    addProseMirrorPlugins() {
      return [
        imageSelectionPlugin(),
        imagePastePlugin(this.editor, this.options.documentId),
      ]
    },

    addKeyboardShortcuts() {
      return {
        ArrowDown: () => selectAdjacentImage(this.editor, 'down'),
        ArrowUp: () => selectAdjacentImage(this.editor, 'up'),
      }
    },
  })
