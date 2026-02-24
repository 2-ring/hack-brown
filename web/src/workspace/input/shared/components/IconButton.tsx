import { motion } from 'framer-motion'
import type { HTMLMotionProps } from 'framer-motion'
import type { Icon } from '@phosphor-icons/react'

interface IconButtonProps {
  icon: Icon
  onClick?: (e: React.MouseEvent) => void
  title?: string
  size?: 'small' | 'center'
  iconSize?: number
  iconWeight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'
  className?: string
  initial?: HTMLMotionProps<'div'>['initial']
  animate?: HTMLMotionProps<'div'>['animate']
  exit?: HTMLMotionProps<'div'>['exit']
  transition?: HTMLMotionProps<'div'>['transition']
}

export function IconButton({
  icon: IconComponent,
  onClick,
  title,
  size = 'small',
  iconSize = 24,
  iconWeight = 'regular',
  className = '',
  initial = { opacity: 0, x: 0, scale: 0.8 },
  animate = { opacity: 1, x: 0, scale: 1 },
  exit = { opacity: 0, x: 0, scale: 0.8 },
  transition = { duration: 0.2, ease: 'easeOut' },
}: IconButtonProps) {
  const baseClassName = `icon-circle ${size} ${onClick ? 'clickable' : ''} ${className}`.trim()

  return (
    <motion.div
      className={baseClassName}
      onClick={onClick}
      title={title}
      initial={initial}
      animate={animate}
      exit={exit}
      transition={transition}
    >
      <IconComponent size={iconSize} weight={iconWeight} />
    </motion.div>
  )
}
