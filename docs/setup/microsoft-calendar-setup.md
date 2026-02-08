# Microsoft Calendar Setup

## 1. Register an Azure App

1. Go to [Azure Portal - App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **+ New registration**
3. Fill in:
   - **Name**: `DropCal`
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**: Select **Single-page application (SPA)** and enter `http://localhost:5173`
4. Click **Register**
5. Copy the **Application (client) ID** from the overview page

## 2. Create a Client Secret

1. In your app registration, go to **Certificates & secrets** (left sidebar)
2. Click **+ New client secret**
3. Description: `dropcal-backend`, Expires: 24 months
4. Click **Add**
5. Copy the secret **Value** immediately (it won't be shown again)

## 3. Add Calendar Permissions

1. Go to **API permissions** (left sidebar)
2. Click **+ Add a permission**
3. Select **Microsoft Graph** > **Delegated permissions**
4. Search and check:
   - `Calendars.ReadWrite`
   - `User.Read`
   - `offline_access`
5. Click **Add permissions**

## 4. Set Environment Variables

### Frontend (`frontend/.env`)

```env
VITE_MICROSOFT_CLIENT_ID=your-application-client-id
```

### Backend (`backend/.env`)

```env
MICROSOFT_CLIENT_ID=your-application-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret-value
MICROSOFT_TENANT_ID=common
```

## 5. Production Redirect URI

When deploying, add your production URL as an additional SPA redirect URI:

1. Go to **Authentication** (left sidebar)
2. Under **Single-page application** redirect URIs, click **Add URI**
3. Add `https://your-domain.com`

## 6. Test

1. Start frontend + backend dev servers
2. Sign in with Google, open Settings > Manage Integrations
3. Click the Microsoft/Outlook row
4. A Microsoft popup will open for sign-in and consent
5. After authorizing, the integration should show as connected
