import { ThemePicker } from '@/components/theme-picker'
import type { ReactNode } from 'react'

function TitleBar({
  center,
  trailing,
}: {
  center?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div
      dir="ltr"
      data-slot="title-bar"
      className="relative flex h-16 shrink-0 items-center justify-between select-none"
    >
      <div className="flex h-full shrink-0 items-center ps-4">
        <ThemePicker />
      </div>
      {center ? (
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center">
          {center}
        </div>
      ) : null}
      {trailing ? (
        <div className="flex h-full shrink-0 items-center pe-4">{trailing}</div>
      ) : null}
    </div>
  )
}

export { TitleBar }
