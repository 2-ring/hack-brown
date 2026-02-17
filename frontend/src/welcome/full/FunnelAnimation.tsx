import { InputStream } from './InputStream'
import { EventDisplay } from './EventDisplay'
import { AppIcon } from './AppIcon'
import './FunnelAnimation.css'

/**
 * Visual representation of the DropCal funnel concept:
 * Input types (left) → App Icon (center) → Calendar Events (right)
 * Spans full screen width to show the complete flow
 */
export function FunnelAnimation() {
  return (
    <div className="funnel-animation">
      {/* Left Section - Input Stream */}
      <div className="funnel-section funnel-inputs-section">
        <InputStream />
      </div>

      {/* Center Section - App Icon */}
      <div className="funnel-section funnel-center-section">
        <AppIcon size={140} />
      </div>

      {/* Right Section - Event Display */}
      <div className="funnel-section funnel-events-section">
        <EventDisplay />
      </div>
    </div>
  )
}
