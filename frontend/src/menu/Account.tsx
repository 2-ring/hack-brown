/**
 * Account component for the sidebar.
 * Shows sign-in button when logged out, or user profile when logged in.
 * Opens settings popup when clicked (when logged in).
 */

import { useState } from 'react';
import { User as UserIcon } from '@phosphor-icons/react';
import { useAuth } from '../auth/AuthContext';
import { SettingsPopup } from './SettingsPopup';
import { LoadingSpinnerContainer } from '../components/skeletons';
import './Account.css';

export function Account() {
  const { user, loading, signIn } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  if (loading) {
    return (
      <div className="account-container">
        <LoadingSpinnerContainer size="small" minHeight={44} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="account-container">
        <button className="account-sign-in-button" onClick={signIn}>
          <svg className="google-icon" viewBox="0 0 48 48" width="20" height="20">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          <span>Sign in with Google</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="account-container">
        <button
          className="account-user-button"
          onClick={() => setIsSettingsOpen(true)}
        >
          <div className="account-user-info">
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt={user.user_metadata?.name || 'User'}
                className="account-user-avatar"
              />
            ) : (
              <div className="account-user-avatar-placeholder">
                <UserIcon size={16} weight="regular" />
              </div>
            )}
            <div className="account-user-details">
              <span className="account-user-name">
                {user.user_metadata?.name || user.email?.split('@')[0] || 'User'}
              </span>
              <span className="account-user-plan">Pro plan</span>
            </div>
          </div>
        </button>
      </div>

      {isSettingsOpen && (
        <SettingsPopup
          onClose={() => setIsSettingsOpen(false)}
          userEmail={user.email || ''}
          userName={user.user_metadata?.name || user.email?.split('@')[0] || 'User'}
          userAvatar={user.user_metadata?.avatar_url}
        />
      )}
    </>
  );
}
