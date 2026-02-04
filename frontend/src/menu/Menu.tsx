import { PlusCircle, SidebarSimple as SidebarIcon, CalendarBlank, ArrowSquareOut, Images, Files, Pen, Microphone } from '@phosphor-icons/react'
import type { SessionListItem } from '../sessions'
import type { InputType } from '../sessions'
import { Account } from './Account'
import { MenuButton } from './MenuButton'
import { SkeletonSessionGroup } from '../components/skeletons'
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
          <button className="dock-icon-button" onClick={onToggle} title="Expand sidebar">
            <SidebarIcon size={20} weight="regular" />
          </button>
          <button className="dock-icon-button" onClick={onNewSession} title="Start new">
            <PlusCircle size={20} weight="regular" />
          </button>
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
          <button className="sidebar-toggle" onClick={onToggle}>
            <SidebarIcon size={20} weight="regular" />
          </button>
        </div>

        <div className="sidebar-content">
          <MenuButton
            onClick={onNewSession}
            icon={<PlusCircle size={16} weight="bold" />}
            variant="primary"
          >
            Start new
          </MenuButton>

          <MenuButton
            onClick={() => window.open('https://calendar.google.com', '_blank')?.focus()}
            icon={<CalendarBlank size={16} weight="bold" />}
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
