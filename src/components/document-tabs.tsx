import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  activeDocumentId,
  DocumentTabsContext,
  tabAfterClosing,
  type DocumentTab,
} from '@/lib/document-tabs'
import { cn } from '@/lib/utils'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, X, type LucideIcon } from 'lucide-react'
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

const closeTabLabel = 'بستن سند'
const keyboardScrollDistance = 120
const nextTabsLabel = 'نمایش تب های بعدی'
const previousTabsLabel = 'نمایش تب های قبلی'
const scrollEdgeTolerance = 2
const scrollStep = 0.2
const scrollSettleDistance = 1
const tabTitleTooltipDelay = 800

function DocumentTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<DocumentTab[]>([])

  const openDocumentTab = useCallback((tab: DocumentTab): void => {
    setTabs((current) => {
      const existing = current.find((item) => item.id === tab.id)
      if (existing === undefined) {
        return [...current, tab]
      }
      if (existing.title === tab.title) {
        return current
      }
      return current.map((item) => (item.id === tab.id ? tab : item))
    })
  }, [])

  const closeDocumentTab = useCallback((id: number): void => {
    setTabs((current) =>
      current.some((item) => item.id === id)
        ? current.filter((item) => item.id !== id)
        : current,
    )
  }, [])

  const value = useMemo(
    () => ({ tabs, openDocumentTab, closeDocumentTab }),
    [closeDocumentTab, openDocumentTab, tabs],
  )

  return (
    <DocumentTabsContext.Provider value={value}>
      {children}
    </DocumentTabsContext.Provider>
  )
}

function clampScrollLeft(value: number, scrollableWidth: number): number {
  return Math.min(Math.max(value, -(scrollableWidth + scrollEdgeTolerance)), 0)
}

