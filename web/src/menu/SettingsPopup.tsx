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
  FlashlightIcon,
  GlobeSimple,
  FootballHelmet,
  CaretLeft,
  GoogleLogo,
  MicrosoftOutlookLogo,
  AppleLogo,
  Star,
  Clock,
  Plugs,
  DotsThreeOutlineVertical,
  MaskSad,
} from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import './SettingsPopup.css';
import '../auth/AuthModal.css';
import { useState, useEffect, useRef } from 'react';
import { getCalendarProviders, setPrimaryCalendarProvider, getUserPreferences, sendAppleCredentials, updateUserPreferences, disconnectCalendarProvider, deleteAccount } from '../api/backend-client';
import { useTheme } from '../theme';
import { TimezoneInput } from '../workspace/events/inputs/TimezoneInput';
import { getTimezoneList, filterTimezones, formatTimezoneCompact } from '../workspace/events/timezone';
import { useViewport } from '../workspace/input/shared/hooks/useViewport';

interface SettingsPopupProps {
  onClose: () => void;
  userEmail: string;
  userName: string;
  userAvatar?: string;
  isLoading?: boolean;
  triggerRef?: React.RefObject<HTMLElement>;
  initialView?: ViewMode;
}

interface CalendarIntegration {
  id: string;
  name: string;
  email: string;
  provider: 'google' | 'microsoft' | 'apple';
  isDefault: boolean;
  isConnected: boolean;
}

type ViewMode = 'main' | 'integrations' | 'apple-connect' | 'account' | 'timezone';

