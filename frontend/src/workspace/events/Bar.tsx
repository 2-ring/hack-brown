import { motion, AnimatePresence } from 'framer-motion'
import { FirstAid as FirstAidIcon, CheckFat as CheckIcon, ChatCircleDots as ChatIcon, PaperPlaneTilt as SendIcon, CalendarStar as CalendarStarIcon } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'
import type { LoadingStateConfig } from './types'
import { CalendarSelector } from './CalendarSelector'
import { Tooltip } from '../../components/Tooltip'

// ============================================================================
// TOP BAR
// ============================================================================

interface TopBarProps {
  wordmarkImage: string
  eventCount: number
  isLoading: boolean
  expectedEventCount?: number
  isLoadingCalendars?: boolean
  isEditingEvent?: boolean
  isScrollable?: boolean
}

export function TopBar({
  wordmarkImage,
  eventCount,
  isLoading,
  expectedEventCount,
  isLoadingCalendars = false,
  isEditingEvent = false,
  isScrollable = true
}: TopBarProps) {
  return (
    <div className={`event-confirmation-header ${!isScrollable ? 'no-scroll' : ''}`}>
      <div className="event-confirmation-header-content">
        <div className="header-left">
          <CalendarSelector isLoading={isLoadingCalendars} isMinimized={isEditingEvent} />
        </div>
        <div className="header-center">
          <img src={wordmarkImage} alt="DropCal" className="header-wordmark" />
        </div>
        <div className="header-right">
          {isLoading && expectedEventCount === undefined ? (
            <Skeleton width={80} height={20} />
          ) : (
            <span>
              {isLoading ? expectedEventCount : eventCount} {(isLoading ? expectedEventCount : eventCount) === 1 ? 'event' : 'events'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// BOTTOM BAR
// ============================================================================

interface BottomBarProps {
  isLoading: boolean
  loadingConfig?: LoadingStateConfig[]
  isEditingEvent: boolean
  isChatExpanded: boolean
  changeRequest: string
  isProcessingEdit: boolean
  onCancel: () => void
  onRequestChanges: () => void
  onChangeRequestChange: (value: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onConfirm?: () => void
  isScrollable?: boolean
}

export function BottomBar({
  isLoading,
  loadingConfig = [],
  isEditingEvent,
  isChatExpanded,
  changeRequest,
  isProcessingEdit,
  onCancel,
  onRequestChanges,
  onChangeRequestChange,
  onSend,
  onKeyDown,
  onConfirm,
  isScrollable = true
}: BottomBarProps) {

  // Determine the current view state
  const getViewState = () => {
    if (isLoading) return 'loading'
    if (isEditingEvent && isChatExpanded) return 'editing-chat'
    if (isEditingEvent) return 'editing'
    if (isChatExpanded) return 'chat'
    return 'default'
  }

  const viewState = getViewState()

  return (
    <div className={`event-confirmation-footer-overlay ${!isScrollable ? 'no-scroll' : ''}`}>
      <div className="event-confirmation-footer">
        {viewState === 'loading' ? (
          /* Loading Progress */
          <div className="loading-progress-container">
            <div className="loading-progress-steps">
              {loadingConfig.map((step, index) => {
                const IconComponent = step.icon
                return (
                  <motion.div
                    key={index}
                    className="loading-progress-step"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    {IconComponent && (
                      <div className="loading-progress-icon">
                        <IconComponent size={20} weight="duotone" />
                      </div>
                    )}
                    <div className="loading-progress-text">
                      <div className="loading-progress-message">
                        {step.message}
                      </div>
                      {step.submessage && (
                        <div className="loading-progress-submessage">{step.submessage}</div>
                      )}
                    </div>
                    {step.count && (
                      <div className="loading-progress-count">{step.count}</div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </div>
        ) : (
          /* Interactive Bar */
          <div className="event-confirmation-footer-row">
            <AnimatePresence mode="wait">
              <motion.div
                key={viewState}
                className="event-confirmation-footer-content"
                initial={{ y: 20, scale: 0.95, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={{ y: -20, scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                {viewState === 'editing' ? (
                  /* Edit Mode: Cancel + Request Changes + Save */
                  <>
                    <Tooltip content="Cancel">
                      <button
                        className="event-confirmation-icon-button cancel"
                        onClick={onCancel}
                      >
                        <FirstAidIcon size={20} weight="duotone" style={{ transform: 'rotate(45deg)' }} />
                      </button>
                    </Tooltip>
                    <button
                      className="event-confirmation-request-button"
                      onClick={onRequestChanges}
                    >
                      <ChatIcon size={18} weight="bold" />
                      <span>Request changes</span>
                    </button>
                    <Tooltip content="Save changes">
                      <button
                        className="event-confirmation-icon-button confirm"
                        onClick={onCancel}
                      >
                        <CheckIcon size={24} weight="bold" />
                      </button>
                    </Tooltip>
                  </>
                ) : viewState === 'editing-chat' ? (
                  /* Edit Mode with Chat: Cancel + Input + Send */
                  <>
                    <Tooltip content="Back to edit">
                      <button
                        className="event-confirmation-icon-button cancel"
                        onClick={onCancel}
                      >
                        <FirstAidIcon size={20} weight="duotone" style={{ transform: 'rotate(45deg)' }} />
                      </button>
                    </Tooltip>
                    <div className="event-confirmation-chat-input-wrapper">
                      <input
                        type="text"
                        className="event-confirmation-chat-input"
                        placeholder="Request changes..."
                        value={changeRequest}
                        onChange={(e) => onChangeRequestChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        autoFocus
                      />
                    </div>
                    <Tooltip content="Send">
                      <button
                        className="event-confirmation-icon-button send"
                        onClick={onSend}
                        disabled={!changeRequest.trim() || isProcessingEdit}
                      >
                        <SendIcon size={22} weight="fill" />
                      </button>
                    </Tooltip>
                  </>
                ) : viewState === 'chat' ? (
                  /* Chat Expanded: Cancel + Input + Send */
                  <>
                    <Tooltip content="Cancel">
                      <button
                        className="event-confirmation-icon-button cancel"
                        onClick={onCancel}
                      >
                        <FirstAidIcon size={20} weight="duotone" style={{ transform: 'rotate(45deg)' }} />
                      </button>
                    </Tooltip>
                    <div className="event-confirmation-chat-input-wrapper">
                      <input
                        type="text"
                        className="event-confirmation-chat-input"
                        placeholder="Request changes..."
                        value={changeRequest}
                        onChange={(e) => onChangeRequestChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        autoFocus
                      />
                    </div>
                    <Tooltip content="Send">
                      <button
                        className="event-confirmation-icon-button send"
                        onClick={onSend}
                        disabled={!changeRequest.trim() || isProcessingEdit}
                      >
                        <SendIcon size={22} weight="fill" />
                      </button>
                    </Tooltip>
                  </>
                ) : (
                  /* Default: Request Changes + Confirm */
                  <>
                    <button
                      className="event-confirmation-request-button"
                      onClick={onRequestChanges}
                    >
                      <ChatIcon size={18} weight="bold" />
                      <span>Request changes</span>
                    </button>
                    {onConfirm && (
                      <Tooltip content="Create events">
                        <button
                          className="event-confirmation-icon-button confirm"
                          onClick={onConfirm}
                        >
                          <CalendarStarIcon size={24} weight="duotone" />
                        </button>
                      </Tooltip>
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
