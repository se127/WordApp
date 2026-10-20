import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from '@babel/core'
import { reactCompiler } from '../vite.config.ts'

const require = createRequire(import.meta.url)

const compilerPluginPath = require.resolve('babel-plugin-react-compiler')

type CompileSuccessEvent = {
  kind: 'CompileSuccess'
  fnName: string | null
  memoSlots: number
  memoBlocks: number
  memoValues: number
}

type CompilerLocation = { start?: { line?: number; column?: number } } | null

type CompileErrorEvent = {
  kind: 'CompileError'
  fnLoc: CompilerLocation
  detail: {
    reason: string
    description: string | null
    category: string
    loc: CompilerLocation
  }
}

type CompileSkipEvent = {
  kind: 'CompileSkip'
  fnLoc: CompilerLocation
  reason: string
}

type PipelineErrorEvent = {
  kind: 'PipelineError'
  data: string
}

type CompilerEvent =
  | CompileSuccessEvent
  | CompileErrorEvent
  | CompileSkipEvent
  | PipelineErrorEvent

export type CompiledFunction = {
  name: string | null
  memoSlots: number
}

export type FileCheck = {
  file: string
  status: 'compiled' | 'no-react-code' | 'accepted' | 'failed'
  sentToCompiler: boolean
  compiledFunctions: CompiledFunction[]
  acceptedProblems: string[]
  problems: string[]
}

export type AcceptedSkip = {
  file: string
  problem: string
  reason: string
}

export const acceptedCompilerSkips: AcceptedSkip[] = []

function readCompilerOptions(): Record<string, unknown> {
  const preset = reactCompiler.preset
  if (typeof preset !== 'function') {
    return {}
  }

  try {
    const configured = (preset as () => { plugins?: unknown[] })()
    const entry = configured.plugins?.[0]
    if (
      Array.isArray(entry) &&
      typeof entry[1] === 'object' &&
      entry[1] !== null
    ) {
      return entry[1] as Record<string, unknown>
    }
  } catch {
    return {}
  }

  return {}
}

function expectedRuntimeModule(options: Record<string, unknown>): string {
  return options.target === '17' || options.target === '18'
    ? 'react-compiler-runtime'
    : 'react/compiler-runtime'
}

function readCodeFilter(): RegExp | null {
  const filter = reactCompiler.rolldown.filter?.code
  if (filter === undefined) {
    return null
  }
  if (filter instanceof RegExp) {
    return filter
  }
  throw new Error(
    'react-compiler-check cannot read the code filter of the reactCompiler preset in vite.config.ts; update the check to match the preset.',
  )
}

export function isSentToCompiler(code: string): boolean {
  const filter = readCodeFilter()
  return filter === null || filter.test(code)
}

function formatCompileError(event: CompileErrorEvent): string {
  const { reason, description, category, loc } = event.detail
  const errorLine = loc?.start?.line
  const functionLine = event.fnLoc?.start?.line
  const location =
    typeof errorLine === 'number'
      ? ` (line ${errorLine})`
      : typeof functionLine === 'number'
        ? ` (function at line ${functionLine})`
        : ''
  const detail = description === null ? '' : ` — ${description}`
  return `${reason} [${category}]${location}${detail}`
}

function formatCompileSkip(event: CompileSkipEvent): string {
  const line = event.fnLoc?.start?.line
  const location = typeof line === 'number' ? ` (function at line ${line})` : ''
  if (
    event.reason.startsWith('Skipped due to ') &&
    event.reason.endsWith(' directive.')
  ) {
    return `Compiler skipped a function${location} because of a function-level opt-out directive ("use no memo" or "use no forget").`
  }
  return `Compiler skipped a function${location}: ${event.reason}`
}

function samePath(left: string, right: string): boolean {
  return path.normalize(left) === path.normalize(right)
}

function isAcceptedProblem(file: string, problem: string): boolean {
  return acceptedCompilerSkips.some(
    (skip) => samePath(skip.file, file) && problem.startsWith(skip.problem),
  )
}

export function findStaleAcceptedSkips(results: FileCheck[]): AcceptedSkip[] {
  return acceptedCompilerSkips.filter(
    (skip) =>
      !results.some(
        (result) =>
          samePath(result.file, skip.file) &&
          result.acceptedProblems.some((problem) =>
            problem.startsWith(skip.problem),
          ),
      ),
  )
}

