import { emitKeypressEvents, type Key } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import type { DatabaseOperationName } from '../electron/database.ts'
import { formatOperationLabel } from './dev-flags.ts'

export class DbFailurePromptCanceledError extends Error {
  constructor() {
    super('The db failure prompt was canceled.')
  }
}

type PromptStreams = {
  input?: Readable & {
    isTTY?: boolean
    setRawMode?: (mode: boolean) => unknown
  }
  output?: Writable
}

const titleLines = [
  'Select the database operations that should fail:',
  '(arrow up/down move, space select, enter submit)',
]

export function promptDbFailures(
  operations: readonly DatabaseOperationName[],
  { input = process.stdin, output = process.stdout }: PromptStreams = {},
): Promise<DatabaseOperationName[]> {
  return new Promise((resolve, reject) => {
    let cursor = 0
    const checked = new Set<DatabaseOperationName>()
    let drawnLines = 0
    let settled = false
    let rawModeEnabled = false

    const optionLine = (
      operation: DatabaseOperationName,
      index: number,
    ): string =>
      `${index === cursor ? '>' : ' '} ${
        checked.has(operation) ? '[x]' : '[ ]'
      } ${formatOperationLabel(operation)}`

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
      erase()
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
        case 'return':
        case 'enter': {
          answerWith()
          break
        }
        default: {
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
