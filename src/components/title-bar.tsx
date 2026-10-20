import { ThemePicker } from '@/components/theme-picker'

function TitleBar() {
  return (
    <div
      dir="ltr"
      data-slot="title-bar"
      className="flex h-16 shrink-0 items-center select-none"
    >
      <div className="flex h-full shrink-0 items-center ps-4">
        <ThemePicker />
      </div>
    </div>
  )
}

export { TitleBar }
