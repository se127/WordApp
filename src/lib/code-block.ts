import { CodeBlockView } from '@/components/code-block-view'
import bash from '@shikijs/langs/bash'
import css from '@shikijs/langs/css'
import html from '@shikijs/langs/html'
import javascript from '@shikijs/langs/javascript'
import json from '@shikijs/langs/json'
import markdown from '@shikijs/langs/markdown'
import php from '@shikijs/langs/php'
import python from '@shikijs/langs/python'
import sql from '@shikijs/langs/sql'
import typescript from '@shikijs/langs/typescript'
import githubDark from '@shikijs/themes/github-dark-default'
import githubLight from '@shikijs/themes/github-light-default'
import { mergeAttributes, Extension } from '@tiptap/core'
import { CodeBlock } from '@tiptap/extension-code-block'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

export const codeBlockLanguages = [
  'plaintext',
  'html',
  'css',
  'javascript',
  'typescript',
  'php',
  'python',
  'json',
  'bash',
  'sql',
  'markdown',
] as const

export type CodeBlockLanguage = (typeof codeBlockLanguages)[number]

const languageAliases: Record<string, CodeBlockLanguage> = {
  plaintext: 'plaintext',
  plain: 'plaintext',
  text: 'plaintext',
  txt: 'plaintext',
  html: 'html',
  htm: 'html',
  xml: 'html',
  css: 'css',
  javascript: 'javascript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  php: 'php',
  python: 'python',
  py: 'python',
  json: 'json',
  jsonc: 'json',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  shellsession: 'bash',
  zsh: 'bash',
  sql: 'sql',
  markdown: 'markdown',
  md: 'markdown',
}

const shikiThemes = { light: githubLight, dark: githubDark }
const shikiPluginKey = new PluginKey<DecorationSet>('codeBlockShiki')
const italic = 1
const bold = 2
const underline = 4
const lightCodeBlockBackground = 'var(--color-gray-100)'

let highlighter: ReturnType<typeof createHighlighterCoreSync> | null = null
let codeBlockThemeStyle = ''

export function resolveCodeBlockLanguage(
  language: unknown,
): CodeBlockLanguage | null {
  if (typeof language !== 'string') {
    return null
  }

  const normalized = language.trim().toLowerCase()

  if (normalized === '') {
    return null
  }

  return languageAliases[normalized] ?? null
}

function getHighlighter(): ReturnType<typeof createHighlighterCoreSync> {
  if (highlighter !== null) {
    return highlighter
  }

  highlighter = createHighlighterCoreSync({
    themes: [githubLight, githubDark],
    langs: [
      bash,
      css,
      html,
      javascript,
      json,
      markdown,
      php,
      python,
      sql,
      typescript,
    ],
    engine: createJavaScriptRegexEngine(),
  })

  const light = highlighter.getTheme('github-light-default')
  const dark = highlighter.getTheme('github-dark-default')

  codeBlockThemeStyle = [
    `--wordapp-shiki-light-bg:${lightCodeBlockBackground}`,
    `--wordapp-shiki-dark-bg:${dark.bg}`,
    `--wordapp-shiki-light-fg:${light.fg}`,
    `--wordapp-shiki-dark-fg:${dark.fg}`,
  ].join(';')

  return highlighter
}

function tokenStyle(
  variants: Record<string, { color?: string; fontStyle?: number }>,
): string | null {
  const light = variants.light
  const dark = variants.dark

  if (light === undefined || dark === undefined) {
    return null
  }

  const declarations: string[] = []

  if (light.color !== undefined) {
    declarations.push(`--wordapp-shiki-light:${light.color}`)
  }

  if (dark.color !== undefined) {
    declarations.push(`--wordapp-shiki-dark:${dark.color}`)
  }

  const fontStyle = light.fontStyle ?? dark.fontStyle

  if (fontStyle !== undefined) {
    if ((fontStyle & italic) !== 0) {
      declarations.push('font-style:italic')
    }

    if ((fontStyle & bold) !== 0) {
      declarations.push('font-weight:bold')
    }

    if ((fontStyle & underline) !== 0) {
      declarations.push('text-decoration:underline')
    }
  }

  return declarations.length === 0 ? null : declarations.join(';')
}

function createCodeBlockDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') {
      return
    }

    const language = resolveCodeBlockLanguage(node.attrs.language)
    const instance = getHighlighter()
    const from = pos + 1

    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: 'shiki',
        style: codeBlockThemeStyle,
      }),
    )

    if (language === null || language === 'plaintext') {
      return false
    }

    const code = node.textContent

    if (code.length === 0) {
      return false
    }

    const lines = instance.codeToTokensWithThemes(code, {
      lang: language,
      themes: shikiThemes,
    })

    for (const line of lines) {
      for (const token of line) {
        if (token.content.length === 0) {
          continue
        }

        const style = tokenStyle(token.variants)

        if (style === null) {
          continue
        }

        const start = from + token.offset

        decorations.push(
          Decoration.inline(start, start + token.content.length, { style }),
        )
      }
    }

    return false
  })

  return DecorationSet.create(doc, decorations)
}

function createShikiCodeBlockPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: shikiPluginKey,
    state: {
      init: (_config, state) => createCodeBlockDecorations(state.doc),
      apply: (transaction, decorations, _oldState, newState) => {
        if (!transaction.docChanged) {
          return decorations
        }

        return createCodeBlockDecorations(newState.doc)
      },
    },
    props: {
      decorations(state) {
        return shikiPluginKey.getState(state)
      },
    },
  })
}

export const ShikiCodeBlock = CodeBlock.extend({
  renderHTML({ node, HTMLAttributes }) {
    const languageClassPrefix = this.options.languageClassPrefix ?? 'language-'

    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        dir: 'ltr',
      }),
      [
        'code',
        {
          class: node.attrs.language
            ? `${languageClassPrefix}${node.attrs.language}`
            : null,
        },
        0,
      ],
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView, {
      className: 'code-block-frame',
      contentDOMElementTag: 'code',
      attrs: { dir: 'ltr' },
    })
  },
  addProseMirrorPlugins() {
    return [createShikiCodeBlockPlugin()]
  },
})

export const CodeBlockSelectAll = Extension.create({
  name: 'codeBlockSelectAll',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Mod-a': ({ editor }) => {
        const { selection } = editor.state

        if (selection instanceof NodeSelection) {
          if (selection.node.type.name !== 'codeBlock') {
            return false
          }

          return editor.commands.setTextSelection({
            from: selection.from + 1,
            to: selection.to - 1,
          })
        }

        const { $from } = selection

        if ($from.parent.type.name !== 'codeBlock') {
          return false
        }

        return editor.commands.setTextSelection({
          from: $from.start(),
          to: $from.end(),
        })
      },
    }
  },
})
