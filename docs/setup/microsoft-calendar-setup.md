# Microsoft Sign-In & Calendar Setup

Microsoft sign-in uses Supabase's Azure OAuth provider, which authenticates the user AND connects their Outlook calendar in a single step (calendar scopes are requested during sign-in).

## Prerequisites

- A Microsoft account (personal or work/school)
- Access to the [Microsoft Entra admin center](https://entra.microsoft.com) (formerly Azure AD)

## 1. Register an App in Microsoft Entra ID

1. Go to [Microsoft Entra ID - App registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **+ New registration**
3. Fill in:
   - **Name**: `DropCal`
   - **Supported account types**: **Accounts in any organizational directory and personal Microsoft accounts**
   - **Redirect URI**: Select **Web** (not SPA) and enter:
     - Local dev: `http://localhost:54321/auth/v1/callback` (Supabase local)
     - Production: `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
4. Click **Register**
5. Copy the **Application (client) ID** from the overview page

> **Important**: The redirect URI must be **Web** type (not SPA), pointing to your Supabase project's callback URL. Supabase handles the OAuth exchange server-side.

## 2. Create a Client Secret

1. In your app registration, go to **Certificates & secrets** (left sidebar)
2. Click **+ New client secret**
3. Description: `dropcal-supabase`, Expires: 24 months
4. Click **Add**
5. Copy the secret **Value** immediately (it won't be shown again)

> Set a reminder to rotate this secret before it expires. If it lapses, Microsoft sign-in will break silently.

## 3. Add Calendar Permissions

1. Go to **API permissions** (left sidebar)
2. Click **+ Add a permission**
3. Select **Microsoft Graph** > **Delegated permissions**
4. Search and check:
   - `email`
   - `offline_access`
   - `openid`
   - `profile`
   - `User.Read`
   - `Calendars.ReadWrite`
5. Click **Add permissions**

These scopes are also requested in the frontend's `signInWithMicrosoft()` call so that the OAuth consent screen shows them to the user.

## 4. (Recommended) Add Email Verification Claim

Microsoft Entra can send unverified email domains. To protect against this:

1. In your app registration, go to **Manifest** (left sidebar)
2. Find the `optionalClaims` section and add:
   ```json
   "optionalClaims": {
     "idToken": [
       {
         "name": "xms_edov",
         "essential": false
       }
     ]
   }
   ```
3. Click **Save**

This adds the `xms_edov` (email domain ownership verified) claim to tokens, letting you validate that email addresses are legitimate.

## 5. Configure Supabase

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard) > **Authentication** > **Providers**
2. Find **Azure (Microsoft)** and enable it
3. Enter:
   - **Client ID**: Your Application (client) ID from step 1
   - **Client Secret**: The secret Value from step 2
   - **Azure Tenant URL**: Leave blank for `common` (all account types), or set to:
     - `https://login.microsoftonline.com/consumers` — personal Microsoft accounts only
     - `https://login.microsoftonline.com/organizations` — work/school accounts only
     - `https://login.microsoftonline.com/<tenant-id>` — single organization only
4. Click **Save**

## 6. Set Environment Variables

### Backend (`backend/.env`)

```env
MICROSOFT_CLIENT_ID=your-application-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret-value
MICROSOFT_TENANT_ID=common
```

The backend needs these to refresh expired Microsoft tokens via the Microsoft Graph token endpoint.

> `VITE_MICROSOFT_CLIENT_ID` in the frontend is no longer needed — the MSAL popup flow is replaced by Supabase OAuth.

## 7. Test

1. Start the frontend and backend dev servers
2. Click **Sign in with Microsoft** on the login screen
3. You should be redirected to Microsoft's consent screen showing calendar permissions
4. After authorizing, you're redirected back, signed in, with Outlook calendar connected
5. Verify in Settings > Manage Integrations that Microsoft/Outlook shows as connected
