'use client'

import * as React from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * The thin bar across the top of the window while a page is being fetched.
 *
 * Server-rendered pages are fast but not instant, and the gap between clicking a
 * link and the page changing is the moment an application feels broken. This
 * closes it without the page having to do anything: navigation is detected from
 * the click, and finished when the route actually changes.
 *
 * There is no router event to subscribe to in the App Router, so:
 *
 * - a capture-phase click on any internal `<a>` starts it;
 * - a change in pathname or query string finishes it;
 * - `startNavigationProgress()` is exported for code that calls `router.push`
 *   itself, which no click would have caught.
 *
 * It only appears after 120 ms. A navigation that resolves faster than that
 * would otherwise produce a flash of bar, which reads as slower than no bar.
 */
const listeners = new Set<() => void>()

export function startNavigationProgress() {
  for (const listener of listeners) listener()
}

function ProgressBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = React.useState(false)
  const [width, setWidth] = React.useState(0)

  const timers = React.useRef<{ show?: ReturnType<typeof setTimeout>; creep?: ReturnType<typeof setInterval> }>({})

  const stop = React.useCallback(() => {
    clearTimeout(timers.current.show)
    clearInterval(timers.current.creep)
    setVisible((wasVisible) => {
      if (wasVisible) {
        setWidth(100)
        setTimeout(() => setWidth(0), 220)
      }
      return false
    })
  }, [])

  const start = React.useCallback(() => {
    clearTimeout(timers.current.show)
    clearInterval(timers.current.creep)

    timers.current.show = setTimeout(() => {
      setVisible(true)
      setWidth(12)
      // Ease towards 90% and stop. The bar never claims to be finished before
      // the page is; the last tenth is the arrival.
      timers.current.creep = setInterval(() => {
        setWidth((current) => (current >= 90 ? current : current + (90 - current) * 0.12))
      }, 180)
    }, 120)
  }, [])

  React.useEffect(() => {
    listeners.add(start)
    return () => {
      listeners.delete(start)
    }
  }, [start])

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
        return
      }

      const anchor = (event.target as HTMLElement | null)?.closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href || anchor.target === '_blank' || anchor.hasAttribute('download')) return

      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      // Same page, or only a hash: nothing is being fetched.
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) {
        return
      }

      start()
    }

    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [start])

  // The route changed, so whatever was loading has arrived. Finished on the next
  // frame rather than in the effect body: the new page has painted by then, which
  // is the moment the bar is actually describing.
  React.useEffect(() => {
    const frame = requestAnimationFrame(stop)
    return () => cancelAnimationFrame(frame)
  }, [pathname, searchParams, stop])

  if (width === 0) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className="h-full bg-primary transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${width}%`, opacity: visible || width === 100 ? 1 : 0 }}
      />
    </div>
  )
}

export function NavigationProgress() {
  // useSearchParams suspends during prerender; the bar has nothing to show then.
  return (
    <React.Suspense fallback={null}>
      <ProgressBar />
    </React.Suspense>
  )
}