function acceptedSkipLines(result: FileCheck): string[] {
  return acceptedCompilerSkips
    .filter(
      (skip) =>
        samePath(skip.file, result.file) &&
        result.acceptedProblems.some((problem) =>
          problem.startsWith(skip.problem),
        ),
    )
    .map((skip) => `  - ${skip.problem}: ${skip.reason}`)
}

export function checkSource(file: string, code: string): FileCheck {
  const options = readCompilerOptions()
  const events: CompilerEvent[] = []
  const logger = {
    logEvent: (_filename: string, event: CompilerEvent) => {
      events.push(event)
    },
  }

  let transformedCode = ''
  let moduleDirectives: string[] = []
  let transformFailure: string | null = null

  try {
    const result = transformSync(code, {
      filename: path.resolve(file),
      babelrc: false,
      configFile: false,
      sourceType: 'module',
      ast: true,
      code: true,
      sourceMaps: false,
      highlightCode: false,
      parserOpts: { sourceType: 'module', allowAwaitOutsideFunction: true },
      overrides: [
        { test: /\.jsx$/, parserOpts: { plugins: ['jsx'] } },
        { test: /\.ts$/, parserOpts: { plugins: ['typescript'] } },
        { test: /\.tsx$/, parserOpts: { plugins: ['typescript', 'jsx'] } },
      ],
      plugins: [[compilerPluginPath, { ...options, logger }]],
    })
    transformedCode = result?.code ?? ''
    moduleDirectives = (result?.ast?.program.directives ?? []).map(
      (directive) => directive.value.value,
    )
  } catch (error) {
    transformFailure = error instanceof Error ? error.message : String(error)
  }

  const allProblems: string[] = []
  if (transformFailure !== null) {
    allProblems.push(transformFailure)
  }

  const optOutDirective = moduleDirectives.find(
    (directive) => directive === 'use no memo' || directive === 'use no forget',
  )
  if (optOutDirective !== undefined) {
    allProblems.push(
      `The module directive "${optOutDirective}" turns the React Compiler off for this file.`,
    )
  }

  const successes = events.filter(
    (event): event is CompileSuccessEvent => event.kind === 'CompileSuccess',
  )
  const compileErrors = events.filter(
    (event): event is CompileErrorEvent => event.kind === 'CompileError',
  )
  const skips = events.filter(
    (event): event is CompileSkipEvent => event.kind === 'CompileSkip',
  )
  const pipelineErrors = events.filter(
    (event): event is PipelineErrorEvent => event.kind === 'PipelineError',
  )

  for (const event of compileErrors) {
    allProblems.push(formatCompileError(event))
  }
  for (const event of pipelineErrors) {
    allProblems.push(`Compiler pipeline error: ${event.data}`)
  }
  for (const event of skips) {
    allProblems.push(formatCompileSkip(event))
  }

  const sentToCompiler = isSentToCompiler(code)
  if (successes.length > 0 && !sentToCompiler) {
    allProblems.push(
      'The preset filter in vite.config.ts never sends this file to the React Compiler.',
    )
  }
  if (
    successes.length > 0 &&
    !transformedCode.includes(expectedRuntimeModule(options))
  ) {
    allProblems.push(
      'The compiler reported compiled functions but the output has no memo cache import.',
    )
  }

  const compiledFunctions = successes.map((event) => ({
    name: event.fnName,
    memoSlots: event.memoSlots,
  }))

  const acceptedProblems = allProblems.filter((problem) =>
    isAcceptedProblem(file, problem),
  )
  const problems = allProblems.filter(
    (problem) => !isAcceptedProblem(file, problem),
  )

  const status =
    problems.length > 0
      ? 'failed'
      : acceptedProblems.length > 0
        ? 'accepted'
        : compiledFunctions.length > 0
          ? 'compiled'
          : 'no-react-code'

  return {
    file,
    status,
    sentToCompiler,
    compiledFunctions,
    acceptedProblems,
    problems,
  }
}

function isRendererSource(name: string): boolean {
  return (
    !name.endsWith('.d.ts') && (name.endsWith('.ts') || name.endsWith('.tsx'))
  )
}

export function collectSourceFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath))
    } else if (isRendererSource(entry.name)) {
      files.push(entryPath)
    }
  }
  return files
}

export function checkFile(file: string): FileCheck {
  return checkSource(file, readFileSync(file, 'utf8'))
}

