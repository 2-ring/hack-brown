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
  GoogleLogo,
  MicrosoftOutlookLogo,
  AppleLogo,
  Star,
  Clock,
} from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import './SettingsPopup.css';
import { useState, useEffect, useRef } from 'react';
import { getCalendarProviders, setPrimaryCalendarProvider, getUserPreferences, sendAppleCredentials, updateUserPreferences } from '../api/backend-client';
import { useTheme } from '../theme';

interface SettingsPopupProps {
  onClose: () => void;
  userEmail: string;
  userName: string;
  userAvatar?: string;
  isLoading?: boolean;
  triggerRef?: React.RefObject<HTMLElement>;
}

interface CalendarIntegration {
  id: string;
  name: string;
  email: string;
  provider: 'google' | 'microsoft' | 'apple';
  isDefault: boolean;
  isConnected: boolean;
}

type ViewMode = 'main' | 'integrations' | 'apple-connect';

export function SettingsPopup({ onClose, userEmail, userName, userAvatar, isLoading = false, triggerRef }: SettingsPopupProps) {
  const navigate = useNavigate();
  const { signOut, signIn, preferences, setPreferences } = useAuth();
  const popupRef = useRef<HTMLDivElement>(null);
  const { themeMode, toggleTheme } = useTheme();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('main');

  // Settings state - initialized from backend preferences
  const [useInternationalDate, setUseInternationalDate] = useState(
    preferences.date_format === 'DD/MM/YYYY'
  );
  const [userTimezone, setUserTimezone] = useState<string | null>(
    preferences.timezone || null
  );
  const [logoutHovered, setLogoutHovered] = useState(false);

  // Calendar integrations data from backend
  const [calendars, setCalendars] = useState<CalendarIntegration[]>([]);

  // Apple connect form state
  const [appleId, setAppleId] = useState('');
  const [appleAppPassword, setAppleAppPassword] = useState('');
  const [appleConnecting, setAppleConnecting] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  // Fetch calendar providers from backend
  useEffect(() => {
    if (viewMode === 'integrations') {
      fetchCalendarProviders();
    } else if (viewMode === 'main') {
      fetchUserPreferences();
    }
  }, [viewMode]);

  // Fetch on mount
  useEffect(() => {
    fetchUserPreferences();
  }, []);

  const fetchUserPreferences = async () => {
    try {
      const response = await getUserPreferences();
      if (response.exists && response.preferences) {
        setUserTimezone(response.preferences.timezone);
      }
    } catch (error) {
      console.error('Failed to fetch user preferences:', error);
    }
  };

  const fetchCalendarProviders = async () => {
    try {
      const response = await getCalendarProviders();

      // Map backend response to CalendarIntegration format
      const providerData: CalendarIntegration[] = ['google', 'microsoft', 'apple'].map((provider) => {
        const backendProvider = response.providers.find(p => p.provider === provider);
        return {
          id: backendProvider?.provider_id || provider,
          name: provider.charAt(0).toUpperCase() + provider.slice(1),
          email: backendProvider?.email || '',
          provider: provider as 'google' | 'microsoft' | 'apple',
          isDefault: backendProvider?.is_primary || false,
          isConnected: backendProvider?.connected || false,
        };
      });

      setCalendars(providerData);
    } catch (error) {
      console.error('Failed to fetch calendar providers:', error);
    }
  };

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

  const handleSetDefault = async (provider: string) => {
    try {
      await setPrimaryCalendarProvider(provider);
      // Optimistically update UI
      setCalendars((prev) =>
        prev.map((cal) => ({
          ...cal,
          isDefault: cal.provider === provider,
        }))
      );
    } catch (error) {
      console.error('Failed to set primary provider:', error);
      // Refresh to get correct state
      fetchCalendarProviders();
    }
  };

  const handleConnectNew = async (provider: 'google' | 'microsoft' | 'apple') => {
    if (provider === 'google') {
      // Sign-in includes calendar scopes, so this reconnects Google Calendar
      await signIn();
      setTimeout(() => fetchCalendarProviders(), 2000);
    } else if (provider === 'microsoft') {
      try {
        const { connectMicrosoftCalendar } = await import('../auth/microsoft');
        await connectMicrosoftCalendar();
        await fetchCalendarProviders();
      } catch (error) {
        console.error('Microsoft Calendar connection failed:', error);
      }
    } else if (provider === 'apple') {
      setAppleId('');
      setAppleAppPassword('');
      setAppleError(null);
      setViewMode('apple-connect');
    }
  };

  const handleAppleConnect = async () => {
    if (!appleId || !appleAppPassword) {
      setAppleError('Both fields are required.');
      return;
    }
    setAppleConnecting(true);
    setAppleError(null);
    try {
      await sendAppleCredentials(appleId, appleAppPassword);
      setViewMode('integrations');
    } catch (error: any) {
      setAppleError(error.message || 'Failed to connect. Check your credentials.');
    } finally {
      setAppleConnecting(false);
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
      const target = event.target as Node;
      const isOutsidePopup = popupRef.current && !popupRef.current.contains(target);
      const isOutsideTrigger = triggerRef?.current && !triggerRef.current.contains(target);

      if (isOutsidePopup && isOutsideTrigger) {
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
  }, [onClose, triggerRef]);

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
              {viewMode === 'apple-connect' && (
                <button className="settings-popup-back-button" onClick={() => setViewMode('integrations')}>
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
          ) : viewMode === 'apple-connect' ? (
            <div className="settings-apple-connect">
              <div className="settings-apple-connect-header">
                <AppleLogo size={24} weight="duotone" />
                <span>Connect Apple Calendar</span>
              </div>
              <p className="settings-apple-connect-desc">
                Apple Calendar requires an{' '}
                <a href="https://support.apple.com/en-us/102654" target="_blank" rel="noopener noreferrer">
                  app-specific password
                </a>.
                Generate one at{' '}
                <a href="https://appleid.apple.com/account/manage" target="_blank" rel="noopener noreferrer">
                  appleid.apple.com
                </a>.
              </p>
              <input
                type="email"
                className="settings-apple-input"
                placeholder="Apple ID (email)"
                value={appleId}
                onChange={(e) => setAppleId(e.target.value)}
                autoFocus
              />
              <input
                type="password"
                className="settings-apple-input"
                placeholder="App-specific password"
                value={appleAppPassword}
                onChange={(e) => setAppleAppPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAppleConnect()}
              />
              {appleError && <p className="settings-apple-error">{appleError}</p>}
              <button
                className="settings-apple-connect-btn"
                onClick={handleAppleConnect}
                disabled={appleConnecting || !appleId || !appleAppPassword}
              >
                {appleConnecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          ) : viewMode === 'main' ? (
            <>
              <button className="settings-popup-item" onClick={handleUpgradePlan}>
                <CrownSimple size={20} weight="duotone" />
                <span>Upgrade plan</span>
              </button>

              <button
                className="settings-popup-item"
                onClick={() => {
                  const newValue = !useInternationalDate;
                  setUseInternationalDate(newValue);
                  const newFormat = newValue ? 'DD/MM/YYYY' : 'MM/DD/YYYY';
                  setPreferences(prev => ({ ...prev, date_format: newFormat as 'DD/MM/YYYY' | 'MM/DD/YYYY' }));
                  updateUserPreferences({ date_format: newFormat as 'DD/MM/YYYY' | 'MM/DD/YYYY' }).catch((err) => {
                    console.error('Failed to save date format preference:', err);
                  });
                }}
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

              <div className="settings-popup-item" style={{ cursor: 'default', opacity: 0.8 }}>
                <Clock size={20} weight="duotone" />
                <span>Timezone</span>
                <div className="settings-popup-value">
                  {userTimezone || 'Not set'}
                </div>
              </div>

              <button
                className="settings-popup-item"
                onClick={toggleTheme}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={themeMode}
                    initial={{ y: 20, scale: 0.95, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    exit={{ y: -20, scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                  >
                    {themeMode === 'dark' ? (
                      <MoonStars size={20} weight="duotone" />
                    ) : (
                      <SunHorizon size={20} weight="duotone" />
                    )}
                    <span>{themeMode === 'dark' ? 'Dark mode' : 'Light mode'}</span>
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
                // Google is always connected when signed in (auth = calendar)
                const isGoogleAuth = provider === 'google';
                const isConnected = isGoogleAuth || !!calendar;
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
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '1px' }}>
                        <span style={{ lineHeight: '1.2' }}>{getProviderName(provider)}</span>
                        <span style={{ fontSize: '11px', color: '#999', lineHeight: '1.2' }}>Connect</span>
                      </div>
                    </button>
                  );
                }

                // Connected: click row to set as primary
                return (
                  <button
                    key={provider}
                    className="settings-popup-item settings-integration-row"
                    onClick={() => !isDefault && handleSetDefault(provider)}
                    style={{ cursor: isDefault ? 'default' : 'pointer' }}
                  >
                    {provider === 'google' && <GoogleLogo size={20} weight="duotone" />}
                    {provider === 'microsoft' && <MicrosoftOutlookLogo size={20} weight="duotone" />}
                    {provider === 'apple' && <AppleLogo size={20} weight="duotone" />}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '1px' }}>
                      <span style={{ lineHeight: '1.2' }}>{getProviderName(provider)}</span>
                      <span style={{ fontSize: '11px', color: '#999', lineHeight: '1.2' }}>{calendar?.email || userEmail}</span>
                    </div>
                    {isDefault && (
                      <div className="settings-integration-actions">
                        <Star size={20} weight="duotone" style={{ color: '#666' }} />
                      </div>
                    )}
                  </button>
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
            <button
              className="settings-popup-item settings-popup-logout"
              onClick={handleLogout}
              onMouseEnter={() => setLogoutHovered(true)}
              onMouseLeave={() => setLogoutHovered(false)}
            >
              <SignOut size={20} weight={logoutHovered ? "bold" : "regular"} />
              <span style={{ fontWeight: logoutHovered ? 600 : 400 }}>Log out</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
