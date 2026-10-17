import { PassThrough, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { DatabaseOperationName } from '../../electron/database.ts'
import {
  DbFailurePromptCanceledError,
  promptDbFailures,
} from '../../scripts/db-failure-prompt.ts'

// The operations the dev script lists; their order matters because the answer
// is printed — and reaches the main process — in list order.
const operations: DatabaseOperationName[] = [
  'createDocument',
  'getDocument',
  'countDocuments',
  'deleteDocument',
  'saveDocument',
]

const firstFrame = [
  '> [ ] createDocument',
  '  [ ] getDocument',
  '  [ ] countDocuments',
  '  [ ] deleteDocument',
  '  [ ] saveDocument',
]

type PromptInput = PassThrough & {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => unknown
}

// The prompt draws to a stream a test can read afterwards.
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

// Starts the prompt over stand-in streams: the input is a PassThrough the
// test types raw terminal sequences into, the output collects every write.
// `setupInput` adjusts the input before the prompt sees it (a raw-mode stub,
// say).
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

// PassThrough writes travel over the stream machinery's scheduled ticks;
// drain them before a test looks at what the prompt drew.
async function flushStreams(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

// Types a raw terminal sequence into the prompt and lets it process.
async function type(input: PromptInput, sequence: string): Promise<void> {
  input.write(sequence)
  await flushStreams()
}

// The option lines of the prompt's most recent draw, cursor marker and all.
// The prompt backs up over its previous block before redrawing — the block's
// height varies with the number of operations — so only what follows the last
// cursor-up escape is current.
function lastOptions(text: string): string[] {
  // The cursor-up escape is the prompt's own output; matching it is the point.
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
      '  [ ] createDocument',
      '> [ ] getDocument',
      '  [ ] countDocuments',
      '  [ ] deleteDocument',
      '  [ ] saveDocument',
    ])

    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual([
      '  [ ] createDocument',
      '  [ ] getDocument',
      '> [ ] countDocuments',
      '  [ ] deleteDocument',
      '  [ ] saveDocument',
    ])

    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual([
      '  [ ] createDocument',
      '  [ ] getDocument',
      '  [ ] countDocuments',
      '> [ ] deleteDocument',
      '  [ ] saveDocument',
    ])

    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual([
      '  [ ] createDocument',
      '  [ ] getDocument',
      '  [ ] countDocuments',
      '  [ ] deleteDocument',
      '> [ ] saveDocument',
    ])

    // One more down from the last wraps back to the first.
    await type(input, '\x1b[B')
    expect(lastOptions(text())).toEqual(firstFrame)

    // And one up from the first wraps past the top to the last.
    await type(input, '\x1b[A')
    expect(lastOptions(text())).toEqual([
      '  [ ] createDocument',
      '  [ ] getDocument',
      '  [ ] countDocuments',
      '  [ ] deleteDocument',
      '> [ ] saveDocument',
    ])
  })

  it('toggles the operation under the cursor with space', async () => {
    const { input, text } = startPrompt()

    await type(input, ' ')
    expect(lastOptions(text())).toEqual([
      '> [x] createDocument',
      '  [ ] getDocument',
      '  [ ] countDocuments',
      '  [ ] deleteDocument',
      '  [ ] saveDocument',
    ])

    // Space again takes the check back off.
    await type(input, ' ')
    expect(lastOptions(text())).toEqual(firstFrame)
  })

  it('answers with the checked operations in list order on enter', async () => {
    const { input, text, answer } = startPrompt()

    // Check countDocuments, then getDocument, then createDocument: the answer
    // must come back in list order, not in checking order.
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
    expect(text()).toContain(
      'db-failure: createDocument, getDocument, countDocuments',
    )
    // The answer replaced the block instead of joining it: exactly one answer
    // line, and no option lines left behind.
    expect(text().match(/db-failure:/g)).toHaveLength(1)
    expect(lastOptions(text())).toEqual([])
  })

  it('answers "none" when nothing is checked', async () => {
    const { input, text, answer } = startPrompt()

    // '\n' parses as "enter" where '\r' parses as "return"; both submit.
    await type(input, '\n')

    expect(await answer).toEqual([])
    expect(text()).toContain('db-failure: none')
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

    // The prompt let go of the input: its listeners are gone, and a key
    // typed after the answer draws nothing new.
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
    // The block is wiped, not answered: the terminal is left clean, and the
    // input back in its cooked mode.
    expect(text()).not.toContain('db-failure:')
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
    expect(text()).not.toContain('db-failure:')
  })
})
