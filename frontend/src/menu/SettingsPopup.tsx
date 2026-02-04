/**
 * Settings popup component that appears when clicking the account button.
 * Shows user info and menu options.
 */

import {
  Gear,
  Globe,
  Question,
  CrownSimple,
  Gift,
  BookOpen,
  SignOut,
  CaretRight,
} from '@phosphor-icons/react';
import { useAuth } from '../auth/AuthContext';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import './SettingsPopup.css';

interface SettingsPopupProps {
  onClose: () => void;
  userEmail: string;
  userName: string;
  userAvatar?: string;
  isLoading?: boolean;
}

export function SettingsPopup({ onClose, userEmail, userName, userAvatar, isLoading = false }: SettingsPopupProps) {
  const { signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      onClose();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  // Close popup when clicking outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="settings-popup-backdrop" onClick={handleBackdropClick}>
      <div className="settings-popup">
        {/* User header */}
        <div className="settings-popup-header">
          {isLoading ? (
            <>
              <div className="settings-popup-user">
                <Skeleton circle width={48} height={48} />
                <div className="settings-popup-user-info">
                  <Skeleton width={120} height={18} style={{ marginBottom: 4 }} />
                  <Skeleton width={60} height={14} />
                </div>
              </div>
              <Skeleton width={180} height={14} />
            </>
          ) : (
            <>
              <div className="settings-popup-user">
                {userAvatar ? (
                  <img src={userAvatar} alt={userName} className="settings-popup-avatar" referrerPolicy="no-referrer" />
                ) : (
                  <div className="settings-popup-avatar-placeholder">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="settings-popup-user-info">
                  <span className="settings-popup-user-name">{userName}</span>
                  <span className="settings-popup-user-plan">Pro plan</span>
                </div>
              </div>
              <div className="settings-popup-email">{userEmail}</div>
            </>
          )}
        </div>

        {/* Menu items */}
        <div className="settings-popup-menu">
          {isLoading ? (
            <>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="settings-popup-item" style={{ padding: '12px 16px' }}>
                  <Skeleton width={20} height={20} style={{ marginRight: 12 }} />
                  <Skeleton width={100 + i * 10} height={16} />
                </div>
              ))}
            </>
          ) : (
            <>
          <button className="settings-popup-item" disabled>
            <Gear size={20} weight="regular" />
            <span>Settings</span>
            <span className="settings-popup-shortcut">⌘+Ctrl+,</span>
          </button>

          <button className="settings-popup-item" disabled>
            <Globe size={20} weight="regular" />
            <span>Language</span>
            <CaretRight size={16} weight="regular" className="settings-popup-arrow" />
          </button>

          <button className="settings-popup-item" disabled>
            <Question size={20} weight="regular" />
            <span>Get help</span>
          </button>

          <button className="settings-popup-item" disabled>
            <CrownSimple size={20} weight="regular" />
            <span>Upgrade plan</span>
          </button>

          <button className="settings-popup-item" disabled>
            <Gift size={20} weight="regular" />
            <span>Gift Claude</span>
          </button>

          <button className="settings-popup-item" disabled>
            <BookOpen size={20} weight="regular" />
            <span>Learn more</span>
            <CaretRight size={16} weight="regular" className="settings-popup-arrow" />
          </button>
            </>
          )}
        </div>

        {/* Logout */}
        <div className="settings-popup-footer">
          {isLoading ? (
            <div className="settings-popup-item" style={{ padding: '12px 16px' }}>
              <Skeleton width={20} height={20} style={{ marginRight: 12 }} />
              <Skeleton width={60} height={16} />
            </div>
          ) : (
            <button className="settings-popup-item settings-popup-logout" onClick={handleLogout}>
              <SignOut size={20} weight="regular" />
              <span>Log out</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
