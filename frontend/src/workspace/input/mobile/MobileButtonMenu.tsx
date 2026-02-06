import { motion } from 'framer-motion'
import {
  Images as ImagesIcon,
  Files as FileIcon,
  Microphone as MicrophoneIcon,
  Pen as TextIcon,
  Link as LinkIcon,
  Envelope as EnvelopeIcon,
  ArrowFatUp as ArrowFatUpIcon
} from '@phosphor-icons/react'

interface MobileButtonMenuProps {
  onImageClick: (e: React.MouseEvent) => void
  onDocumentClick: (e: React.MouseEvent) => void
  onAudioClick: (e: React.MouseEvent) => void
  onTextClick: (e: React.MouseEvent) => void
  onLinkClick: (e: React.MouseEvent) => void
  onEmailClick: (e: React.MouseEvent) => void
  activeButton?: 'audio' | 'text' | 'link' | 'email' | null
}

export function MobileButtonMenu({
  onImageClick,
  onDocumentClick,
  onAudioClick,
  onTextClick,
  onLinkClick,
  onEmailClick,
  activeButton
}: MobileButtonMenuProps) {
  return (
    <div className="icon-row">
      <motion.div
        key="link-button"
        className={`icon-circle small clickable btn-left-1 ${activeButton === 'link' ? 'active' : ''}`}
        initial={{ opacity: 0, y: -20, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
        onClick={onLinkClick}
        title="Link Input"
      >
        <LinkIcon size={28} weight="duotone" />
      </motion.div>
      <motion.div
        key="image-button"
        className="icon-circle small clickable btn-left-2"
        initial={{ opacity: 0, x: -28, scale: 0.8 }}
        animate={{ opacity: 1, x: -14, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.08 }}
        onClick={onImageClick}
        title="Upload Image"
      >
        <ImagesIcon size={28} weight="duotone" />
      </motion.div>
      <motion.div
        key="document-button"
        className="icon-circle small clickable btn-left-3"
        initial={{ opacity: 0, y: 20, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.1 }}
        onClick={onDocumentClick}
        title="Upload Document"
      >
        <FileIcon size={28} weight="duotone" />
      </motion.div>
      <motion.div
        className="icon-circle center"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <ArrowFatUpIcon size={36} weight="bold" />
      </motion.div>
      <motion.div
        key="audio-button"
        className={`icon-circle small clickable btn-right-1 ${activeButton === 'audio' ? 'active' : ''}`}
        initial={{ opacity: 0, y: -20, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.1 }}
        onClick={onAudioClick}
        title="Record Audio"
      >
        <MicrophoneIcon size={28} weight="duotone" />
      </motion.div>
      <motion.div
        key="text-button"
        className={`icon-circle small clickable btn-right-2 ${activeButton === 'text' ? 'active' : ''}`}
        initial={{ opacity: 0, x: 28, scale: 0.8 }}
        animate={{ opacity: 1, x: 14, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.08 }}
        onClick={onTextClick}
        title="Text Input"
      >
        <TextIcon size={28} weight="duotone" />
      </motion.div>
      <motion.div
        key="email-button"
        className={`icon-circle small clickable btn-right-3 ${activeButton === 'email' ? 'active' : ''}`}
        initial={{ opacity: 0, y: 20, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
        onClick={onEmailClick}
        title="Email Input"
      >
        <EnvelopeIcon size={28} weight="duotone" />
      </motion.div>
    </div>
  )
}
