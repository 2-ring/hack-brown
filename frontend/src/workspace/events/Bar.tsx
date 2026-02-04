import { motion, AnimatePresence } from 'framer-motion'
import { FirstAid as FirstAidIcon, CheckFat as CheckIcon, ChatCircleDots as ChatIcon, PaperPlaneTilt as SendIcon, CalendarCheck as CalendarCheckIcon } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'
import type { LoadingStateConfig } from './types'
import { CalendarSelector } from './CalendarSelector'

// ============================================================================
// TOP BAR
// ============================================================================

interface TopBarProps {
  wordmarkImage: string
  eventCount: number
  isLoading: boolean
  expectedEventCount?: number
  isLoadingCalendars?: boolean
}

export function TopBar({
  wordmarkImage,
  eventCount,
  isLoading,
  expectedEventCount,
  isLoadingCalendars = false
}: TopBarProps) {
  return (
    <div className="event-confirmation-header">
      <div className="event-confirmation-header-content">
        <div className="header-left">
          <CalendarSelector isLoading={isLoadingCalendars} />
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
    <div className="event-confirmation-footer-overlay">
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
                        <IconComponent size={16} weight="bold" />
                      </div>
                    )}
                    <div className="loading-progress-text">
                      <div className="loading-progress-message" style={{ fontStyle: 'italic' }}>
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
                    <button
                      className="event-confirmation-icon-button cancel"
                      onClick={onCancel}
                      title="Cancel"
                    >
                      <FirstAidIcon size={20} weight="bold" style={{ transform: 'rotate(45deg)' }} />
                    </button>
                    <button
                      className="event-confirmation-request-button"
                      onClick={onRequestChanges}
                    >
                      <ChatIcon size={18} weight="bold" />
                      <span>Request changes</span>
                    </button>
                    <button
                      className="event-confirmation-icon-button confirm"
                      onClick={onCancel}
                      title="Save changes"
                    >
                      <CheckIcon size={24} weight="bold" />
                    </button>
                  </>
                ) : viewState === 'editing-chat' ? (
                  /* Edit Mode with Chat: Cancel + Input + Send */
                  <>
                    <button
                      className="event-confirmation-icon-button cancel"
                      onClick={onCancel}
                      title="Back to edit"
                    >
                      <FirstAidIcon size={20} weight="bold" style={{ transform: 'rotate(45deg)' }} />
                    </button>
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
                    <button
                      className="event-confirmation-icon-button send"
                      onClick={onSend}
                      disabled={!changeRequest.trim() || isProcessingEdit}
                      title="Send"
                    >
                      <SendIcon size={22} weight="fill" />
                    </button>
                  </>
                ) : viewState === 'chat' ? (
                  /* Chat Expanded: Cancel + Input + Send */
                  <>
                    <button
                      className="event-confirmation-icon-button cancel"
                      onClick={onCancel}
                      title="Cancel"
                    >
                      <FirstAidIcon size={20} weight="bold" style={{ transform: 'rotate(45deg)' }} />
                    </button>
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
                    <button
                      className="event-confirmation-icon-button send"
                      onClick={onSend}
                      disabled={!changeRequest.trim() || isProcessingEdit}
                      title="Send"
                    >
                      <SendIcon size={22} weight="fill" />
                    </button>
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
                      <button
                        className="event-confirmation-icon-button confirm"
                        onClick={onConfirm}
                        title="Add to Calendar"
                      >
                        <CalendarCheckIcon size={24} weight="bold" />
                      </button>
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
