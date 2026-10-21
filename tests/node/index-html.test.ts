import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('pre-mount loading screen', () => {
  it('shows a 16px loading icon', async () => {
    const html = await readFile(
      new URL('../../index.html', import.meta.url),
      'utf8',
    )
    const icon = html.match(/<svg[\s\S]*?<\/svg>/)?.[0]

    expect(icon).toContain('width="16"')
    expect(icon).toContain('height="16"')
  })
})
