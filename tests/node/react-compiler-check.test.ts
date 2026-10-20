import { describe, expect, it } from 'vitest'
import {
  acceptedCompilerSkips,
  checkFile,
  checkSource,
  collectSourceFiles,
  findStaleAcceptedSkips,
} from '../../scripts/react-compiler-check.ts'
import viteConfig, { reactCompiler } from '../../vite.config.ts'

const toPosix = (value: string): string => value.replaceAll('\\', '/')

async function pluginNames(options: unknown[]): Promise<string[]> {
  const names: string[] = []
  for (const option of options) {
    if (option === null || option === undefined || option === false) {
      continue
    }
    const resolved: unknown = await option
    if (Array.isArray(resolved)) {
      names.push(...(await pluginNames(resolved)))
    } else if (
      typeof resolved === 'object' &&
      resolved !== null &&
      'name' in resolved &&
      typeof resolved.name === 'string'
    ) {
      names.push(resolved.name)
    }
  }
  return names
}

describe('checkSource', () => {
  it('reports compiled functions with memo slots for a component', () => {
    const result = checkSource(
      'Fixture.tsx',
      `import { useState } from 'react'

function Fixture({ step }: { step: number }) {
  const [count, setCount] = useState(step)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}

export { Fixture }
`,
    )

    expect(result.status).toBe('compiled')
    expect(result.problems).toEqual([])
    expect(result.acceptedProblems).toEqual([])
    expect(result.compiledFunctions.length).toBeGreaterThan(0)
    expect(result.compiledFunctions[0]?.memoSlots).toBeGreaterThan(0)
  })

  it('fails when the compiler refuses to compile a function', () => {
    const result = checkSource(
      'Fixture.tsx',
      `import { useState } from 'react'

function Fixture() {
  const [busy, setBusy] = useState(false)
  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      await Promise.resolve()
    } finally {
      setBusy(false)
    }
  }
  return <button onClick={() => void run()}>{busy ? 'busy' : 'idle'}</button>
}

export { Fixture }
`,
    )

    expect(result.status).toBe('failed')
    expect(
      result.problems.some((problem) => problem.includes('TryStatement')),
    ).toBe(true)
  })

  it('fails when a module directive turns the compiler off', () => {
    const result = checkSource(
      'Fixture.tsx',
      `'use no memo'

function Fixture() {
  return <div />
}

export { Fixture }
`,
    )

    expect(result.status).toBe('failed')
    expect(
      result.problems.some((problem) => problem.includes('use no memo')),
    ).toBe(true)
  })

  it('fails when a function opts out with a directive', () => {
    const result = checkSource(
      'Fixture.tsx',
      `function Fixture() {
  'use no memo'
  return <div />
}

export { Fixture }
`,
    )

    expect(result.status).toBe('failed')
    expect(
      result.problems.some((problem) => problem.includes('use no memo')),
    ).toBe(true)
  })

  it('reports files without React code', () => {
    const result = checkSource(
      'fixture.ts',
      `export function double(value: number): number {
  return value * 2
}
`,
    )

    expect(result.status).toBe('no-react-code')
    expect(result.problems).toEqual([])
  })
})

describe('renderer sources', () => {
  const results = collectSourceFiles('src').map(checkFile)

  it('compiles every renderer file without unexpected problems', () => {
    expect(results.length).toBeGreaterThan(0)
    expect(results.filter((result) => result.status === 'failed')).toEqual([])
  })

  it('accepts exactly the pinned compiler skips', () => {
    expect(findStaleAcceptedSkips(results)).toEqual([])
    expect(
      results
        .filter((result) => result.status === 'accepted')
        .map((result) => toPosix(result.file)),
    ).toEqual(acceptedCompilerSkips.map((skip) => toPosix(skip.file)))
  })

  it('memoizes the root and the pages', () => {
    const app = checkFile('src/App.tsx')
    expect(app.status).toBe('compiled')
    expect(app.compiledFunctions.some((fn) => fn.memoSlots > 0)).toBe(true)

    const documentOptions = checkFile('src/components/document-options.tsx')
    expect(documentOptions.status).toBe('compiled')

    const home = checkFile('src/pages/home.tsx')
    expect(home.status).toBe('compiled')
    expect(home.compiledFunctions.length).toBeGreaterThan(0)
  })
})

describe('react compiler wiring', () => {
  it('applies the compiler preset through the babel plugin in vite.config.ts', async () => {
    const names = await pluginNames([...(viteConfig.plugins ?? [])])
    expect(names).toContain('@rolldown/plugin-babel')
  })

  it('exposes the preset with a regex code filter', () => {
    expect(reactCompiler.rolldown.filter?.code).toBeInstanceOf(RegExp)
  })
})
