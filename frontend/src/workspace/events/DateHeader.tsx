interface DateHeaderProps {
  date: Date
}

export function DateHeader({ date }: DateHeaderProps) {
  const formatDateHeader = (date: Date): string => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Check if it's today or tomorrow
    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow'
    }

    // Otherwise, format as "Wednesday, February 18"
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="event-date-header">
      <span className="event-date-header-text">{formatDateHeader(date)}</span>
    </div>
  )
}
