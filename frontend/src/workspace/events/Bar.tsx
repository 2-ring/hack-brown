import { motion, AnimatePresence } from 'framer-motion'
import { X as XIcon, CheckFat as CheckIcon, ChatCircleDots as ChatIcon, PaperPlaneRight as SendIcon } from '@phosphor-icons/react'
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

export function TopBar({ wordmarkImage, eventCount, isLoading, expectedEventCount, isLoadingCalendars = false }: TopBarProps) {
  return (
    <div className="event-confirmation-header">
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
  )
}

// ============================================================================
// BOTTOM BAR
// ============================================================================

interface BottomBarProps {
  isLoading: boolean
  loadingConfig?: LoadingStateConfig[]
  isChatExpanded: boolean
  changeRequest: string
  isProcessingEdit: boolean
  onChatExpandToggle: () => void
  onChangeRequestChange: (value: string) => void
  onSendRequest: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onConfirm?: () => void
}

export function BottomBar({
  isLoading,
  loadingConfig = [],
  isChatExpanded,
  changeRequest,
  isProcessingEdit,
  onChatExpandToggle,
  onChangeRequestChange,
  onSendRequest,
  onKeyDown,
  onConfirm,
}: BottomBarProps) {
  return (
    <div className="event-confirmation-footer-overlay">
      <div className="event-confirmation-footer">
        {isLoading ? (
          /* Progress indicators during loading */
          <div className="loading-progress-container">
            <div className="loading-progress-steps">
              {loadingConfig.map((config, index) => {
                const IconComponent = config.icon
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
                        <IconComponent size={20} weight="bold" />
                      </div>
                    )}
                    <div className="loading-progress-text">
                      <div className="loading-progress-message" style={{ fontStyle: 'italic' }}>
                        {config.message}
                      </div>
                      {config.submessage && (
                        <div className="loading-progress-submessage">{config.submessage}</div>
                      )}
                    </div>
                    {config.count && (
                      <div className="loading-progress-count">{config.count}</div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </div>
        ) : (
          /* Single row with cancel, chat input, and confirm buttons */
          <div className="event-confirmation-footer-row">
            <AnimatePresence mode="wait">
              {isChatExpanded ? (
                <motion.div
                  key="chat-expanded"
                  className="event-confirmation-footer-content"
                  initial={{ y: 20, scale: 0.95, opacity: 0 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  exit={{ y: -20, scale: 0.95, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <button
                    className="event-confirmation-icon-button cancel"
                    onClick={onChatExpandToggle}
                    title="Close"
                  >
                    <XIcon size={20} weight="bold" />
                  </button>

                  <div className="event-confirmation-chat">
                    <input
                      type="text"
                      className="event-confirmation-chat-input"
                      placeholder="Request changes..."
                      value={changeRequest}
                      onChange={(e) => onChangeRequestChange(e.target.value)}
                      onKeyDown={onKeyDown}
                      autoFocus
                    />
                    <button
                      className="event-confirmation-chat-send"
                      onClick={onSendRequest}
                      disabled={!changeRequest.trim() || isProcessingEdit}
                    >
                      <SendIcon size={20} weight="fill" />
                    </button>
                  </div>

                  {onConfirm && (
                    <button
                      className="event-confirmation-icon-button confirm"
                      onClick={onConfirm}
                      title="Add to Calendar"
                    >
                      <CheckIcon size={24} weight="bold" />
                    </button>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="chat-collapsed"
                  className="event-confirmation-footer-content"
                  initial={{ y: 20, scale: 0.95, opacity: 0 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  exit={{ y: -20, scale: 0.95, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <button
                    className="event-confirmation-request-button"
                    onClick={onChatExpandToggle}
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
                      <CheckIcon size={24} weight="bold" />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
