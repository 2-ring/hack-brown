/**
 * Apple Calendar connection modal.
 * Shown automatically after Apple Sign-In to chain calendar setup
 * (Apple doesn't provide calendar scopes via OAuth, so CalDAV
 * credentials are needed as a second step).
 */

import { useState } from 'react';
import { AppleLogo, ArrowSquareOut } from '@phosphor-icons/react';
import { useAuth } from './AuthContext';
import { sendAppleCredentials } from '../api/backend-client';
import './AuthModal.css';
import './AppleCalendarModal.css';

interface AppleCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppleCalendarModal({ isOpen, onClose }: AppleCalendarModalProps) {
  const { user, setPrimaryCalendarProviderLocal } = useAuth();
  const [appleId, setAppleId] = useState(user?.email || '');
  const [appPassword, setAppPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async () => {
    if (!appleId || !appPassword) {
      setError('Both fields are required.');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await sendAppleCredentials(appleId, appPassword);
      setPrimaryCalendarProviderLocal('apple');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to connect. Check your credentials.');
    } finally {
      setConnecting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="auth-modal-backdrop" onClick={handleBackdropClick}>
      <div className="auth-modal apple-calendar-modal">
        <AppleLogo size={32} weight="duotone" />
        <h2 className="display-text auth-modal-heading">Connect your Apple Calendar</h2>
        <p className="apple-calendar-desc">
          Apple requires an app-specific password to access your calendar. This is a one-time setup.
        </p>
        <div className="apple-calendar-steps">
          <p>
            1. Open{' '}
            <a href="https://appleid.apple.com/account/manage" target="_blank" rel="noopener noreferrer">
              appleid.apple.com <ArrowSquareOut size={12} weight="regular" />
            </a>
          </p>
          <p>2. Go to <strong>Sign-In and Security</strong> &rarr; <strong>App-Specific Passwords</strong></p>
          <p>3. Generate a password labeled <strong>DropCal</strong></p>
          <p>4. Paste it below</p>
        </div>
        <div className="apple-calendar-form">
          <input
            type="email"
            className="apple-calendar-input"
            placeholder="Apple ID (email)"
            value={appleId}
            onChange={(e) => setAppleId(e.target.value)}
          />
          <input
            type="password"
            className="apple-calendar-input"
            placeholder="App-specific password (xxxx-xxxx-xxxx-xxxx)"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            autoFocus
          />
          {error && <p className="apple-calendar-error">{error}</p>}
          <button
            className="apple-calendar-connect-btn"
            onClick={handleConnect}
            disabled={connecting || !appleId || !appPassword}
          >
            {connecting ? 'Connecting...' : 'Connect Apple Calendar'}
          </button>
          <button className="apple-calendar-skip-btn" onClick={onClose}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
