import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { airCamera } from '../animation/airCamera'

type ElementRef<T> = RefObject<T | null>

export function useStoryMotion(track: ElementRef<HTMLElement>, camera: ElementRef<HTMLDivElement>, visual: ElementRef<HTMLDivElement>, image: ElementRef<HTMLDivElement>, copy: ElementRef<HTMLDivElement>, reduced: boolean) {
  const [phase, setPhase] = useState(0)
  const goToRef = useRef<(index: number) => void>(() => { })
  const goTo = useCallback((index: number) => goToRef.current(index), [])

  useEffect(() => {
    if (reduced) return
    const root = document.documentElement
    let visualFrame = 0, animationFrame = 0
    let animating = false
    let lastWheel = -Infinity
    let touchX = 0, touchY = 0, touchEndX = 0, touchEndY = 0
    let touchActive = false
    let targetIndex = 0
    let measuredHeight = 0
    let settledIndex = 0
    let previousScroll = window.scrollY
    const excluded = (target: EventTarget | null) => target instanceof Element && !!target.closest('dialog, input, textarea, select, [contenteditable="true"]')
    const positions = () => {
      const header = window.innerWidth <= 760 ? 72 : 80
      const height = camera.current?.clientHeight || window.innerHeight - header
      const start = (track.current?.getBoundingClientRect().top || header) + window.scrollY - header
      return { header, height, start, end: start + height * 5 }
    }
    const update = () => {
      visualFrame = 0
      if (!track.current || !camera.current || !visual.current || !image.current || !copy.current) return
      const { height, start, end } = positions()
      if (!measuredHeight || Math.abs(height - measuredHeight) <= 1) {
        settledIndex = Math.max(0, Math.min(5, Math.round((window.scrollY - start) / height)))
        previousScroll = window.scrollY
      }
      const progress = Math.max(0, Math.min(1, (window.scrollY - start) / (height * 4)))
      const mobile = window.innerWidth <= 760 || (window.innerWidth <= 900 && window.innerHeight <= 520)
      const pose = airCamera(progress, mobile)
      const frameWidth = visual.current.clientWidth
      const frameHeight = visual.current.clientHeight
      const sceneHeight = Math.max(frameWidth / 1.5, frameHeight) * pose.zoom
      const sceneWidth = sceneHeight * 1.5
      const focusX = frameWidth * (mobile ? .5 : .74)
      const focusY = frameHeight * .5
      const x = Math.min(0, Math.max(frameWidth - sceneWidth, focusX - pose.x * sceneWidth))
      const y = Math.min(0, Math.max(frameHeight - sceneHeight, focusY - pose.y * sceneHeight))
      image.current.style.width = `${sceneWidth}px`
      image.current.style.height = `${sceneHeight}px`
      image.current.style.left = '0px'
      image.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
      copy.current.querySelectorAll<HTMLElement>('.story-copy').forEach((element, index) => {
        const opacity = Math.max(0, 1 - Math.abs(progress * 4 - index) * 2.4)
        element.style.opacity = String(opacity)
        element.style.transform = `translateY(${(1 - opacity) * 24}px)`
        element.style.visibility = opacity > 0 ? 'visible' : 'hidden'
      })
      setPhase(Math.round(progress * 4))
      root.classList.toggle('snap-home', !mobile && !animating && window.scrollY < end - 2)
    }
    const schedule = () => { if (!visualFrame) visualFrame = requestAnimationFrame(update) }
    const animateTo = (index: number) => {
      if (animating) return
      targetIndex = Math.max(0, Math.min(5, index))
      const { start, height } = positions()
      const target = Math.min(document.documentElement.scrollHeight - window.innerHeight, Math.max(0, start + targetIndex * height))
      const from = window.scrollY
      if (Math.abs(target - from) < 1) return
      animating = true
      root.classList.remove('snap-home')
      const began = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - began) / 780)
        const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        window.scrollTo({ top: from + (target - from) * eased, behavior: 'instant' })
        update()
        if (t < 1) animationFrame = requestAnimationFrame(step)
        else { animating = false; animationFrame = 0; update() }
      }
      animationFrame = requestAnimationFrame(step)
    }
    goToRef.current = animateTo
    const currentIndex = () => {
      const { start, height } = positions()
      return Math.max(0, Math.min(5, Math.round((window.scrollY - start) / height)))
    }
    const inside = () => {
      const { start, end } = positions()
      return window.scrollY >= start - 2 && window.scrollY <= end + 3
    }
    const canMove = (direction: number) => inside() && !(currentIndex() === 5 && direction > 0)
    const wheel = (event: WheelEvent) => {
      if (excluded(event.target) || Math.abs(event.deltaY) < Math.abs(event.deltaX) || event.ctrlKey || !canMove(Math.sign(event.deltaY))) return
      event.preventDefault()
      const now = performance.now(), previous = lastWheel
      lastWheel = now
      if (animating || now - previous < 170 || Math.abs(event.deltaY) < 4) return
      animateTo(currentIndex() + Math.sign(event.deltaY))
    }
    const touchStart = (event: TouchEvent) => {
      touchActive = event.touches.length === 1 && inside() && !excluded(event.target) && !(event.target instanceof Element && event.target.closest('.site-header'))
      if (!touchActive) return
      touchX = touchEndX = event.touches[0].clientX
      touchY = touchEndY = event.touches[0].clientY
    }
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) { touchActive = false; return }
      if (!touchActive) return
      touchEndX = event.touches[0].clientX
      touchEndY = event.touches[0].clientY
      const delta = touchY - touchEndY
      if (Math.abs(delta) > 8 && Math.abs(delta) > Math.abs(touchX - touchEndX) && canMove(Math.sign(delta)) && event.cancelable) event.preventDefault()
    }
    const touchEnd = () => {
      if (!touchActive) return
      touchActive = false
      const delta = touchY - touchEndY
      if (!animating && Math.abs(delta) > 35 && Math.abs(delta) > Math.abs(touchX - touchEndX) && canMove(Math.sign(delta))) animateTo(currentIndex() + Math.sign(delta))
    }
    const touchCancel = () => { touchActive = false }
    const resize = () => {
      const nextHeight = positions().height
      const wasInside = previousScroll >= positions().start - 2 && previousScroll <= positions().start + measuredHeight * 5 + 3
      if (measuredHeight && Math.abs(nextHeight - measuredHeight) > 1 && wasInside) {
        const index = animating ? targetIndex : settledIndex
        cancelAnimationFrame(animationFrame)
        animationFrame = 0
        animating = false
        root.classList.remove('snap-home')
        window.scrollTo({ top: positions().start + index * nextHeight, behavior: 'instant' })
      }
      measuredHeight = nextHeight
      schedule()
    }
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select, button, [contenteditable="true"]')) return
      const direction = ['ArrowDown', 'PageDown'].includes(event.key) || (event.key === ' ' && !event.shiftKey) ? 1 : ['ArrowUp', 'PageUp'].includes(event.key) || (event.key === ' ' && event.shiftKey) ? -1 : 0
      if (!direction || !canMove(direction)) return
      event.preventDefault()
      if (!animating) animateTo(currentIndex() + direction)
    }
    update()
    measuredHeight = positions().height
    const observer = new ResizeObserver(resize)
    if (camera.current) observer.observe(camera.current)
    if (visual.current) observer.observe(visual.current)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', resize)
    window.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('touchstart', touchStart, { passive: true })
    window.addEventListener('touchmove', touchMove, { passive: false })
    window.addEventListener('touchend', touchEnd)
    window.addEventListener('touchcancel', touchCancel)
    window.addEventListener('keydown', key)
    return () => {
      cancelAnimationFrame(visualFrame); cancelAnimationFrame(animationFrame)
      root.classList.remove('snap-home')
      observer.disconnect()
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', resize)
      window.removeEventListener('wheel', wheel); window.removeEventListener('touchstart', touchStart)
      window.removeEventListener('touchmove', touchMove); window.removeEventListener('touchend', touchEnd)
      window.removeEventListener('touchcancel', touchCancel)
      window.removeEventListener('keydown', key)
      goToRef.current = () => { }
    }
  }, [track, camera, visual, image, copy, reduced])
  return { phase, goTo }
}