function readTabsScrollState(strip: HTMLDivElement): {
  canScrollLeft: boolean
  canScrollRight: boolean
} {
  const scrollableWidth = strip.scrollWidth - strip.clientWidth

  if (scrollableWidth <= scrollEdgeTolerance) {
    return { canScrollLeft: false, canScrollRight: false }
  }

  return {
    canScrollLeft: strip.scrollLeft > -scrollableWidth + scrollEdgeTolerance,
    canScrollRight: strip.scrollLeft < -scrollEdgeTolerance,
  }
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function TabsScrollButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: LucideIcon
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={label}
          onClick={onClick}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function DocumentTabs() {
  const { tabs, closeDocumentTab } = useContext(DocumentTabsContext)
  const location = useLocation()
  const navigate = useNavigate()
  const stripRef = useRef<HTMLDivElement | null>(null)
  const activeTabId = activeDocumentId(location.pathname)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const scrollTargetRef = useRef(0)
  const scrollPositionRef = useRef(Number.NaN)
  const scrollFrameRef = useRef<number | null>(null)
  const isTabsHoveredRef = useRef(false)

  const syncScrollButtons = useCallback((): void => {
    const strip = stripRef.current
    if (strip === null) {
      return
    }

    const scrollState = readTabsScrollState(strip)
    setCanScrollLeft(scrollState.canScrollLeft)
    setCanScrollRight(scrollState.canScrollRight)
  }, [])

  const stopScrollTabs = useCallback((): void => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current)
      scrollFrameRef.current = null
    }
  }, [])

  const scrollTabsBy = useCallback((distance: number): void => {
    const strip = stripRef.current
    if (strip === null) {
      return
    }

    const isAnimating = scrollFrameRef.current !== null
    const origin = isAnimating ? scrollTargetRef.current : strip.scrollLeft
    scrollTargetRef.current = clampScrollLeft(
      origin + distance,
      strip.scrollWidth - strip.clientWidth,
    )

    if (isAnimating) {
      return
    }

    scrollPositionRef.current = Number.NaN

    const scrollFrame = (): void => {
      const element = stripRef.current
      if (element === null) {
        scrollFrameRef.current = null
        return
      }

      const position = element.scrollLeft
      const remaining = scrollTargetRef.current - position

      if (Math.abs(remaining) <= scrollSettleDistance) {
        element.scrollLeft = scrollTargetRef.current
        scrollFrameRef.current = null
        return
      }

      if (position === scrollPositionRef.current) {
        scrollFrameRef.current = null
        return
      }

      scrollPositionRef.current = position
      element.scrollLeft = position + remaining * scrollStep
      scrollFrameRef.current = requestAnimationFrame(scrollFrame)
    }

    scrollFrameRef.current = requestAnimationFrame(scrollFrame)
  }, [])

  const scrollTabsByPage = (direction: -1 | 1): void => {
    const strip = stripRef.current
    if (strip === null) {
      return
    }

    scrollTabsBy(direction * strip.clientWidth)
  }

  useEffect(() => {
    syncScrollButtons()
  }, [syncScrollButtons, tabs])

  useEffect(() => {
    window.addEventListener('resize', syncScrollButtons)
    return () => window.removeEventListener('resize', syncScrollButtons)
  }, [syncScrollButtons])

  useEffect(() => stopScrollTabs, [stopScrollTabs])

  useEffect(() => {
    const strip = stripRef.current
    if (strip === null) {
      return
    }

    const scrollTabs = (event: WheelEvent): void => {
      if (event.deltaY === 0) {
        return
      }

      event.preventDefault()
      scrollTabsBy(-event.deltaY)
    }

    strip.addEventListener('wheel', scrollTabs, { passive: false })
    return () => strip.removeEventListener('wheel', scrollTabs)
  }, [scrollTabsBy])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isTabsHoveredRef.current || isTextEntryTarget(event.target)) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        scrollTabsBy(-keyboardScrollDistance)
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        scrollTabsBy(keyboardScrollDistance)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [scrollTabsBy])

  useEffect(() => {
    if (activeTabId === undefined) {
      return
    }

    stopScrollTabs()
    stripRef.current
      ?.querySelector(`[data-tab-id="${activeTabId}"]`)
      ?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      })
  }, [activeTabId, stopScrollTabs, tabs])

  const closeTab = (tab: DocumentTab): void => {
    const nextTab = tabAfterClosing(tabs, tab.id)
    closeDocumentTab(tab.id)

    if (tab.id !== activeTabId) {
      return
    }

    if (nextTab === undefined) {
      void navigate({ to: '/' })
      return
    }

    void navigate({
      to: '/documents/$documentId',
      params: { documentId: String(nextTab.id) },
    })
  }

  return (
    <div
      className="flex h-full min-w-0 flex-1 items-center gap-1 px-3 no-drag-region"
      onMouseEnter={() => {
        isTabsHoveredRef.current = true
      }}
      onMouseLeave={() => {
        isTabsHoveredRef.current = false
      }}
    >
      {tabs.length > 0 ? (
        <Separator orientation="vertical" className="my-auto me-2 h-8" />
      ) : null}
      {canScrollLeft ? (
        <TabsScrollButton
          label={nextTabsLabel}
          icon={ChevronLeft}
          onClick={() => scrollTabsByPage(-1)}
        />
      ) : null}
      <div
        ref={stripRef}
        dir="rtl"
        data-slot="document-tabs"
        onScroll={syncScrollButtons}
        className="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => (
          <DocumentTabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onCloseTab={closeTab}
          />
        ))}
      </div>
      {canScrollRight ? (
        <TabsScrollButton
          label={previousTabsLabel}
          icon={ChevronRight}
          onClick={() => scrollTabsByPage(1)}
        />
      ) : null}
    </div>
  )
}

function DocumentTabItem({
  tab,
  isActive,
  onCloseTab,
}: {
  tab: DocumentTab
  isActive: boolean
  onCloseTab: (tab: DocumentTab) => void
}) {
  return (
    <div
      data-slot="document-tab"
      data-tab-id={tab.id}
      className={cn(
        'group flex h-8 w-64 shrink-0 items-center rounded-lg border pe-0.5 transition-colors',
        isActive
          ? 'border-border bg-white dark:border-input dark:bg-input/30'
          : 'border-transparent hover:bg-black/5 dark:hover:bg-white/10',
      )}
    >
      <TooltipProvider
        delayDuration={tabTitleTooltipDelay}
        skipDelayDuration={0}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/documents/$documentId"
              params={{ documentId: String(tab.id) }}
              className={cn(
                'min-w-0 flex-auto truncate rounded-md px-1.5 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground group-hover:text-foreground',
              )}
            >
              {tab.title}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            {tab.title}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={closeTabLabel}
            onClick={() => onCloseTab(tab)}
          >
            <X />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{closeTabLabel}</TooltipContent>
      </Tooltip>
    </div>
  )
}

export { DocumentTabs, DocumentTabsProvider }
