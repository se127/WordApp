import { PassThrough, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { DatabaseOperationName } from '../../electron/database.ts'
import {
  DbFailurePromptCanceledError,
  promptDbFailures,
} from '../../scripts/db-failure-prompt.ts'

const operations: DatabaseOperationName[] = [
  'createDocument',
  'getDocument',
  'countDocuments',
  'listDocuments',
  'listMoreDocuments',
  'deleteDocument',
  'deleteDocuments',
  'saveDocument',
]

const firstFrame = [
  '> [ ] create document',
  '  [ ] get document',
  '  [ ] count documents',
  '  [ ] list documents',
  '  [ ] list more documents',
  '  [ ] delete document',
  '  [ ] delete documents',
  '  [ ] save document',
]

type PromptInput = PassThrough & {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => unknown
}

function collectingOutput(): { stream: Writable; text: () => string } {
  let text = ''
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += String(chunk)
      callback()
    },
  })

  return { stream, text: () => text }
}

function startPrompt(setupInput?: (input: PromptInput) => void) {
  const input: PromptInput = new PassThrough()
  setupInput?.(input)
  const output = collectingOutput()

  return {
    input,
    text: output.text,
    answer: promptDbFailures(operations, {
      input,
      output: output.stream,
    }),
  }
}

