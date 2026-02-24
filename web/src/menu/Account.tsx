/**
 * Account component for the sidebar.
 * Shows sign-in button when logged out, or user profile when logged in.
 * Opens settings popup when clicked (when logged in).
 */

import { useState, useRef, useEffect } from 'react';
import { User as UserIcon } from '@phosphor-icons/react';
import { useAuth } from '../auth/AuthContext';
import { SettingsPopup } from './SettingsPopup';
import { MenuButton } from './MenuButton';
import { LoadingSpinnerContainer } from '../components/skeletons';
import { ExpandIcon } from './ExpandIcon';
import './Account.css';

export function Account() {
  const { user, loading, signIn } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialView, setSettingsInitialView] = useState<'main' | 'integrations'>('main');
  const accountButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-open settings from ?settings=integrations query param
  useEffect(() => {
    if (!user || loading) return;
    const params = new URLSearchParams(window.location.search);
    const settingsParam = params.get('settings');
    if (settingsParam === 'integrations') {
      setSettingsInitialView('integrations');
      setIsSettingsOpen(true);
      params.delete('settings');
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [user, loading]);

  if (loading) {
    return (
      <div className="account-container">
        <LoadingSpinnerContainer size="small" minHeight={44} />
      </div>
    );
  }

  if (!user) {
    const GoogleIcon = (
      <svg className="provider-icon" viewBox="0 0 48 48" width="20" height="20">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        <path fill="none" d="M0 0h48v48H0z"/>
      </svg>
    );

    const MicrosoftIcon = (
      <svg className="provider-icon" viewBox="0 0 48 48" width="20" height="20">
        <path fill="#f25022" d="M0 0h23v23H0z"/>
        <path fill="#00a4ef" d="M25 0h23v23H25z"/>
        <path fill="#7fba00" d="M0 25h23v23H0z"/>
        <path fill="#ffb900" d="M25 25h23v23H25z"/>
      </svg>
    );

    const AppleIcon = (
      <svg className="provider-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
      </svg>
    );

    return (
      <div className="account-container">
        <div className="account-sign-in-buttons">
          <MenuButton
            onClick={() => signIn('google')}
            icon={GoogleIcon}
            variant="signin"
          >
            Sign in with Google
          </MenuButton>

          <MenuButton
            onClick={() => signIn('microsoft')}
            icon={MicrosoftIcon}
            variant="signin"
          >
            Sign in with Microsoft
          </MenuButton>

          <MenuButton
            onClick={() => signIn('apple')}
            icon={AppleIcon}
            variant="signin"
          >
            Sign in with Apple
          </MenuButton>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="account-container">
        <button
          ref={accountButtonRef}
          className="account-user-button"
          onClick={() => setIsSettingsOpen(prev => !prev)}
        >
          <div className="account-user-info">
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt={user.user_metadata?.name || 'User'}
                className="account-user-avatar"
                referrerPolicy="no-referrer"
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
            <ExpandIcon isExpanded={isSettingsOpen} size={10} />
          </div>
        </button>
      </div>

      {isSettingsOpen && (
        <SettingsPopup
          onClose={() => { setIsSettingsOpen(false); setSettingsInitialView('main'); }}
          userEmail={user.email || ''}
          userName={user.user_metadata?.name || user.email?.split('@')[0] || 'User'}
          userAvatar={user.user_metadata?.avatar_url}
          triggerRef={accountButtonRef}
          initialView={settingsInitialView}
        />
      )}
    </>
  );
}
