import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import {
  databaseOperationNames,
  emptySeed,
  parseDbDelayArgument,
  parseSeedArgument,
  type DatabaseOperationName,
} from '../electron/database.ts'
import {
  DbFailurePromptCanceledError,
  promptDbFailures,
} from './db-failure-prompt.ts'
import { formatDevFlags } from './dev-flags.ts'

const require = createRequire(import.meta.url)

const electronBinary: string = require('electron')

const projectRoot = path.join(import.meta.dirname, '..')
const mode = process.argv[2]

function readSeedArgument(): string | undefined {
  const argument = process.argv
    .slice(3)
    .find((value) => value === '--seed' || value.startsWith('--seed='))

  if (argument === undefined) {
    return undefined
  }

  if (mode !== 'dev') {
    console.error('--seed is only supported by the dev script (bun dev).')
    process.exit(1)
  }

  if (!argument.startsWith('--seed=')) {
    console.error(
      '--seed needs a value: --seed=<table>,<count>[-<table>,<count>]',
    )
    process.exit(1)
  }

  const value = argument.slice('--seed='.length)
  try {
    parseSeedArgument(value)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  return value
}

function readDbDelayArgument(): string | undefined {
  const argument = process.argv
    .slice(3)
    .find((value) => value === '--db-delay' || value.startsWith('--db-delay='))

  if (argument === undefined) {
    return undefined
  }

  if (mode !== 'dev') {
    console.error('--db-delay is only supported by the dev script (bun dev).')
    process.exit(1)
  }

  if (!argument.startsWith('--db-delay=')) {
    console.error('--db-delay needs a value: --db-delay=<milliseconds>ms')
    process.exit(1)
  }

  const value = argument.slice('--db-delay='.length)
  try {
    parseDbDelayArgument(value)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  return value
}

function readDbFailureFlag(): boolean {
  const argument = process.argv
    .slice(3)
    .find(
      (value) =>
        value === '--with-db-failure' || value.startsWith('--with-db-failure='),
    )

  if (argument === undefined) {
    return false
  }

  if (mode !== 'dev') {
    console.error(
      '--with-db-failure is only supported by the dev script (bun dev).',
    )
    process.exit(1)
  }

  if (argument !== '--with-db-failure') {
    console.error('--with-db-failure takes no value.')
    process.exit(1)
  }

  return true
}

async function readDbFailures(): Promise<DatabaseOperationName[]> {
  if (!withDbFailure) {
    return []
  }

  if (!process.stdin.isTTY) {
    console.error(
      '--with-db-failure needs an interactive terminal for its prompt.',
    )
    process.exit(1)
  }

  try {
    return await promptDbFailures(databaseOperationNames)
  } catch (error) {
    if (error instanceof DbFailurePromptCanceledError) {
      process.exit(130)
    }

    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

const seedArgument = readSeedArgument()
const dbDelayArgument = readDbDelayArgument()
const withDbFailure = readDbFailureFlag()

let viteServer: ViteDevServer | undefined
let electronProcess: ChildProcess | undefined
let stopping = false

async function shutdown(code: number): Promise<never> {
  if (!stopping) {
    stopping = true
    electronProcess?.kill()

    await viteServer?.close()
  }
  process.exit(code)
}

function runBun(args: string[], quiet = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit',
    })

    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`bun ${args.join(' ')} failed with exit code ${code}`))
      }
    })
  })
}

async function bundleEntry(
  entry: string,
  outFile: string,
  quiet = false,
): Promise<void> {
  await runBun(
    [
      'build',
      entry,
      '--outfile',
      outFile,
      '--format',
      'cjs',
      '--target',
      'node',
      '--external',
      'electron',
    ],
    quiet,
  )
}

async function buildElectronSources(quiet = false): Promise<void> {
  await bundleEntry('electron/main.ts', 'dist-electron/main.cjs', quiet)
  await bundleEntry('electron/preload.ts', 'dist-electron/preload.cjs', quiet)
}

function launchElectron(
  devServerUrl: string,
  devSeed: string,
  devDbDelay: string,
  devDbFailures: string,
): ChildProcess {
  console.log('\nstarting electron dev...')

  const electron = spawn(electronBinary, ['.'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl,
      DEV_SEED: devSeed,
      DEV_DB_DELAY: devDbDelay,
      DEV_DB_FAILURE: devDbFailures,
    },
    stdio: 'inherit',
  })

  electron.once('close', (code) => {
    void shutdown(code ?? 0)
  })

  return electron
}

async function dev(): Promise<void> {
  const dbFailures = await readDbFailures()

  const requestedSeed =
    seedArgument === undefined ? [] : parseSeedArgument(seedArgument)

  console.log(
    formatDevFlags({
      seedEntries: requestedSeed.length > 0 ? requestedSeed : emptySeed,
      dbDelayMs:
        dbDelayArgument === undefined
          ? 0
          : parseDbDelayArgument(dbDelayArgument),
      failingOperations: withDbFailure ? dbFailures : undefined,
    }),
  )

  await buildElectronSources(true)

  const server = await createServer({
    root: projectRoot,
    clearScreen: false,
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  })
  await server.listen()
  viteServer = server

  const devServerUrl = server.resolvedUrls?.local[0]
  if (!devServerUrl) {
    console.error('The Vite dev server did not report a local URL.')
    return shutdown(1)
  }

  electronProcess = launchElectron(
    devServerUrl,
    seedArgument ?? '',
    dbDelayArgument ?? '',
    dbFailures.join(','),
  )
}

async function build(): Promise<void> {
  await buildElectronSources()
}

switch (mode) {
  case 'dev':
    await dev()
    break
  case 'build':
    await build()
    break
  default:
    console.error('Usage: bun run scripts/electron.ts <dev|build>')
    process.exit(1)
}

process.on('SIGINT', () => {
  void shutdown(130)
})

process.on('SIGTERM', () => {
  void shutdown(143)
})
