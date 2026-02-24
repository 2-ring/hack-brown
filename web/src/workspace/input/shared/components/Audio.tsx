import { useEffect, type MutableRefObject } from 'react'
import { motion } from 'framer-motion'
import {
  FirstAid as FirstAidIcon,
  ArrowFatUp as ArrowFatUpIcon
} from '@phosphor-icons/react'
import { useVoiceVisualizer, VoiceVisualizer } from 'react-voice-visualizer'

interface AudioProps {
  onClose: () => void
  onSubmit: (audioBlob: Blob) => void
  onUploadFile: () => void
  submitRef?: MutableRefObject<(() => void) | null>
}

export function Audio({ onClose, onSubmit, onUploadFile, submitRef }: AudioProps) {
  const recorderControls = useVoiceVisualizer()
  const { recordedBlob, stopRecording, clearCanvas } = recorderControls

  // Auto-start recording when component mounts
  useEffect(() => {
    recorderControls.startRecording()
    // Stop all media tracks on unmount to release the microphone
    return () => {
      clearCanvas()
    }
  }, [])

  // Handle recorded blob
  useEffect(() => {
    if (recordedBlob) {
      onSubmit(recordedBlob)
    }
  }, [recordedBlob, onSubmit])

  const handleSubmit = () => {
    stopRecording()
  }

  useEffect(() => {
    if (submitRef) submitRef.current = handleSubmit
    return () => { if (submitRef) submitRef.current = null }
  })

  const handleClose = () => {
    clearCanvas()
    onClose()
  }

  return (
    <div className="sound-input-container">
      {/* Upload Button - Outside dock */}
      <motion.button
        className="dock-button external-button"
        onClick={onUploadFile}
        title="Upload Audio File"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        <FirstAidIcon size={24} weight="duotone" />
      </motion.button>

      {/* Close Button - Outside dock */}
      <motion.button
        className="dock-button close external-button"
        onClick={handleClose}
        title="Cancel"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        <FirstAidIcon size={24} weight="duotone" style={{ transform: 'rotate(45deg)' }} />
      </motion.button>

      <motion.div
        className="sound-input-dock"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        {/* Sound Wave Visualization */}
        <div className="sound-visualizer-wrapper">
          <VoiceVisualizer
            controls={recorderControls}
            height={40}
            width="100%"
            backgroundColor="transparent"
            mainBarColor="#1170C5"
            secondaryBarColor="#a0a0a0"
            barWidth={2}
            gap={2}
            rounded={8}
            isControlPanelShown={false}
            isDefaultUIShown={false}
            onlyRecording={true}
          />
        </div>
      </motion.div>

      {/* Submit Button - Outside dock */}
      <motion.button
        className="dock-button submit external-button"
        onClick={handleSubmit}
        title="Submit Recording"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        <ArrowFatUpIcon size={28} weight="bold" />
      </motion.button>
    </div>
  )
}
