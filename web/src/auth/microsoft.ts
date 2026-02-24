/**
 * Microsoft Calendar connection via MSAL.
 * Handles OAuth popup flow and token delivery to backend.
 */

import { PublicClientApplication, type PopupRequest } from '@azure/msal-browser';
import { sendMicrosoftTokens } from '../api/backend-client';

const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;

const msalInstance = clientId
  ? new PublicClientApplication({
      auth: {
        clientId,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    })
  : null;

const calendarScopes = [
  'User.Read',
  'Calendars.ReadWrite',
  'offline_access',
];

/**
 * Open Microsoft OAuth popup, acquire tokens, and send them to the backend.
 * Returns the user's Microsoft email on success.
 */
export async function connectMicrosoftCalendar(): Promise<string> {
  if (!msalInstance) {
    throw new Error('Microsoft client ID not configured. Set VITE_MICROSOFT_CLIENT_ID in your .env file.');
  }

  await msalInstance.initialize();

  const loginRequest: PopupRequest = {
    scopes: calendarScopes,
    prompt: 'consent',
  };

  // Open popup for user to sign in and consent
  const loginResponse = await msalInstance.loginPopup(loginRequest);

  // Acquire token silently for calendar scopes
  const tokenResponse = await msalInstance.acquireTokenSilent({
    scopes: calendarScopes,
    account: loginResponse.account!,
  });

  const email = loginResponse.account?.username || '';

  // Send tokens to backend
  await sendMicrosoftTokens({
    access_token: tokenResponse.accessToken,
    expires_in: Math.floor((tokenResponse.expiresOn!.getTime() - Date.now()) / 1000),
    email,
  });

  return email;
}
