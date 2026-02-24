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
import type { ActiveInput } from '../shared/types'

interface MobileButtonMenuProps {
  activeInput: ActiveInput
  onSelect: (input: ActiveInput) => void
  onSubmit: () => void
  onImageClick: (e: React.MouseEvent) => void
  onDocumentClick: (e: React.MouseEvent) => void
}

export function MobileButtonMenu({
  activeInput,
  onSelect,
  onSubmit,
  onImageClick,
  onDocumentClick,
}: MobileButtonMenuProps) {
  return (
    <div className="icon-row">
      <motion.div
        key="link-button"
        className={`icon-circle small clickable btn-left-1 ${activeInput === 'link' ? 'active' : ''}`}
        initial={{ opacity: 0, y: -20, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
        onClick={() => onSelect('link')}
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
        className={`icon-circle center ${activeInput ? 'clickable' : ''}`}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={activeInput ? onSubmit : undefined}
        style={{ cursor: activeInput ? 'pointer' : 'default' }}
      >
        <ArrowFatUpIcon size={36} weight={activeInput ? 'fill' : 'bold'} />
      </motion.div>
      <motion.div
        key="audio-button"
        className={`icon-circle small clickable btn-right-1 ${activeInput === 'audio' ? 'active' : ''}`}
        initial={{ opacity: 0, y: -20, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.1 }}
        onClick={() => onSelect('audio')}
        title="Record Audio"
      >
        <MicrophoneIcon size={28} weight="duotone" />
      </motion.div>
      <motion.div
        key="text-button"
        className={`icon-circle small clickable btn-right-2 ${activeInput === 'text' ? 'active' : ''}`}
        initial={{ opacity: 0, x: 28, scale: 0.8 }}
        animate={{ opacity: 1, x: 14, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.08 }}
        onClick={() => onSelect('text')}
        title="Text Input"
      >
        <TextIcon size={28} weight="duotone" />
      </motion.div>
      <motion.div
        key="email-button"
        className={`icon-circle small clickable btn-right-3 ${activeInput === 'email' ? 'active' : ''}`}
        initial={{ opacity: 0, y: 20, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
        onClick={() => onSelect('email')}
        title="Email Input"
      >
        <EnvelopeIcon size={28} weight="duotone" />
      </motion.div>
    </div>
  )
}
