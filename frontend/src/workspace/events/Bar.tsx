import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FirstAid as FirstAidIcon, CheckFat as CheckIcon, ChatCircleDots as ChatIcon, PaperPlaneTilt as SendIcon, CalendarStar as CalendarStarIcon, Images, Files, Microphone, Pen, CalendarDots, CaretLeft } from '@phosphor-icons/react'
import Skeleton from 'react-loading-skeleton'
import type { LoadingStateConfig } from './types'
import { Tooltip } from '../../components/Tooltip'
import { WordMark } from '../../components/WordMark'
import { NotificationBar } from '../input/notifications'
import type { Notification } from '../input/notifications'

// ============================================================================
// INPUT DISPLAY
// ============================================================================

type InputType = 'text' | 'image' | 'audio' | 'document' | 'pdf' | 'email'

interface InputInfo {
  type: InputType
  content: string // raw text or file name
}

function getInputIcon(inputType: InputType) {
  switch (inputType) {
    case 'image':
      return Images
    case 'document':
    case 'pdf':
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
    case 'image':
      return '1 Image'
    case 'audio':
      return '1 Audio'
    case 'document':
    case 'pdf':
      return '1 File'
    case 'text':
    case 'email': {
      const len = input.content?.length || 0
      if (len >= 1000) {
        const k = Math.round(len / 1000)
        return `${k}k Chars`
      }
      return `${len} Chars`
    }
    default:
      return '1 File'
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
            <div className="input-display">
              <CalendarDots size={16} weight="regular" />
              <span className="input-display-text">
                {eventCount} {eventCount === 1 ? 'event' : 'events'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LOADING ANIMATIONS
// ============================================================================

function AnimatedDots() {
  const [dotCount, setDotCount] = useState(1)

  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount(prev => (prev % 3) + 1)
    }, 400)
    return () => clearInterval(interval)
  }, [])

  return (
    <span className="animated-dots">
      {[0, 1, 2].map(i => (
        <span key={i} style={{ opacity: i < dotCount ? 1 : 0.15, transition: 'opacity 0.2s ease' }}>.</span>
      ))}
    </span>
  )
}

function TypingText({ text, onComplete }: { text: string; onComplete?: () => void }) {
  // Strip trailing "..." from message for separate animation
  const baseText = text.replace(/\.{2,}$/, '')
  const hasDots = text !== baseText

  const [displayedLength, setDisplayedLength] = useState(0)

  useEffect(() => {
    setDisplayedLength(0)
    if (baseText.length === 0) {
      onComplete?.()
      return
    }

    let frame: number
    let current = 0
    const charDelay = 18 // ms per character

    const animate = () => {
      current++
      setDisplayedLength(current)
      if (current < baseText.length) {
        frame = window.setTimeout(animate, charDelay)
      } else {
        onComplete?.()
      }
    }

    frame = window.setTimeout(animate, charDelay)
    return () => clearTimeout(frame)
  }, [baseText])

  return (
    <span>
      {baseText.slice(0, displayedLength)}
      {hasDots && displayedLength >= baseText.length && <AnimatedDots />}
    </span>
  )
}

/** Minimum time (ms) a completed message stays visible before transitioning */
const READ_DELAY_MS = 600

/** Queues stage transitions so the current typing animation finishes before the next begins. */
function QueuedLoadingStep({ step }: { step: LoadingStateConfig }) {
  const [activeStep, setActiveStep] = useState(step)
  const [pending, setPending] = useState<LoadingStateConfig | null>(null)
  const [typingDone, setTypingDone] = useState(false)

  const transition = useCallback((next: LoadingStateConfig) => {
    setActiveStep(next)
    setTypingDone(false)
    setPending(null)
  }, [])

  // New step arrived from parent
  useEffect(() => {
    if (step.message === activeStep.message) return

    if (typingDone) {
      // Current animation finished — hold for read delay then transition
      const timer = setTimeout(() => transition(step), READ_DELAY_MS)
      return () => clearTimeout(timer)
    } else {
      // Still typing — queue (latest wins)
      setPending(step)
    }
  }, [step.message])

  // Current typing finished and there's a queued step
  useEffect(() => {
    if (typingDone && pending) {
      const timer = setTimeout(() => transition(pending), READ_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [typingDone, pending])

  const handleTypingComplete = useCallback(() => {
    setTypingDone(true)
  }, [])

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeStep.message}
          className="loading-progress-icon"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {activeStep.icon && <activeStep.icon size={20} weight="bold" />}
        </motion.div>
      </AnimatePresence>
      <div className="loading-progress-text">
        <div className="loading-progress-message">
          <TypingText key={activeStep.message} text={activeStep.message} onComplete={handleTypingComplete} />
        </div>
        {activeStep.submessage && (
          <div className="loading-progress-submessage">{activeStep.submessage}</div>
        )}
      </div>
      {activeStep.count && (
        <div className="loading-progress-count">{activeStep.count}</div>
      )}
    </>
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
  notification?: Notification | null
  onDismissNotification?: (id: string) => void
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
  notification,
  onDismissNotification,
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
      <AnimatePresence mode="wait">
        {notification && onDismissNotification && (
          <NotificationBar
            key={notification.id}
            notification={notification}
            onDismiss={onDismissNotification}
          />
        )}
      </AnimatePresence>
      <div className="event-confirmation-footer">
        {viewState === 'loading' ? (
          /* Loading Progress */
          <div className="loading-progress-container">
            <div className="loading-progress-steps">
              {loadingConfig.map((step) => (
                <div key="loading-step" className="loading-progress-step">
                  <QueuedLoadingStep step={step} />
                </div>
              ))}
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
