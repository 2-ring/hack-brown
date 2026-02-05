import { useState, useEffect } from 'react'
import { PlusCircle, SidebarSimple as SidebarIcon, CalendarBlank, CalendarStar, ArrowSquareOut, Images, Files, Pen, Microphone, CaretCircleLeft, GoogleLogo, MicrosoftOutlookLogo, AppleLogo } from '@phosphor-icons/react'
import type { SessionListItem } from '../sessions'
import type { InputType } from '../sessions'
import { Account } from './Account'
import { MenuButton } from './MenuButton'
import { SkeletonSessionGroup } from '../components/skeletons'
import { getCalendarProviders } from '../api/backend-client'
import { Tooltip } from '../components/Tooltip'
import './Menu.css'
import markImage from '../assets/Mark.png'
import wordImage from '../assets/Word.png'

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
  // State for primary calendar provider
  const [primaryProvider, setPrimaryProvider] = useState<'google' | 'microsoft' | 'apple' | null>(null)

  // Fetch primary calendar provider on mount
  useEffect(() => {
    const fetchPrimaryProvider = async () => {
      try {
        const response = await getCalendarProviders()
        const primary = response.providers.find(p => p.is_primary && p.connected)
        if (primary) {
          setPrimaryProvider(primary.provider as 'google' | 'microsoft' | 'apple')
        } else {
          // Default to Google if no primary provider is set
          setPrimaryProvider('google')
        }
      } catch (error) {
        console.error('Failed to fetch calendar providers:', error)
        // Default to Google on error
        setPrimaryProvider('google')
      }
    }

    fetchPrimaryProvider()
  }, [])

  // Get calendar URL based on provider
  const getCalendarUrl = () => {
    switch (primaryProvider) {
      case 'google':
        return 'https://calendar.google.com'
      case 'microsoft':
        return 'https://outlook.office.com/calendar'
      case 'apple':
        return 'https://www.icloud.com/calendar'
      default:
        return 'https://calendar.google.com'
    }
  }

  // Get calendar icon based on provider
  const getCalendarIcon = () => {
    switch (primaryProvider) {
      case 'google':
        return <GoogleLogo size={20} weight="duotone" />
      case 'microsoft':
        return <MicrosoftOutlookLogo size={20} weight="duotone" />
      case 'apple':
        return <AppleLogo size={20} weight="duotone" />
      default:
        return <CalendarBlank size={20} weight="duotone" />
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
        <img src={markImage} alt="DropCal Mark" />
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
          <img src={markImage} alt="DropCal Mark" />
        </button>

        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src={wordImage} alt="DropCal" className="word-logo" />
          </div>
          <Tooltip content="Close sidebar">
            <button className="sidebar-toggle" onClick={onToggle}>
              <SidebarIcon size={20} weight="duotone" className="sidebar-icon" />
              <CaretCircleLeft size={20} weight="duotone" className="sidebar-chevron" />
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

          <MenuButton
            onClick={() => window.open(getCalendarUrl(), '_blank')?.focus()}
            icon={getCalendarIcon()}
            trailingIcon={<ArrowSquareOut size={14} weight="regular" />}
            variant="secondary"
          >
            View calendar
          </MenuButton>

          <div className="chat-history">
            {isLoadingSessions ? (
              // Loading state - show single continuous skeleton list
              <SkeletonSessionGroup count={8} showLabel={false} />
            ) : groupedSessions.length === 0 ? (
              <div className="empty-state">
                <p>No sessions yet</p>
                <p className="empty-state-hint">Drop files or text to get started</p>
              </div>
            ) : (
              groupedSessions.map(([period, periodSessions]) => (
                <div key={period} className="chat-group">
                  <div className="chat-group-label">{period}</div>
                  {periodSessions.map((session) => {
                    const InputIcon = getInputIcon(session.inputType)
                    return (
                      <div
                        key={session.id}
                        className={`chat-entry ${
                          session.id === currentSessionId ? 'active' : ''
                        } ${session.status === 'error' ? 'error' : ''}`}
                        onClick={() => onSessionClick(session.id)}
                      >
                        <InputIcon size={16} weight="regular" className="chat-entry-icon" />
                        <span className="chat-entry-title">{session.title}</span>
                        {session.eventCount > 0 && (
                          <span className="event-count-badge">{session.eventCount}</span>
                        )}
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
