import { useState, useRef, useEffect, useCallback } from 'react'
import { Sidebar as SidebarIcon, Baby, CalendarStar, ArrowSquareOut, Images, Files, Pen, Microphone, GoogleLogo, MicrosoftOutlookLogo, AppleLogo } from '@phosphor-icons/react'
import type { SessionListItem } from '../sessions'
import type { InputType } from '../sessions'
import { ICON_MAP } from './iconMap'
import { Account } from './Account'
import { MenuButton } from './MenuButton'
import Skeleton from 'react-loading-skeleton'
import { SkeletonSessionGroup } from '../components/skeletons'
import { TypingText } from '../components/TypingText'
import { useAuth } from '../auth/AuthContext'
import { Tooltip } from '../components/Tooltip'
import { Logo } from '../components/Logo'
import './Menu.css'

interface MenuProps {
  isOpen: boolean
  onToggle: () => void
  sessions: SessionListItem[]
  currentSessionId?: string
  onSessionClick: (sessionId: string) => void
  onNewSession: () => void
  /** Whether sessions are currently loading */
  isLoadingSessions?: boolean
}

export function Menu({
  isOpen,
  onToggle,
  sessions,
  currentSessionId,
  onSessionClick,
  onNewSession,
  isLoadingSessions = false,
}: MenuProps) {
  const { user, primaryCalendarProvider } = useAuth()

  // Track sessions whose titles should animate (arrived while processing)
  const [animatingTitles, setAnimatingTitles] = useState<Set<string>>(new Set())
  const prevTitlesRef = useRef<Map<string, string | undefined>>(new Map())

  useEffect(() => {
    const prev = prevTitlesRef.current
    const newAnimating = new Set(animatingTitles)

    for (const session of sessions) {
      const prevTitle = prev.get(session.id)
      // Animate if title just appeared on a previously-processing session
      if (session.title && !prevTitle && prev.has(session.id)) {
        newAnimating.add(session.id)
      }
      prev.set(session.id, session.title)
    }

    if (newAnimating.size !== animatingTitles.size) {
      setAnimatingTitles(newAnimating)
    }
  }, [sessions])

  const handleTitleAnimationComplete = useCallback((sessionId: string) => {
    setAnimatingTitles(prev => {
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
  }, [])

  // Derive effective provider: prefer explicit primary, fall back to auth provider
  const rawAuthProvider = user?.app_metadata?.provider
  const authProvider = rawAuthProvider === 'azure' ? 'microsoft' : rawAuthProvider
  const primaryProvider = (primaryCalendarProvider || authProvider) as 'google' | 'microsoft' | 'apple' | null

  // Get calendar URL based on provider
  const getCalendarUrl = () => {
    switch (primaryProvider) {
      case 'microsoft':
        return 'https://outlook.office.com/calendar'
      case 'apple':
        return 'https://www.icloud.com/calendar'
      case 'google':
      default:
        return 'https://calendar.google.com'
    }
  }

  // Get calendar icon based on provider
  const getCalendarIcon = () => {
    switch (primaryProvider) {
      case 'microsoft':
        return <MicrosoftOutlookLogo size={20} weight="duotone" />
      case 'apple':
        return <AppleLogo size={20} weight="duotone" />
      case 'google':
      default:
        return <GoogleLogo size={20} weight="duotone" />
    }
  }

  // Get icon for input type (matches input area icons)
  const getInputIcon = (inputType: InputType) => {
    switch (inputType) {
      case 'image':
        return Images
      case 'document':
        return Files
      case 'audio':
        return Microphone
      case 'text':
        return Pen
      default:
        return Files
    }
  }

  // Group sessions by time period
  const groupSessionsByTime = (sessions: SessionListItem[]) => {
    const now = new Date()
    const groups: { [key: string]: SessionListItem[] } = {
      'Today': [],
      'Yesterday': [],
      '7 Days': [],
      '30 Days': [],
      'Older': [],
    }

    sessions.forEach((session) => {
      const daysDiff = Math.floor(
        (now.getTime() - session.timestamp.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (daysDiff === 0) {
        groups['Today'].push(session)
      } else if (daysDiff === 1) {
        groups['Yesterday'].push(session)
      } else if (daysDiff <= 7) {
        groups['7 Days'].push(session)
      } else if (daysDiff <= 30) {
        groups['30 Days'].push(session)
      } else {
        groups['Older'].push(session)
      }
    })

    // Remove empty groups
    return Object.entries(groups).filter(([_, sessions]) => sessions.length > 0)
  }

  const groupedSessions = groupSessionsByTime(sessions)

  return (
    <>
      {/* Workspace mark logo - visible when sidebar is closed */}
      <button
        className={`workspace-mark-logo ${isOpen ? 'hidden' : ''}`}
        onClick={onToggle}
        title="DropCal"
      >
        <Logo size={32} />
      </button>

      {/* Dock when sidebar is closed */}
      {!isOpen && (
        <div className="sidebar-dock">
          <Tooltip content="Expand sidebar">
            <button className="dock-icon-button" onClick={onToggle}>
              <SidebarIcon size={20} weight="duotone" />
            </button>
          </Tooltip>
          <Tooltip content="Start new session">
            <button className="dock-icon-button" onClick={onNewSession}>
              <CalendarStar size={20} weight="duotone" />
            </button>
          </Tooltip>
        </div>
      )}

      {/* Sidebar that slides in next to the mark */}
      <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        {/* Menu mark logo - visible when sidebar is open */}
        <button
          className={`menu-mark-logo ${isOpen ? '' : 'hidden'}`}
          onClick={onToggle}
          title="DropCal"
        >
          <Logo size={32} />
        </button>

        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span className="display-text word-logo-text">dropcal</span>
          </div>
          <Tooltip content="Close sidebar">
            <button className="sidebar-toggle" onClick={onToggle}>
              <SidebarIcon size={20} weight="duotone" />
            </button>
          </Tooltip>
        </div>

        <div className="sidebar-content">
          <Tooltip content="Start new session">
            <MenuButton
              onClick={onNewSession}
              icon={<CalendarStar size={20} weight="duotone" />}
              variant="primary"
            >
              Start new
            </MenuButton>
          </Tooltip>

          {primaryProvider && (
            <MenuButton
              onClick={() => window.open(getCalendarUrl(), '_blank')?.focus()}
              icon={getCalendarIcon()}
              trailingIcon={<ArrowSquareOut size={14} weight="regular" />}
              variant="secondary"
            >
              View calendar
            </MenuButton>
          )}

          <div className="chat-history">
            {isLoadingSessions ? (
              // Loading state - show single continuous skeleton list
              <SkeletonSessionGroup count={8} showLabel={false} />
            ) : groupedSessions.length === 0 ? (
              <div className="empty-state">
                <Baby size={40} weight="duotone" className="empty-state-icon" />
                <p>No sessions yet</p>
                <p className="empty-state-hint">Drop files or text to get started</p>
              </div>
            ) : (
              groupedSessions.map(([period, periodSessions]) => (
                <div key={period} className="chat-group">
                  <div className="chat-group-label">{period}</div>
                  {periodSessions.map((session) => {
                    const ContentIcon = session.icon ? ICON_MAP[session.icon] : null
                    const FallbackIcon = getInputIcon(session.inputType)
                    const DisplayIcon = ContentIcon || FallbackIcon
                    return (
                      <div
                        key={session.id}
                        className={`chat-entry ${
                          session.id === currentSessionId ? 'active' : ''
                        } ${session.status === 'processing' ? 'processing' : ''}`}
                        onClick={() => onSessionClick(session.id)}
                      >
                        <DisplayIcon size={16} weight="regular" className="chat-entry-icon" />
                        <span className="chat-entry-title">
                          {animatingTitles.has(session.id) ? (
                            <TypingText
                              text={session.title}
                              speed={25}
                              onComplete={() => handleTitleAnimationComplete(session.id)}
                            />
                          ) : session.title ? session.title : (
                            <Skeleton width="70%" height={14} borderRadius={4} />
                          )}
                        </span>
                        {session.status === 'processing' && session.eventCount === 0 ? (
                          <span className="processing-indicator" />
                        ) : session.eventCount > 0 ? (
                          <span className={`event-count-badge ${session.addedToCalendar ? '' : 'unsynced'}`}>{session.eventCount}</span>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        <Account />
      </div>
    </>
  )
}
