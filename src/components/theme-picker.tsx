import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { applyTheme, readTheme, storeTheme, type Theme } from '@/lib/theme'
import { Moon, Monitor, Sun, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

const themeOptions: { value: Theme; label: string }[] = [
  { value: 'light', label: 'روشن' },
  { value: 'dark', label: 'تاریک' },
  { value: 'system', label: 'سیستم' },
]

const themeIcons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} satisfies Record<Theme, LucideIcon>

function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    applyTheme(theme)

    if (theme !== 'system') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  const ActiveThemeIcon = themeIcons[theme]

  const pickTheme = (value: Theme): void => {
    setTheme(value)
    storeTheme(value)
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="white" size="icon" aria-label="تغییر پوسته">
              <ActiveThemeIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">تغییر پوسته</TooltipContent>
      </Tooltip>

      <DropdownMenuContent side="bottom" align="end">
        {themeOptions.map((option) => {
          const ThemeIcon = themeIcons[option.value]

          return (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={theme === option.value}
              onSelect={() => pickTheme(option.value)}
            >
              <ThemeIcon />
              {option.label}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { ThemePicker }