async function flushStreams(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

async function type(input: PromptInput, sequence: string): Promise<void> {
  input.write(sequence)
  await flushStreams()
}

function lastOptions(text: string): string[] {
  // eslint-disable-next-line no-control-regex
  const blocks = text.split(/\x1b\[\d+A/)
  const lastBlock = blocks[blocks.length - 1] ?? ''

  return lastBlock
    .split('\r\n')
    .map((line) => line.replace('\r\x1b[2K', ''))
    .filter((line) => line.startsWith('>') || line.startsWith('  ['))
}

describe('promptDbFailures', () => {
  it('draws the title, the hint, and every operation with the cursor on the first', () => {
    const { text } = startPrompt()

    const drawn = text()
    expect(drawn).toContain('Select the database operations that should fail:')
    expect(drawn).toContain('(arrow up/down move, space select, enter submit)')
    expect(lastOptions(drawn)).toEqual(firstFrame)
  })

  it('moves with the arrow keys and wraps around at both ends', async () => {
    const { input, text } = startPrompt()

    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual([
      '  [ ] create document',
      '> [ ] get document',
      '  [ ] count documents',
      '  [ ] list documents',
      '  [ ] list more documents',
      '  [ ] delete document',
      '  [ ] delete documents',
      '  [ ] save document',
    ])

    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual([
      '  [ ] create document',
      '  [ ] get document',
      '> [ ] count documents',
      '  [ ] list documents',
      '  [ ] list more documents',
      '  [ ] delete document',
      '  [ ] delete documents',
      '  [ ] save document',
    ])

    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual([
      '  [ ] create document',
      '  [ ] get document',
      '  [ ] count documents',
      '> [ ] list documents',
      '  [ ] list more documents',
      '  [ ] delete document',
      '  [ ] delete documents',
      '  [ ] save document',
    ])

    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual([
      '  [ ] create document',
      '  [ ] get document',
      '  [ ] count documents',
      '  [ ] list documents',
      '> [ ] list more documents',
      '  [ ] delete document',
      '  [ ] delete documents',
      '  [ ] save document',
    ])

    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual([
      '  [ ] create document',
      '  [ ] get document',
      '  [ ] count documents',
      '  [ ] list documents',
      '  [ ] list more documents',
      '> [ ] delete document',
      '  [ ] delete documents',
      '  [ ] save document',
    ])

    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual([
      '  [ ] create document',
      '  [ ] get document',
      '  [ ] count documents',
      '  [ ] list documents',
      '  [ ] list more documents',
      '  [ ] delete document',
      '> [ ] delete documents',
      '  [ ] save document',
    ])

    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual([
      '  [ ] create document',
      '  [ ] get document',
      '  [ ] count documents',
      '  [ ] list documents',
      '  [ ] list more documents',
      '  [ ] delete document',
      '  [ ] delete documents',
      '> [ ] save document',
    ])

    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual(firstFrame)

    await type(input, '\x1b[A')
    expect(lastOptions(text())).toEqual([
      '  [ ] create document',
      '  [ ] get document',
      '  [ ] count documents',
      '  [ ] list documents',
      '  [ ] list more documents',
      '  [ ] delete document',
      '  [ ] delete documents',
      '> [ ] save document',
    ])
  })

  it('toggles the operation under the cursor with space', async () => {
    const { input, text } = startPrompt()

    await type(input, ' ')
    expect(lastOptions(text())).toEqual([
      '> [x] create document',
      '  [ ] get document',
      '  [ ] count documents',
      '  [ ] list documents',
      '  [ ] list more documents',
      '  [ ] delete document',
      '  [ ] delete documents',
      '  [ ] save document',
    ])

    await type(input, ' ')
    expect(lastOptions(text())).toEqual(firstFrame)
  })

  it('answers with the checked operations in list order on enter', async () => {
    const { input, text, answer } = startPrompt()

    await type(input, '\x1b[B')
    await type(input, '\x1b[B')
    await type(input, ' ')
    await type(input, '\x1b[A')
    await type(input, ' ')
    await type(input, '\x1b[A')
    await type(input, ' ')
    await type(input, '\r')

    expect(await answer).toEqual([
      'createDocument',
      'getDocument',
      'countDocuments',
    ])
    expect(lastOptions(text())).toEqual([])
  })

  it('answers with no operations and wipes the prompt when nothing is checked', async () => {
    const { input, text, answer } = startPrompt()

    await type(input, '\n')

    expect(await answer).toEqual([])
    expect(lastOptions(text())).toEqual([])
  })

  it('ignores keys that are not arrows, space, or enter', async () => {
    const { input, text, answer } = startPrompt()

    for (const sequence of ['x', '\t', '\x1b[C', '\x1b[D', '\x1b[Z']) {
      await type(input, sequence)
    }

    expect(lastOptions(text())).toEqual(firstFrame)

    await type(input, '\r')
    expect(await answer).toEqual([])
  })

  it('turns raw mode on for a terminal input and releases the streams on the answer', async () => {
    const rawModes: boolean[] = []
    const { input, text, answer } = startPrompt((stream) => {
      stream.isTTY = true
      stream.setRawMode = (mode) => {
        rawModes.push(mode)
      }
    })

    expect(rawModes).toEqual([true])

    await type(input, '\r')
    expect(await answer).toEqual([])
    expect(rawModes).toEqual([true, false])

    expect(input.listenerCount('keypress')).toBe(0)
    expect(input.listenerCount('end')).toBe(0)
    expect(input.listenerCount('error')).toBe(0)

    const afterAnswer = text()
    await type(input, ' \x1b[A')
    expect(text()).toBe(afterAnswer)
  })

  it('rejects with the canceled error, wipes the prompt, and restores raw mode on ctrl+c', async () => {
    const rawModes: boolean[] = []
    const { input, text, answer } = startPrompt((stream) => {
      stream.isTTY = true
      stream.setRawMode = (mode) => {
        rawModes.push(mode)
      }
    })
    const caught = answer.catch((error: unknown) => error)

    await type(input, '\x03')

    expect(await caught).toBeInstanceOf(DbFailurePromptCanceledError)
    expect(lastOptions(text())).toEqual([])
    expect(rawModes).toEqual([true, false])
  })

  it('rejects when its input ends without an answer', async () => {
    const { input, answer } = startPrompt()
    const caught = answer.catch((error: unknown) => error)

    input.end()
    await flushStreams()

    const error = await caught
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/end of its input/)
  })

  it('rejects when its input stream errors, after wiping the prompt', async () => {
    const { input, text, answer } = startPrompt()
    const caught = answer.catch((error: unknown) => error)

    input.emit('error', new Error('stdin exploded'))
    await flushStreams()

    expect(await caught).toEqual(new Error('stdin exploded'))
    expect(lastOptions(text())).toEqual([])
  })
})
