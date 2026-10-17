// The interactive prompt behind the dev script's --with-db-failure flag: it
// lists the database store's operations, moves the cursor with the arrow
// keys, toggles with space, and answers with enter. The answer — the checked
// operations, in list order — is printed to the terminal as a `db-failure:
// ...` line, and the dev script hands it to the main process through
// DEV_DB_FAILURE, where those operations fail for the run (see
// openDatabase's `failingOperations` in electron/database.ts).

import { emitKeypressEvents, type Key } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import type { DatabaseOperationName } from '../electron/database.ts'

// Thrown when the user interrupts the prompt (Ctrl+C) instead of answering,
// so the caller can exit the way an interrupted process would.
export class DbFailurePromptCanceledError extends Error {
  constructor() {
    super('The db failure prompt was canceled.')
  }
}

// The prompt reads keys from `input` and draws to `output`; the defaults are
// the process's own streams, while tests hand over collecting stand-ins.
// `setRawMode` is only needed on real terminals: raw mode makes each key
// arrive on its own, while a stand-in stream receives whole written chunks.
type PromptStreams = {
  input?: Readable & {
    isTTY?: boolean
    setRawMode?: (mode: boolean) => unknown
  }
  output?: Writable
}

// The two lines above the list. Both stay short enough not to wrap in a
// normal terminal, which keeps the redraw line arithmetic exact.
const titleLines = [
  'Select the database operations that should fail:',
  '(arrow up/down move, space select, enter submit)',
]

// Opens the prompt and resolves with the checked operations, in list order
// (an empty list when the user checks nothing).
export function promptDbFailures(
  operations: readonly DatabaseOperationName[],
  { input = process.stdin, output = process.stdout }: PromptStreams = {},
): Promise<DatabaseOperationName[]> {
  return new Promise((resolve, reject) => {
    let cursor = 0
    const checked = new Set<DatabaseOperationName>()
    // How many lines the prompt last drew, so a redraw can return to its
    // first line and an answer can replace the whole block.
    let drawnLines = 0
    let settled = false
    let rawModeEnabled = false

    const optionLine = (
      operation: DatabaseOperationName,
      index: number,
    ): string =>
      `${index === cursor ? '>' : ' '} ${
        checked.has(operation) ? '[x]' : '[ ]'
      } ${operation}`

    // Rewrites the prompt block: back up over the previous draw, then draw
    // every line fresh, leaving the cursor on the line below the block.
    const draw = (lines: string[]): void => {
      if (drawnLines > 0) {
        output.write(`\x1b[${drawnLines}A`)
      }
      output.write(lines.map((line) => `\r\x1b[2K${line}\r\n`).join(''))
      drawnLines = lines.length
    }

    const redraw = (): void => {
      draw([...titleLines, ...operations.map(optionLine)])
    }

    // Replaces the prompt block with the answer line — the picked
    // operations, or "none" — and leaves the cursor right below it for what
    // the caller prints next.
    const printAnswer = (answer: string): void => {
      if (drawnLines > 0) {
        output.write(`\x1b[${drawnLines}A`)
      }
      output.write(`\r\x1b[2K${answer}\r\n`)

      // Clear the lines the block used but the one-line answer no longer
      // needs, then put the cursor back under the answer.
      for (let line = 1; line < drawnLines; line += 1) {
        output.write('\r\x1b[2K\r\n')
      }
      if (drawnLines > 1) {
        output.write(`\x1b[${drawnLines - 1}A`)
      }

      drawnLines = 0
    }

    // Wipes the prompt block off the screen and leaves the cursor where its
    // first line was (used when the prompt is canceled).
    const erase = (): void => {
      if (drawnLines > 0) {
        output.write(`\x1b[${drawnLines}A`)
      }
      for (let line = 0; line < drawnLines; line += 1) {
        output.write('\r\x1b[2K\r\n')
      }
      if (drawnLines > 0) {
        output.write(`\x1b[${drawnLines}A`)
      }

      drawnLines = 0
    }

    const cleanup = (): void => {
      input.removeListener('keypress', onKeypress)
      input.removeListener('end', onEnd)
      input.removeListener('error', onInputError)

      if (rawModeEnabled) {
        input.setRawMode?.(false)
      }
    }

    const settle = (): void => {
      settled = true
      cleanup()
    }

    const answerWith = (): void => {
      const picked = operations.filter((operation) => checked.has(operation))
      printAnswer(
        `db-failure: ${picked.length > 0 ? picked.join(', ') : 'none'}`,
      )
      settle()
      resolve(picked)
    }

    const cancelWith = (error: Error): void => {
      erase()
      settle()
      reject(error)
    }

    const onKeypress = (_str: string | undefined, key: Key): void => {
      if (settled) {
        return
      }

      // In raw mode Ctrl+C arrives as a key instead of a SIGINT, so the
      // prompt turns it into its cancel path by hand.
      if (key.ctrl && key.name === 'c') {
        cancelWith(new DbFailurePromptCanceledError())
        return
      }

      switch (key.name) {
        case 'up': {
          cursor = (cursor + operations.length - 1) % operations.length
          redraw()
          break
        }
        case 'down': {
          cursor = (cursor + 1) % operations.length
          redraw()
          break
        }
        case 'space': {
          const operation = operations[cursor]
          if (operation !== undefined) {
            if (checked.has(operation)) {
              checked.delete(operation)
            } else {
              checked.add(operation)
            }
          }
          redraw()
          break
        }
        // Both names occur in the wild: '\r' (what Windows terminals send)
        // parses as "return", '\n' as "enter".
        case 'return':
        case 'enter': {
          answerWith()
          break
        }
        default: {
          // Every other key (including the stray ones terminals send for
          // modified keys) changes nothing.
          break
        }
      }
    }

    const onEnd = (): void => {
      if (settled) {
        return
      }
      cancelWith(
        new Error(
          'The db failure prompt reached the end of its input without an answer: stdin is not an interactive terminal.',
        ),
      )
    }

    const onInputError = (error: Error): void => {
      if (settled) {
        return
      }
      cancelWith(error)
    }

    if (typeof input.setRawMode === 'function' && input.isTTY) {
      input.setRawMode(true)
      rawModeEnabled = true
    }
    emitKeypressEvents(input)
    input.on('keypress', onKeypress)
    input.on('end', onEnd)
    input.on('error', onInputError)
    input.resume()

    redraw()
  })
}
