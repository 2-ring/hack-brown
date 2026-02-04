/**
 * Reusable menu button component.
 * Used for New events, View calendar, and sign-in buttons.
 */

import { ReactNode } from 'react';
import './MenuButton.css';

interface MenuButtonProps {
  /** Button text */
  children: ReactNode;
  /** Click handler */
  onClick: () => void;
  /** Leading icon (left side) */
  icon?: ReactNode;
  /** Trailing icon (right side) */
  trailingIcon?: ReactNode;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'signin';
  /** Additional CSS class */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

export function MenuButton({
  children,
  onClick,
  icon,
  trailingIcon,
  variant = 'primary',
  className = '',
  disabled = false,
}: MenuButtonProps) {
  const variantClass = variant === 'signin' ? 'menu-button-signin' : 'menu-button-action';

  return (
    <button
      className={`menu-button ${variantClass} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className="menu-button-icon">{icon}</span>}
      <span className="menu-button-text">{children}</span>
      {trailingIcon && <span className="menu-button-trailing-icon">{trailingIcon}</span>}
    </button>
  );
}
