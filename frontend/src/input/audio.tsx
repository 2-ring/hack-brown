import { useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Plus as PlusIcon,
  X as XIcon,
  ArrowFatUp as ArrowFatUpIcon
} from '@phosphor-icons/react'
import { useVoiceVisualizer, VoiceVisualizer } from 'react-voice-visualizer'

interface AudioInputProps {
  onClose: () => void
  onSubmit: (audioBlob: Blob) => void
  onUploadFile: () => void
}

export function AudioInput({ onClose, onSubmit, onUploadFile }: AudioInputProps) {
  const recorderControls = useVoiceVisualizer()
  const { recordedBlob, stopRecording } = recorderControls

  // Auto-start recording when component mounts
  useEffect(() => {
    recorderControls.startRecording()
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

  const handleClose = () => {
    stopRecording()
    onClose()
  }

  return (
    <div className="sound-input-container">
      {/* Plus Button - Outside dock */}
      <motion.button
        className="dock-button plus-button-external"
        onClick={onUploadFile}
        title="Upload Audio File"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        <PlusIcon size={24} weight="bold" />
      </motion.button>

      <motion.div
        className="sound-input-dock"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        {/* Close Button */}
        <button
          className="dock-button close"
          onClick={handleClose}
          title="Cancel"
        >
          <XIcon size={24} weight="bold" />
        </button>

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

        {/* Submit Button */}
        <button
          className="dock-button submit"
          onClick={handleSubmit}
          title="Submit Recording"
        >
          <ArrowFatUpIcon size={28} weight="bold" />
        </button>
      </motion.div>
    </div>
  )
}