function describeCheck(result: FileCheck): string {
  if (result.status === 'failed') {
    return `${result.problems.length} problem${result.problems.length === 1 ? '' : 's'}`
  }

  const count = result.compiledFunctions.length
  const slots = result.compiledFunctions.reduce(
    (total, fn) => total + fn.memoSlots,
    0,
  )
  const parts: string[] = []

  if (count > 0) {
    parts.push(
      `${count} function${count === 1 ? '' : 's'}, ${slots} memo slot${slots === 1 ? '' : 's'}`,
    )
  }
  if (result.acceptedProblems.length > 0) {
    parts.push(
      `${result.acceptedProblems.length} accepted skip${result.acceptedProblems.length === 1 ? '' : 's'}`,
    )
  }
  if (parts.length === 0) {
    return result.sentToCompiler
      ? 'nothing for the compiler to compile'
      : 'not sent to the compiler by the preset filter'
  }
  return parts.join(', ')
}

export function formatReport(results: FileCheck[]): string {
  const width = Math.max(...results.map((result) => result.file.length))
  const lines = results.map((result) => {
    const label =
      result.status === 'compiled'
        ? 'compiled'
        : result.status === 'accepted'
          ? 'accepted'
          : result.status === 'failed'
            ? 'failed'
            : 'no react code'
    return `${label.padEnd(13)} ${result.file.padEnd(width)}  ${describeCheck(result)}`
  })

  const compiledCount = results.filter(
    (result) => result.status === 'compiled',
  ).length
  const acceptedCount = results.filter(
    (result) => result.status === 'accepted',
  ).length
  const failedCount = results.filter(
    (result) => result.status === 'failed',
  ).length
  const noReactCount =
    results.length - compiledCount - acceptedCount - failedCount
  const memoSlots = results.reduce(
    (total, result) =>
      total +
      result.compiledFunctions.reduce((sum, fn) => sum + fn.memoSlots, 0),
    0,
  )

  const acceptedPart =
    acceptedCount > 0 ? `, ${acceptedCount} with accepted skips` : ''
  const summary = `Checked ${results.length} files: ${compiledCount} compiled (${memoSlots} memo slots)${acceptedPart}, ${noReactCount} without React code, ${failedCount} failed.`
  const failureLines = results
    .filter((result) => result.status === 'failed')
    .flatMap((result) => [
      result.file,
      ...result.problems.map((problem) => `  - ${problem}`),
    ])
  const acceptedLines = results
    .filter((result) => result.acceptedProblems.length > 0)
    .flatMap((result) => [result.file, ...acceptedSkipLines(result)])

  const sections = [lines.join('\n'), '', summary]
  if (acceptedLines.length > 0) {
    sections.push(
      '',
      'Accepted skips (pinned in scripts/react-compiler-check.ts):',
      ...acceptedLines,
    )
  }
  if (failureLines.length > 0) {
    sections.push('', 'Problems:', ...failureLines)
  }

  return sections.join('\n')
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: bun run check:react-compiler [path ...]')
    console.log(
      'Checks that the React Compiler compiles every renderer file (default: src).',
    )
    return
  }

  const targets = args.length > 0 ? args : ['src']
  const files: string[] = []
  for (const target of targets) {
    if (!existsSync(target)) {
      console.error(`Path not found: ${target}`)
      process.exit(1)
    }
    if (statSync(target).isDirectory()) {
      files.push(...collectSourceFiles(target))
    } else {
      files.push(target)
    }
  }

  const uniqueFiles = [...new Set(files)].sort()
  if (uniqueFiles.length === 0) {
    console.error(`No .ts or .tsx files found in: ${targets.join(', ')}`)
    process.exit(1)
  }

  const results = uniqueFiles.map((file) => checkFile(file))
  const staleSkips = findStaleAcceptedSkips(results)
  const filter = readCodeFilter()

  console.log('React Compiler check')
  console.log(
    `Filter: ${filter === null ? '(no filter)' : `/${filter.source}/`}`,
  )
  console.log('')
  console.log(formatReport(results))

  if (staleSkips.length > 0) {
    console.log('')
    console.log(
      'Stale accepted skips (they no longer match anything; remove them from scripts/react-compiler-check.ts):',
    )
    for (const skip of staleSkips) {
      console.log(`  - ${skip.file}: ${skip.problem}`)
    }
  }

  if (
    staleSkips.length > 0 ||
    results.some((result) => result.status === 'failed')
  ) {
    process.exit(1)
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (entry === undefined) {
    return false
  }
  return path.resolve(entry) === fileURLToPath(import.meta.url)
}

if (isDirectRun()) {
  main()
}
