import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  editorScrollTarget,
  imageBubbleMenuAnchor,
  imagePosition,
  selectedImagePosition,
} from '@/lib/image'
import { PluginKey } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'

const imageBubbleMenuKey = new PluginKey('imageBubbleMenu')
const hideDelay = 150

function DocumentImageMenu({ editor }: { editor: Editor | null }) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const hoveredImageRef = useRef<HTMLImageElement | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  const clearHideTimer = useCallback((): void => {
    if (hideTimerRef.current === null) {
      return
    }

    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
  }, [])

  const hideMenu = useCallback((): void => {
    clearHideTimer()
    hoveredImageRef.current = null

    if (editor === null || editor.isDestroyed) {
      return
    }

    if (selectedImagePosition(editor.view) !== null) {
      editor.view.dispatch(
        editor.state.tr.setMeta(imageBubbleMenuKey, 'updatePosition'),
      )
      return
    }

    editor.view.dispatch(editor.state.tr.setMeta(imageBubbleMenuKey, 'hide'))
  }, [clearHideTimer, editor])

  const scheduleHide = useCallback((): void => {
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(hideMenu, hideDelay)
  }, [clearHideTimer, hideMenu])

  const revealMenu = useCallback((): void => {
    if (editor === null || editor.isDestroyed) {
      return
    }

    const menu = menuRef.current

    if (menu !== null && !menu.isConnected) {
      editor.view.dispatch(editor.state.tr.setMeta(imageBubbleMenuKey, 'hide'))
    }

    editor.view.dispatch(editor.state.tr.setMeta(imageBubbleMenuKey, 'show'))
    editor.view.dispatch(
      editor.state.tr.setMeta(imageBubbleMenuKey, 'updatePosition'),
    )
  }, [editor])

  const showMenu = useCallback(
    (image: HTMLImageElement): void => {
      clearHideTimer()
      hoveredImageRef.current = image
      revealMenu()
    },
    [clearHideTimer, revealMenu],
  )

  useEffect(() => {
    if (editor === null) {
      return
    }

    const editorDom = editor.view.dom
    const scrollTarget = editorScrollTarget(editorDom)

    const handleMouseOver = (event: MouseEvent): void => {
      if (event.target instanceof HTMLImageElement) {
        showMenu(event.target)
      }
    }

    const handleMouseOut = (event: MouseEvent): void => {
      if (event.target instanceof HTMLImageElement) {
        scheduleHide()
      }
    }

    const handleScroll = (): void => {
      if (editor.isDestroyed) {
        return
      }

      editor.view.dispatch(
        editor.state.tr.setMeta(imageBubbleMenuKey, 'updatePosition'),
      )
    }

    const handleImageLoad = (event: Event): void => {
      if (!(event.target instanceof HTMLImageElement) || editor.isDestroyed) {
        return
      }

      editor.view.dispatch(
        editor.state.tr.setMeta(imageBubbleMenuKey, 'updatePosition'),
      )
    }

    const handleBlur = (): void => {
      clearHideTimer()
      hoveredImageRef.current = null
    }

    editorDom.addEventListener('mouseover', handleMouseOver)
    editorDom.addEventListener('mouseout', handleMouseOut)
    editorDom.addEventListener('load', handleImageLoad, true)
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true })
    editor.on('blur', handleBlur)

    const revealFrame = window.requestAnimationFrame(() => {
      if (selectedImagePosition(editor.view) !== null) {
        revealMenu()
      }
    })

    return () => {
      window.cancelAnimationFrame(revealFrame)
      clearHideTimer()
      editorDom.removeEventListener('mouseover', handleMouseOver)
      editorDom.removeEventListener('mouseout', handleMouseOut)
      editorDom.removeEventListener('load', handleImageLoad, true)
      scrollTarget.removeEventListener('scroll', handleScroll)
      editor.off('blur', handleBlur)
    }
  }, [clearHideTimer, editor, revealMenu, scheduleHide, showMenu])

  if (editor === null) {
    return null
  }

  const referenceImage = () => {
    const hoveredImage = hoveredImageRef.current

    if (hoveredImage !== null && hoveredImage.isConnected) {
      return imageBubbleMenuAnchor(hoveredImage)
    }

    const position = selectedImagePosition(editor.view)

    if (position === null) {
      return null
    }

    const image = editor.view.nodeDOM(position)

    return image instanceof HTMLElement ? imageBubbleMenuAnchor(image) : null
  }

  const deleteImage = (): void => {
    const hoveredImage = hoveredImageRef.current
    const position =
      hoveredImage !== null && hoveredImage.isConnected
        ? imagePosition(editor.view, hoveredImage)
        : selectedImagePosition(editor.view)

    if (position === null) {
      return
    }

    hoveredImageRef.current = null
    editor.chain().focus().setNodeSelection(position).deleteSelection().run()
    editor.view.dispatch(editor.state.tr.setMeta(imageBubbleMenuKey, 'hide'))
  }

  return (
    <BubbleMenu
      ref={menuRef}
      editor={editor}
      pluginKey={imageBubbleMenuKey}
      updateDelay={0}
      shouldShow={({ editor: currentEditor }) => {
        const hoveredImage = hoveredImageRef.current

        return (
          (hoveredImage !== null && hoveredImage.isConnected) ||
          selectedImagePosition(currentEditor.view) !== null
        )
      }}
      getReferencedVirtualElement={referenceImage}
      options={{ placement: 'bottom-start', offset: 0, flip: false }}
      dir="rtl"
      data-slot="image-bubble-menu"
      className="rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
      onMouseEnter={clearHideTimer}
      onMouseLeave={scheduleHide}
    >
      <div className="flex items-center gap-1.5 p-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              aria-label="حذف تصویر"
              onMouseDown={(event) => event.preventDefault()}
              onClick={deleteImage}
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>حذف تصویر</TooltipContent>
        </Tooltip>
      </div>
    </BubbleMenu>
  )
}

export { DocumentImageMenu }
