import { motion, AnimatePresence } from 'framer-motion'
import { FirstAid as FirstAidIcon, CheckFat as CheckIcon, ChatCircleDots as ChatIcon, PaperPlaneTilt as SendIcon, CalendarStar as CalendarStarIcon, CaretLeft, Images, Files, Microphone, Pen } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'
import type { LoadingStateConfig } from './types'
import { Tooltip } from '../../components/Tooltip'
import { WordMark } from '../../components/WordMark'

// ============================================================================
// INPUT DISPLAY
// ============================================================================

type InputType = 'text' | 'image' | 'audio' | 'document' | 'email'

interface InputInfo {
  type: InputType
  content: string // raw text or file name
}

function getInputIcon(inputType: InputType) {
  switch (inputType) {
    case 'image':
      return Images
    case 'document':
      return Files
    case 'audio':
      return Microphone
    case 'text':
    case 'email':
    default:
      return Pen
  }
}

function getInputSummary(input: InputInfo): string {
  switch (input.type) {
    case 'image': {
      return '1 Image'
    }
    case 'audio': {
      return 'Audio'
    }
    case 'document': {
      return '1 File'
    }
    case 'text':
    case 'email':
    default: {
      const len = input.content?.length || 0
      if (len >= 1000) {
        const k = Math.round(len / 1000)
        return `${k}k Chars`
      }
      return `${len} Chars`
    }
  }
}

// ============================================================================
// TOP BAR
// ============================================================================

interface TopBarProps {
  eventCount: number
  isScrollable?: boolean
  inputType?: InputType
  inputContent?: string
  onBack?: () => void
}

export function TopBar({
  eventCount,
  isScrollable = true,
  inputType,
  inputContent,
  onBack
}: TopBarProps) {
  const input: InputInfo | null = inputType
    ? { type: inputType, content: inputContent || '' }
    : null

  const InputIcon = input ? getInputIcon(input.type) : null

  return (
    <div className={`event-confirmation-header ${!isScrollable ? 'no-scroll' : ''}`}>
      <div className="event-confirmation-header-content">
        {onBack && (
          <button className="header-back-button" onClick={onBack} title="Back">
            <CaretLeft size={20} weight="bold" />
          </button>
        )}
        <div className="header-left">
          {input && InputIcon ? (
            <div className="input-display">
              <InputIcon size={16} weight="regular" />
              <span className="input-display-text">{getInputSummary(input)}</span>
            </div>
          ) : (
            <Skeleton width={100} height={20} />
          )}
        </div>
        <div className="header-center">
          <WordMark size={28} className="header-wordmark" />
        </div>
        <div className="header-right">
          {!eventCount ? (
            <Skeleton width={80} height={20} />
          ) : (
            <span>
              {eventCount} {eventCount === 1 ? 'event' : 'events'}
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
  onSave?: () => void
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
  onSave,
  isScrollable = true,
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
                        onClick={onSave}
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
