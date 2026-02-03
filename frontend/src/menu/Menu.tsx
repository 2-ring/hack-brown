import { PlusCircle, Sidebar as SidebarIcon, CalendarBlank, ArrowSquareOut, Images, Files, Pen, Microphone } from '@phosphor-icons/react'
import type { SessionListItem } from '../sessions'
import type { InputType } from '../sessions'
import './Menu.css'
import logoImage from '../assets/Logo.png'
import wordmarkImage from '../assets/Wordmark.png'

interface MenuProps {
  isOpen: boolean
  onToggle: () => void
  sessions: SessionListItem[]
  currentSessionId?: string
  onSessionClick: (sessionId: string) => void
  onNewSession: () => void
}

export function Menu({
  isOpen,
  onToggle,
  sessions,
  currentSessionId,
  onSessionClick,
  onNewSession,
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
      <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src={wordmarkImage} alt="DropCal" className="wordmark-logo" />
          </div>
          <button className="sidebar-toggle" onClick={onToggle}>
            <SidebarIcon size={20} weight="regular" />
          </button>
        </div>

        <div className="sidebar-content">
          <button className="new-chat-button" onClick={onNewSession}>
            <PlusCircle size={16} weight="bold" />
            <span>New events</span>
          </button>

          <button
            className="view-calendar-button"
            onClick={() => window.open('https://calendar.google.com', '_blank')?.focus()}
          >
            <CalendarBlank size={16} weight="bold" />
            <span>View calendar</span>
            <ArrowSquareOut size={14} weight="regular" />
          </button>

          <div className="chat-history">
            {groupedSessions.length === 0 ? (
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
      </div>

      {/* Logo and dock when sidebar is closed */}
      {!isOpen && (
        <>
          <button className="floating-logo" onClick={onToggle} title="DropCal">
            <img src={logoImage} alt="DropCal" className="floating-logo-icon" />
          </button>
          <div className="sidebar-dock">
            <button className="dock-icon-button" onClick={onToggle} title="Expand sidebar">
              <SidebarIcon size={20} weight="regular" />
            </button>
            <button className="dock-icon-button" onClick={onNewSession} title="New events">
              <PlusCircle size={20} weight="regular" />
            </button>
          </div>
        </>
      )}
    </>
  )
}
