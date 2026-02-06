import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Images as ImagesIcon,
  Files as FileIcon,
  Microphone as MicrophoneIcon,
  Pen as TextIcon,
  Link as LinkIcon,
  Envelope as EnvelopeIcon,
  ArrowFatUp as ArrowFatUpIcon
} from '@phosphor-icons/react'

interface ButtonMenuProps {
  isDragging: boolean
  onImageClick: (e: React.MouseEvent) => void
  onDocumentClick: (e: React.MouseEvent) => void
  onAudioClick: (e: React.MouseEvent) => void
  onTextClick: (e: React.MouseEvent) => void
  onLinkClick: (e: React.MouseEvent) => void
  onEmailClick: (e: React.MouseEvent) => void
}

export function ButtonMenu({
  isDragging,
  onImageClick,
  onDocumentClick,
  onAudioClick,
  onTextClick,
  onLinkClick,
  onEmailClick
}: ButtonMenuProps) {
  // Track window width for responsive animations
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth <= 768
  )

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="icon-row">
      <AnimatePresence>
        {!isDragging && (
          <motion.div
            key="link-button"
            className="icon-circle small clickable btn-left-1"
            initial={isMobile ? { opacity: 0, y: -20, scale: 0.8 } : { opacity: 0, x: 40, scale: 0.8 }}
            animate={isMobile ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, x: 0, scale: 1 }}
            exit={isMobile ? { opacity: 0, y: -20, scale: 0.8 } : { opacity: 0, x: 40, scale: 0.8 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
            onClick={onLinkClick}
            title="Link Input"
          >
            <LinkIcon size={24} weight="duotone" />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!isDragging && (
          <motion.div
            key="image-button"
            className="icon-circle small clickable btn-left-2"
            initial={isMobile ? { opacity: 0, x: -28, scale: 0.8 } : { opacity: 0, x: 20, scale: 0.8 }}
            animate={isMobile ? { opacity: 1, x: -14, scale: 1 } : { opacity: 1, x: 0, scale: 1 }}
            exit={isMobile ? { opacity: 0, x: -28, scale: 0.8 } : { opacity: 0, x: 20, scale: 0.8 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.08 }}
            onClick={onImageClick}
            title="Upload Image"
          >
            <ImagesIcon size={24} weight="duotone" />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!isDragging && (
          <motion.div
            key="document-button"
            className="icon-circle small clickable btn-left-3"
            initial={isMobile ? { opacity: 0, y: 20, scale: 0.8 } : { opacity: 0, x: 10, scale: 0.8 }}
            animate={isMobile ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, x: 0, scale: 1 }}
            exit={isMobile ? { opacity: 0, y: 20, scale: 0.8 } : { opacity: 0, x: 10, scale: 0.8 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.1 }}
            onClick={onDocumentClick}
            title="Upload Document"
          >
            <FileIcon size={24} weight="duotone" />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        className="icon-circle center"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {isDragging ? (
          <ArrowFatUpIcon size={32} weight="fill" />
        ) : (
          <ArrowFatUpIcon size={32} weight="bold" />
        )}
      </motion.div>
      <AnimatePresence>
        {!isDragging && (
          <motion.div
            key="audio-button"
            className="icon-circle small clickable btn-right-1"
            initial={isMobile ? { opacity: 0, y: -20, scale: 0.8 } : { opacity: 0, x: -10, scale: 0.8 }}
            animate={isMobile ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, x: 0, scale: 1 }}
            exit={isMobile ? { opacity: 0, y: -20, scale: 0.8 } : { opacity: 0, x: -10, scale: 0.8 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.1 }}
            onClick={onAudioClick}
            title="Record Audio"
          >
            <MicrophoneIcon size={24} weight="duotone" />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!isDragging && (
          <motion.div
            key="text-button"
            className="icon-circle small clickable btn-right-2"
            initial={isMobile ? { opacity: 0, x: 28, scale: 0.8 } : { opacity: 0, x: -20, scale: 0.8 }}
            animate={isMobile ? { opacity: 1, x: 14, scale: 1 } : { opacity: 1, x: 0, scale: 1 }}
            exit={isMobile ? { opacity: 0, x: 28, scale: 0.8 } : { opacity: 0, x: -20, scale: 0.8 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.08 }}
            onClick={onTextClick}
            title="Text Input"
          >
            <TextIcon size={24} weight="duotone" />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!isDragging && (
          <motion.div
            key="email-button"
            className="icon-circle small clickable btn-right-3"
            initial={isMobile ? { opacity: 0, y: 20, scale: 0.8 } : { opacity: 0, x: -30, scale: 0.8 }}
            animate={isMobile ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, x: 0, scale: 1 }}
            exit={isMobile ? { opacity: 0, y: 20, scale: 0.8 } : { opacity: 0, x: -30, scale: 0.8 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
            onClick={onEmailClick}
            title="Email Input"
          >
            <EnvelopeIcon size={24} weight="duotone" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
