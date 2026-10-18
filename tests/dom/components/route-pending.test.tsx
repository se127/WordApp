import { RoutePending } from '@/components/route-pending'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('RoutePending', () => {
  it('announces the loading status with text beside the icon', () => {
    render(<RoutePending />)

    const status = screen.getByRole('status', { name: 'در حال بارگذاری' })
    expect(status).toHaveTextContent('در حال بارگذاری...')
    expect(status.querySelector('svg')).toHaveClass('size-4', 'animate-spin')
  })
})
