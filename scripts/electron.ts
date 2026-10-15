import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

// Outside of Electron, `require('electron')` resolves to the Electron executable path.
const electronBinary: string = require('electron')

const projectRoot = path.join(import.meta.dirname, '..')
const mode = process.argv[2]

let viteProcess: ChildProcess | undefined
let electronProcess: ChildProcess | undefined
let stopping = false

function shutdown(code: number): never {
  if (!stopping) {
    stopping = true
    electronProcess?.kill()
    viteProcess?.kill()
  }
  process.exit(code)
}

function runBun(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      stdio: 'inherit',
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

async function bundleEntry(entry: string, outFile: string): Promise<void> {
  await runBun([
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
  ])
}

async function buildElectronSources(): Promise<void> {
  await bundleEntry('electron/main.ts', 'dist-electron/main.cjs')
  await bundleEntry('electron/preload.ts', 'dist-electron/preload.cjs')
}

function stripAnsiCodes(text: string): string {
  const escapeCharacter = String.fromCharCode(27)
  return text
    .split(escapeCharacter)
    .map((part, index) =>
      index === 0 ? part : part.replace(/^\[[0-9;?]*[a-zA-Z]/, ''),
    )
    .join('')
}

function launchElectron(devServerUrl: string): ChildProcess {
  console.log(`\nStarting Electron with the dev server at ${devServerUrl}\n`)

  const electron = spawn(electronBinary, ['.'], {
    cwd: projectRoot,
    env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
    stdio: 'inherit',
  })

  electron.once('close', (code) => {
    shutdown(code ?? 0)
  })

  return electron
}

async function dev(): Promise<void> {
  await buildElectronSources()

  const vite = spawn(process.execPath, ['x', 'vite'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  viteProcess = vite

  let started = false
  let output = ''

  const startTimeout = setTimeout(() => {
    if (!started) {
      console.error('Timed out waiting for the Vite dev server to start.')
      shutdown(1)
    }
  }, 60_000)

  vite.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk)
    if (started) {
      return
    }

    output += stripAnsiCodes(chunk.toString())
    const match = output.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+\//)
    if (!match) {
      return
    }

    started = true
    clearTimeout(startTimeout)
    electronProcess = launchElectron(match[0])
  })

  vite.once('close', (code) => {
    clearTimeout(startTimeout)
    if (!started) {
      console.error(
        `Vite exited before it was ready (exit code ${code ?? 'unknown'}).`,
      )
      shutdown(code ?? 1)
    } else if (!stopping) {
      console.error('The Vite dev server exited unexpectedly.')
      shutdown(1)
    }
  })
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
  shutdown(130)
})

process.on('SIGTERM', () => {
  shutdown(143)
})
