# Apple Calendar Setup

Apple Calendar uses CalDAV with an app-specific password. No developer registration or API keys needed.

## 1. Generate an App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com/account/manage)
2. Sign in with your Apple ID
3. Go to **Sign-In and Security** > **App-Specific Passwords**
4. Click **Generate an app-specific password**
5. Label it `DropCal`
6. Copy the generated password (format: `xxxx-xxxx-xxxx-xxxx`)

## 2. Connect in DropCal

1. Sign in to DropCal, open Settings > Manage Integrations
2. Click the Apple row
3. Enter your **Apple ID** (email) and the **app-specific password**
4. Click **Connect**

The backend validates the credentials by testing the CalDAV connection to `caldav.icloud.com`. If your Apple ID has two-factor authentication enabled (required), the app-specific password bypasses it for this single integration.

## 3. Requirements

- Two-factor authentication must be enabled on your Apple ID (Apple requires this for app-specific passwords)
- No environment variables or backend configuration needed — credentials are stored encrypted per-user

## 4. Revoking Access

To disconnect later:
- In DropCal: Settings > Manage Integrations > click the sign-out icon on the Apple row
- On Apple's side: Go to [appleid.apple.com](https://appleid.apple.com/account/manage) > App-Specific Passwords > revoke the `DropCal` password
