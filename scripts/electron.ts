import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'

const require = createRequire(import.meta.url)

// Outside of Electron, `require('electron')` resolves to the Electron executable path.
const electronBinary: string = require('electron')

const projectRoot = path.join(import.meta.dirname, '..')
const mode = process.argv[2]

let viteServer: ViteDevServer | undefined
let electronProcess: ChildProcess | undefined
let stopping = false

async function shutdown(code: number): Promise<never> {
  if (!stopping) {
    stopping = true
    electronProcess?.kill()

    // Closing the in-process dev server releases its port before exit, so the
    // next run can reuse it.
    await viteServer?.close()
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

function launchElectron(devServerUrl: string): ChildProcess {
  console.log(`\nStarting Electron with the dev server at ${devServerUrl}\n`)

  const electron = spawn(electronBinary, ['.'], {
    cwd: projectRoot,
    env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
    stdio: 'inherit',
  })

  electron.once('close', (code) => {
    void shutdown(code ?? 0)
  })

  return electron
}

async function dev(): Promise<void> {
  await buildElectronSources()

  // Run Vite inside this process: a separately spawned Vite can outlive this
  // script on Windows (killing a process does not kill its children) and would
  // keep holding its port for later runs.
  //
  // Bind to the literal loopback address and load that URL: no name resolution
  // is involved, so proxy or VPN/TUN handling cannot interfere with the page or
  // its HMR websocket.
  //
  // The port is pinned with strictPort because the renderer's localStorage
  // (which remembers the picked theme) is keyed by origin; silently falling
  // back to another port would change the origin and lose the stored theme.
  const server = await createServer({
    root: projectRoot,
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  })
  await server.listen()
  viteServer = server

  const devServerUrl = server.resolvedUrls?.local[0]
  if (!devServerUrl) {
    console.error('The Vite dev server did not report a local URL.')
    return shutdown(1)
  }

  server.printUrls()

  electronProcess = launchElectron(devServerUrl)
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
