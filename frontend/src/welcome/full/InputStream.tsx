import {
  Images as ImagesIcon,
  Files as FileIcon,
  Microphone as MicrophoneIcon,
  Pen as TextIcon,
} from '@phosphor-icons/react'
import './InputStream.css'

/**
 * Input stream component showing various input types flowing toward center
 */
export function InputStream() {
  const inputTypes = [
    { Icon: ImagesIcon, label: 'Images' },
    { Icon: FileIcon, label: 'Documents' },
    { Icon: MicrophoneIcon, label: 'Audio' },
    { Icon: TextIcon, label: 'Text' },
  ]

  return (
    <div className="input-stream">
      {inputTypes.map(({ Icon, label }) => (
        <div key={label} className="input-stream-item">
          <div className="input-icon-wrapper">
            <Icon size={24} weight="duotone" />
          </div>
          <span className="input-label">{label}</span>
        </div>
      ))}
    </div>
  )
}
