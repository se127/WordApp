import { resolveCodeBlockLanguage } from '@/lib/code-block'
import { describe, expect, it } from 'vitest'

describe('resolveCodeBlockLanguage', () => {
  it('maps supported aliases to their shiki language', () => {
    expect(resolveCodeBlockLanguage('plaintext')).toBe('plaintext')
    expect(resolveCodeBlockLanguage('text')).toBe('plaintext')
    expect(resolveCodeBlockLanguage('xml')).toBe('html')
    expect(resolveCodeBlockLanguage('js')).toBe('javascript')
    expect(resolveCodeBlockLanguage('ts')).toBe('typescript')
    expect(resolveCodeBlockLanguage('py')).toBe('python')
    expect(resolveCodeBlockLanguage('sh')).toBe('bash')
    expect(resolveCodeBlockLanguage('md')).toBe('markdown')
    expect(resolveCodeBlockLanguage('  JavaScript  ')).toBe('javascript')
  })

  it('rejects missing and unsupported languages', () => {
    expect(resolveCodeBlockLanguage(undefined)).toBeNull()
    expect(resolveCodeBlockLanguage(null)).toBeNull()
    expect(resolveCodeBlockLanguage('')).toBeNull()
    expect(resolveCodeBlockLanguage('ruby')).toBeNull()
  })
})
