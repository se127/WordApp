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
      dir="rtl"
      data-slot="title-bar"
      className="relative flex w-full shrink-0 items-center justify-between select-none"
    >
      {trailing ? (
        <div className="flex shrink-0 items-center">{trailing}</div>
      ) : null}
      {center ? (
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center">
          {center}
        </div>
      ) : null}
      <div className="ms-auto flex shrink-0 items-center">
        <ThemePicker />
      </div>
    </div>
  )
}

export { TitleBar }
