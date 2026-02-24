import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import './BottomDrawer.css'

interface BottomDrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export function BottomDrawer({ isOpen, onClose, title, children }: BottomDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startY: number; currentY: number; dragging: boolean; hasMoved: boolean }>({
    startY: 0, currentY: 0, dragging: false, hasMoved: false,
  })

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isOpen])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragState.current.startY = e.touches[0].clientY
    dragState.current.currentY = e.touches[0].clientY
    dragState.current.dragging = true
    dragState.current.hasMoved = false
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragState.current.dragging || !panelRef.current) return
    const currentY = e.touches[0].clientY
    const deltaY = currentY - dragState.current.startY
    dragState.current.currentY = currentY

    // Only start dragging after threshold to avoid interfering with taps
    if (deltaY > 10) {
      dragState.current.hasMoved = true
      panelRef.current.style.transform = `translateY(${deltaY}px)`
      panelRef.current.style.transition = 'none'
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (!dragState.current.dragging || !panelRef.current) return
    dragState.current.dragging = false

    if (!dragState.current.hasMoved) return

    const deltaY = dragState.current.currentY - dragState.current.startY
    panelRef.current.style.transition = ''

    if (deltaY > 100) {
      // Dismiss — animate out then close
      panelRef.current.style.transform = 'translateY(100%)'
      panelRef.current.style.transition = 'transform 0.2s ease'
      setTimeout(onClose, 200)
    } else {
      // Snap back
      panelRef.current.style.transform = ''
    }
  }, [onClose])

  const handleBackdropPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  if (!isOpen) return null

  return createPortal(
    <div className="drawer-backdrop" onPointerDown={handleBackdropPointerDown} onClick={e => e.stopPropagation()}>
      <div
        className="drawer-panel"
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="drawer-handle" />
        {title && <div className="drawer-title">{title}</div>}
        <div className="drawer-content">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
