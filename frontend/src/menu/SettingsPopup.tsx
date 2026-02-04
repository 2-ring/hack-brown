/**
 * Settings popup component that appears when clicking the account button.
 * Shows user info and menu options.
 */

import {
  Calendar,
  CrownSimple,
  SignOut,
  MoonStars,
  SunHorizon,
  GlobeSimple,
  FootballHelmet,
  CaretLeft,
  Check,
  GoogleLogo,
  MicrosoftOutlookLogo,
  AppleLogo,
  PlusCircle,
  MinusCircle,
  Star,
} from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import './SettingsPopup.css';
import { useState, useEffect, useRef } from 'react';

interface SettingsPopupProps {
  onClose: () => void;
  userEmail: string;
  userName: string;
  userAvatar?: string;
  isLoading?: boolean;
}

interface CalendarIntegration {
  id: string;
  name: string;
  email: string;
  provider: 'google' | 'microsoft' | 'apple';
  isDefault: boolean;
  isConnected: boolean;
}

type ViewMode = 'main' | 'integrations';

export function SettingsPopup({ onClose, userEmail, userName, userAvatar, isLoading = false }: SettingsPopupProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const popupRef = useRef<HTMLDivElement>(null);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('main');

  // Settings state (will be persisted to backend/localStorage in future)
  const [useInternationalDate, setUseInternationalDate] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Mock calendar integrations data - will be replaced with actual backend data
  const [calendars, setCalendars] = useState<CalendarIntegration[]>([
    {
      id: '1',
      name: 'Personal Calendar',
      email: 'user@gmail.com',
      provider: 'google',
      isDefault: true,
      isConnected: true,
    },
    {
      id: '2',
      name: 'Work Calendar',
      email: 'user@company.com',
      provider: 'microsoft',
      isDefault: false,
      isConnected: true,
    },
  ]);

  const handleLogout = async () => {
    try {
      await signOut();
      onClose();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  const handleUpgradePlan = () => {
    navigate('/plans');
    onClose();
  };

  const handleManageIntegrations = () => {
    setViewMode('integrations');
  };

  const handleBackToMain = () => {
    setViewMode('main');
  };

  const handleSetDefault = (calendarId: string) => {
    setCalendars((prev) =>
      prev.map((cal) => ({
        ...cal,
        isDefault: cal.id === calendarId,
      }))
    );
  };

  const handleDisconnect = (calendarId: string) => {
    // TODO: Implement disconnect logic
    console.log('Disconnect calendar:', calendarId);
  };

  const handleConnectNew = (provider: 'google' | 'microsoft' | 'apple') => {
    // TODO: Implement OAuth flow
    console.log('Connect new calendar:', provider);
  };

  const getProviderIcon = (provider: string, size: number = 20) => {
    switch (provider) {
      case 'google':
        return <GoogleLogo size={size} weight="regular" />;
      case 'microsoft':
        return <MicrosoftOutlookLogo size={size} weight="regular" />;
      case 'apple':
        return <span className="apple-icon">􀣺</span>;
      default:
        return null;
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'google':
        return 'Google';
      case 'microsoft':
        return 'Outlook';
      case 'apple':
        return 'Apple';
      default:
        return provider;
    }
  };

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Add listener with a slight delay to avoid closing immediately on the click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div className="settings-popup-backdrop">
      <div className="settings-popup" ref={popupRef}>
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
            <div className="settings-popup-header-content">
              {viewMode === 'integrations' && (
                <button className="settings-popup-back-button" onClick={handleBackToMain}>
                  <CaretLeft size={12} weight="bold" />
                </button>
              )}
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
            </div>
          )}
        </div>

        {/* Menu items */}
        <div className="settings-popup-menu">
          {isLoading ? (
            <>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="settings-popup-item" style={{ padding: '12px 16px' }}>
                  <Skeleton width={20} height={20} style={{ marginRight: 12 }} />
                  <Skeleton width={100 + i * 10} height={16} />
                </div>
              ))}
            </>
          ) : viewMode === 'main' ? (
            <>
              <button className="settings-popup-item" onClick={handleUpgradePlan}>
                <CrownSimple size={20} weight="duotone" />
                <span>Upgrade plan</span>
              </button>

              <button
                className="settings-popup-item"
                onClick={() => setUseInternationalDate(!useInternationalDate)}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={useInternationalDate ? 'intl-icon' : 'usa-icon'}
                    initial={{ y: 20, scale: 0.95, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    exit={{ y: -20, scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {useInternationalDate ? (
                      <GlobeSimple size={20} weight="duotone" />
                    ) : (
                      <FootballHelmet size={20} weight="duotone" />
                    )}
                  </motion.div>
                </AnimatePresence>
                <span>Date format</span>
                <div className="settings-popup-value">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={useInternationalDate ? 'intl' : 'usa'}
                      initial={{ y: 20, scale: 0.95, opacity: 0 }}
                      animate={{ y: 0, scale: 1, opacity: 1 }}
                      exit={{ y: -20, scale: 0.95, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {useInternationalDate ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </button>

              <button
                className="settings-popup-item"
                onClick={() => setDarkMode(!darkMode)}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={darkMode ? 'dark' : 'light'}
                    initial={{ y: 20, scale: 0.95, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    exit={{ y: -20, scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                  >
                    {darkMode ? (
                      <MoonStars size={20} weight="duotone" />
                    ) : (
                      <SunHorizon size={20} weight="duotone" />
                    )}
                    <span>{darkMode ? 'Dark mode' : 'Light mode'}</span>
                  </motion.div>
                </AnimatePresence>
              </button>

              <button className="settings-popup-item" onClick={handleManageIntegrations}>
                <Calendar size={20} weight="duotone" />
                <span>Manage integrations</span>
              </button>
            </>
          ) : (
            // Integrations view
            <>
              {['google', 'microsoft', 'apple'].map((provider) => {
                const calendar = calendars.find(cal => cal.provider === provider && cal.isConnected);
                const isConnected = !!calendar;
                const isDefault = calendar?.isDefault;

                if (!isConnected) {
                  // Not connected: whole row is clickable
                  return (
                    <button
                      key={provider}
                      className="settings-popup-item settings-integration-row"
                      onClick={() => handleConnectNew(provider as 'google' | 'microsoft' | 'apple')}
                    >
                      {provider === 'google' && <GoogleLogo size={20} weight="duotone" />}
                      {provider === 'microsoft' && <MicrosoftOutlookLogo size={20} weight="duotone" />}
                      {provider === 'apple' && <AppleLogo size={20} weight="duotone" />}
                      <span>{getProviderName(provider)}</span>
                      <div className="settings-popup-value" style={{ gap: '8px', justifyContent: 'flex-end', display: 'flex', position: 'static' }}>
                        <MinusCircle size={20} weight="regular" />
                      </div>
                    </button>
                  );
                }

                // Connected: only individual icons are clickable
                return (
                  <div key={provider} className="settings-popup-item settings-integration-row" style={{ cursor: 'default' }}>
                    {provider === 'google' && <GoogleLogo size={20} weight="duotone" />}
                    {provider === 'microsoft' && <MicrosoftOutlookLogo size={20} weight="duotone" />}
                    {provider === 'apple' && <AppleLogo size={20} weight="duotone" />}
                    <span>{getProviderName(provider)}</span>
                    <div className="settings-popup-value" style={{ gap: '8px', justifyContent: 'flex-end', display: 'flex', position: 'static' }}>
                      <button
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
                        onClick={() => handleDisconnect(calendar!.id)}
                      >
                        <PlusCircle size={20} weight="regular" />
                      </button>
                      <button
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
                        onClick={() => !isDefault && handleSetDefault(calendar!.id)}
                        disabled={isDefault}
                      >
                        <Star size={20} weight={isDefault ? 'duotone' : 'regular'} style={{ color: '#666' }} />
                      </button>
                    </div>
                  </div>
                );
              })}
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