export function SettingsPopup({ onClose, userEmail, userName, userAvatar, isLoading = false, triggerRef, initialView = 'main' }: SettingsPopupProps) {
  const navigate = useNavigate();
  const { signOut, signIn, user, plan, preferences, setPreferences, setPrimaryCalendarProviderLocal } = useAuth();

  // Determine the user's auth provider (the one they signed in with)
  const rawAuthProvider = user?.app_metadata?.provider;
  const userAuthProvider = rawAuthProvider === 'azure' ? 'microsoft' : (rawAuthProvider || 'google');
  const popupRef = useRef<HTMLDivElement>(null);
  const { themeMode, toggleTheme } = useTheme();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);

  // Settings state - initialized from backend preferences
  const [useInternationalDate, setUseInternationalDate] = useState(
    preferences.date_format === 'DD/MM/YYYY'
  );
  const [userTimezone, setUserTimezone] = useState<string>(
    preferences.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [editingTimezone, setEditingTimezone] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState('');
  const [logoutHovered, setLogoutHovered] = useState(false);
  const { isMobile } = useViewport();

  // Calendar integrations data from backend
  const [calendars, setCalendars] = useState<CalendarIntegration[]>([]);
  const [disconnectMode, setDisconnectMode] = useState(false);

  // Delete account confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        setUserTimezone(response.preferences.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
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
      // signOut does a full page reload, so onClose() is not needed
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      await signOut();
    } catch (error) {
      console.error('Failed to delete account:', error);
      setDeleting(false);
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
    setDisconnectMode(false);
    setViewMode('main');
  };

  const handleDisconnectProvider = async (provider: 'google' | 'microsoft' | 'apple') => {
    if (provider === userAuthProvider) {
      // This is the auth provider — disconnecting = signing out
      await handleLogout();
      return;
    }
    try {
      await disconnectCalendarProvider(provider);
      setDisconnectMode(false);
      await fetchCalendarProviders();
    } catch (error) {
      console.error(`Failed to disconnect ${provider}:`, error);
    }
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
      // Update AuthContext so the rest of the app sees the change
      setPrimaryCalendarProviderLocal(provider);
    } catch (error) {
      console.error('Failed to set primary provider:', error);
      // Refresh to get correct state
      fetchCalendarProviders();
    }
  };

  const handleConnectNew = async (provider: 'google' | 'microsoft' | 'apple') => {
    if (provider === 'google') {
      // Re-auth with Google to get calendar scopes
      await signIn('google');
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

  // Close popup when clicking outside (but not on portaled child modals)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isOutsidePopup = popupRef.current && !popupRef.current.contains(target);
      const isOutsideTrigger = triggerRef?.current && !triggerRef.current.contains(target);

      // Don't close if click is on a portaled child (bottom drawer, delete modal)
      const isOnPortaledChild = target.closest('.drawer-backdrop, .auth-modal-backdrop');

      if (isOutsidePopup && isOutsideTrigger && !isOnPortaledChild) {
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
              {(viewMode === 'integrations' || viewMode === 'account') && (
                <button className="settings-popup-back-button" onClick={handleBackToMain}>
                  <CaretLeft size={12} weight="bold" />
                </button>
              )}
              {viewMode === 'apple-connect' && (
                <button className="settings-popup-back-button" onClick={() => setViewMode('integrations')}>
                  <CaretLeft size={12} weight="bold" />
                </button>
              )}
              {viewMode === 'timezone' && (
                <button className="settings-popup-back-button" onClick={() => { setTimezoneSearch(''); setViewMode('account'); }}>
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
                  <span className="settings-popup-user-plan">{plan === 'pro' ? 'Pro plan' : 'Free plan'}</span>
                </div>
              </div>
              <div className="settings-popup-email">{userEmail}</div>
              {viewMode === 'main' && (
                <button className="settings-popup-back-button" onClick={() => setViewMode('account')} style={{ marginRight: 0, marginLeft: 4 }}>
                  <DotsThreeOutlineVertical size={16} />
                </button>
              )}
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
          ) : viewMode === 'account' ? (
            <>
              {isMobile ? (
                <button
                  className="settings-popup-item"
                  onClick={() => setEditingTimezone(true)}
                >
                  <Clock size={20} weight="duotone" />
                  <span>Timezone</span>
                  <div className="settings-popup-value">
                    <TimezoneInput
                      value={userTimezone}
                      onChange={(tz) => {
                        setUserTimezone(tz);
                        setEditingTimezone(false);
                        updateUserPreferences({ timezone: tz }).catch((err) => {
                          console.error('Failed to save timezone:', err);
                        });
                      }}
                      onFocus={() => setEditingTimezone(true)}
                      onBlur={() => setEditingTimezone(false)}
                      isEditing={editingTimezone}
                    />
                  </div>
                </button>
              ) : (
                <button
                  className="settings-popup-item"
                  onClick={() => { setTimezoneSearch(''); setViewMode('timezone'); }}
                >
                  <Clock size={20} weight="duotone" />
                  <span>Timezone</span>
                  <div className="settings-popup-value">
                    <span>{formatTimezoneCompact(userTimezone)}</span>
                  </div>
                </button>
              )}
            </>
          ) : viewMode === 'timezone' ? (
            <div className="settings-timezone-picker">
              <input
                type="text"
                className="settings-timezone-search"
                placeholder="Search timezones..."
                value={timezoneSearch}
                onChange={(e) => setTimezoneSearch(e.target.value)}
                autoFocus
              />
              <div className="settings-timezone-list">
                {filterTimezones(getTimezoneList(), timezoneSearch).map((tz) => (
                  <button
                    key={tz.iana}
                    className={`settings-popup-item settings-timezone-option ${tz.iana === userTimezone ? 'settings-timezone-active' : ''}`}
                    onClick={() => {
                      setUserTimezone(tz.iana);
                      setTimezoneSearch('');
                      setViewMode('account');
                      updateUserPreferences({ timezone: tz.iana }).catch((err) => {
                        console.error('Failed to save timezone:', err);
                      });
                    }}
                  >
                    <span style={{ flex: 1 }}>{tz.city}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{tz.shortOffset}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : viewMode === 'main' ? (
            <>
              <button className="settings-popup-item" onClick={handleUpgradePlan}>
                <CrownSimple size={20} weight="duotone" />
                <span>{plan === 'pro' ? 'Manage subscription' : 'Upgrade plan'}</span>
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
                    {themeMode === 'auto' ? (
                      <FlashlightIcon size={20} weight="duotone" />
                    ) : themeMode === 'dark' ? (
                      <MoonStars size={20} weight="duotone" />
                    ) : (
                      <SunHorizon size={20} weight="duotone" />
                    )}
                    <span>{themeMode === 'auto' ? 'Auto theme' : themeMode === 'dark' ? 'Dark mode' : 'Light mode'}</span>
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
                // Auth provider is always connected when signed in (auth includes calendar for Google/Microsoft)
                const isAuthProviderRow = provider === userAuthProvider;
                const isConnected = isAuthProviderRow || !!calendar;
                const isDefault = calendar?.isDefault;

                if (!isConnected) {
                  // Not connected: same layout in both modes
                  return (
                    <button
                      key={provider}
                      className="settings-popup-item settings-integration-row"
                      onClick={disconnectMode ? undefined : () => handleConnectNew(provider as 'google' | 'microsoft' | 'apple')}
                      style={disconnectMode ? { cursor: 'default', opacity: 0.4 } : undefined}
                      disabled={disconnectMode}
                    >
                      {provider === 'google' && <GoogleLogo size={20} weight="duotone" />}
                      {provider === 'microsoft' && <MicrosoftOutlookLogo size={20} weight="duotone" />}
                      {provider === 'apple' && <AppleLogo size={20} weight="duotone" />}
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '1px' }}>
                        <span style={{ lineHeight: '1.2' }}>{getProviderName(provider)}</span>
                        <span style={{ fontSize: '11px', color: '#999', lineHeight: '1.2' }}>
                          {disconnectMode ? 'Not connected' : 'Connect'}
                        </span>
                      </div>
                    </button>
                  );
                }

                // Connected provider row
                return (
                  <button
                    key={provider}
                    className={`settings-popup-item settings-integration-row ${!disconnectMode && isDefault ? 'settings-integration-active' : ''}`}
                    onClick={disconnectMode
                      ? () => handleDisconnectProvider(provider as 'google' | 'microsoft' | 'apple')
                      : () => handleSetDefault(provider)
                    }
                  >
                    {provider === 'google' && <GoogleLogo size={20} weight="duotone" />}
                    {provider === 'microsoft' && <MicrosoftOutlookLogo size={20} weight="duotone" />}
                    {provider === 'apple' && <AppleLogo size={20} weight="duotone" />}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '1px' }}>
                      <span style={{ lineHeight: '1.2' }}>{getProviderName(provider)}</span>
                      <span style={{ fontSize: '11px', color: disconnectMode ? 'var(--error)' : '#999', lineHeight: '1.2' }}>
                        {disconnectMode
                          ? (isAuthProviderRow ? 'Sign out' : 'Disconnect')
                          : (calendar?.email || userEmail)
                        }
                      </span>
                    </div>
                    <div className="settings-integration-actions">
                      {disconnectMode ? (
                        <SignOut size={16} style={{ color: 'var(--error)', transition: 'all 0.15s ease' }} />
                      ) : (
                        <Star size={16} weight={isDefault ? 'duotone' : 'regular'} style={{ color: isDefault ? 'var(--text-primary)' : 'var(--text-disabled)', transition: 'all 0.15s ease' }} />
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="settings-popup-footer">
          {isLoading ? (
            <div className="settings-popup-item" style={{ padding: '12px 16px' }}>
              <Skeleton width={20} height={20} style={{ marginRight: 12 }} />
              <Skeleton width={60} height={16} />
            </div>
          ) : viewMode === 'account' ? (
            <button
              className="settings-popup-item settings-popup-logout"
              onClick={() => setShowDeleteConfirm(true)}
              onMouseEnter={() => setLogoutHovered(true)}
              onMouseLeave={() => setLogoutHovered(false)}
            >
              <MaskSad size={20} weight={logoutHovered ? "bold" : "regular"} />
              <span style={{ fontWeight: logoutHovered ? 600 : 400 }}>Delete account</span>
            </button>
          ) : viewMode === 'integrations' && disconnectMode ? (
            <button
              className="settings-popup-item settings-popup-footer-nav"
              onClick={() => setDisconnectMode(false)}
            >
              <CaretLeft size={16} weight="bold" />
              <span>Manage integrations</span>
            </button>
          ) : viewMode === 'integrations' ? (
            <button
              className="settings-popup-item settings-popup-logout"
              onClick={() => setDisconnectMode(true)}
              onMouseEnter={() => setLogoutHovered(true)}
              onMouseLeave={() => setLogoutHovered(false)}
            >
              <Plugs size={20} weight={logoutHovered ? "bold" : "regular"} />
              <span style={{ fontWeight: logoutHovered ? 600 : 400 }}>Disconnect providers</span>
            </button>
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

      {/* Delete account confirmation modal */}
      {showDeleteConfirm && (
        <div className="auth-modal-backdrop" style={{ pointerEvents: 'auto' }} onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}>
          <div className="auth-modal" style={{ maxWidth: 360, gap: 0, textAlign: 'center' }}>
            <MaskSad size={40} weight="duotone" style={{ color: 'var(--error)', marginBottom: 8 }} />
            <h2 className="display-text auth-modal-heading" style={{ fontSize: '1.5rem', padding: '0 1rem 0.75rem', color: 'var(--error)' }}>
              Delete your account?
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 1.5rem', lineHeight: 1.5, padding: '0 1rem' }}>
              This will permanently delete your account, events, sessions, and disconnect all calendar providers. This cannot be undone.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <button
                className="menu-button menu-button-action"
                onClick={handleDeleteAccount}
                disabled={deleting}
                style={{ background: 'var(--error)', color: 'white', opacity: deleting ? 0.5 : 1, width: '100%', margin: 0 }}
              >
                <span className="menu-button-text">{deleting ? 'Deleting...' : 'Permanently delete'}</span>
              </button>
              <button
                className="menu-button menu-button-action"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={{ width: '100%', margin: 0 }}
              >
                <span className="menu-button-text">Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
