/**
 * Dismissible toast informing guests about limited functionality.
 * Shows blue brand color with info icon.
 */

import { Info, X } from '@phosphor-icons/react';
import { GuestSessionManager } from '../auth/GuestSessionManager';
import './GuestModeToast.css';

interface GuestModeToastProps {
  onDismiss: () => void;
}

export function GuestModeToast({ onDismiss }: GuestModeToastProps) {
  const remaining = GuestSessionManager.getRemainingCount();

  const handleDismiss = () => {
    GuestSessionManager.dismissToast();
    onDismiss();
  };

  return (
    <div className="guest-mode-toast">
      <div className="guest-mode-toast-icon">
        <Info size={20} weight="fill" />
      </div>
      <div className="guest-mode-toast-content">
        <div className="guest-mode-toast-title">Guest Mode</div>
        <div className="guest-mode-toast-message">
          You have {remaining} free {remaining === 1 ? 'session' : 'sessions'}{' '}
          remaining. Sign in for personalized events and calendar integration.
        </div>
      </div>
      <button className="guest-mode-toast-close" onClick={handleDismiss}>
        <X size={18} weight="regular" />
      </button>
    </div>
  );
}
