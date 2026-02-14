# Apple Sign-In & Calendar Setup

Apple sign-in uses Supabase's Apple OAuth provider for authentication. Calendar connection requires a second step — an app-specific password for CalDAV access — because Apple does not offer OAuth-based calendar scopes (CalDAV is the only web API Apple provides for calendar access).

**User experience**: The user clicks "Sign in with Apple", gets authenticated, then is immediately prompted to connect their Apple Calendar by entering an app-specific password. This is a one-time setup.

## Prerequisites

- An [Apple Developer account](https://developer.apple.com/account) ($99/year)
- Two-factor authentication enabled on your Apple ID

## 1. Get Your Team ID

1. Log into the [Apple Developer Console](https://developer.apple.com/account)
2. Your **Team ID** (10-character alphanumeric) is shown in the upper-right menu under your name

## 2. Register Email Sources

This enables Apple's private email relay for users who choose "Hide My Email":

1. In the Apple Developer Console, go to **Services** (left sidebar)
2. Under **Sign in with Apple for Email Communication**, click **+**
3. Add your domains: `dropcal.ai` and `<your-supabase-project-id>.supabase.co`
4. Verify domain ownership via the provided DNS TXT record

## 3. Create an App ID

1. Go to **Certificates, Identifiers & Profiles** > **Identifiers**
2. Click **+** and select **App IDs** > Type: **App**
3. Fill in:
   - **Description**: `DropCal`
   - **Bundle ID** (Explicit): `ai.dropcal.app`
4. Under **Capabilities**, enable **Sign in with Apple**
5. Click **Continue** > **Register**

## 4. Create a Services ID

This is your OAuth client ID:

1. Go to **Identifiers**, click **+**, select **Services IDs**
2. Fill in:
   - **Description**: `DropCal Web`
   - **Identifier**: `ai.dropcal.web`
3. Click **Continue** > **Register**
4. Click into the newly created Services ID
5. Enable **Sign in with Apple**, click **Configure**
6. Set:
   - **Primary App ID**: Select the App ID from step 3
   - **Web Domain**: `<your-supabase-project-id>.supabase.co` (no `https://` prefix)
   - **Return URL**: `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
7. Click **Save** > **Continue** > **Save**

## 5. Create a Signing Key

1. Go to **Keys**, click **+**
2. **Key Name**: `DropCal Sign In`
3. Enable **Sign in with Apple**, click **Configure**, select your App ID
4. Click **Continue** > **Register**
5. **Download the `.p8` file immediately** — you only get one chance
6. Note the **Key ID** (10 characters, shown on the key details page)

> Store the `.p8` file securely. You will need it every 6 months to regenerate the client secret.

## 6. Generate the Client Secret JWT

Apple requires a JWT signed with ES256 as the client secret. Use Supabase's browser-based tool (does NOT work in Safari — use Chrome or Firefox):

1. Go to the [Supabase Apple docs](https://supabase.com/docs/guides/auth/social-login/auth-apple) and find the secret generator
2. Enter:
   - **Service ID**: `ai.dropcal.web` (from step 4)
   - **Team ID**: Your Team ID (from step 1)
   - **Key ID**: From step 5
   - **Private Key**: Paste the contents of the `.p8` file
3. Click **Generate** and copy the JWT

Alternatively, generate via CLI (requires Node.js and `jsonwebtoken`):

```bash
node -e "
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('AuthKey_XXXXXXXXXX.p8');
const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d',
  audience: 'https://appleid.apple.com',
  issuer: 'YOUR_TEAM_ID',
  subject: 'ai.dropcal.web',
  keyid: 'YOUR_KEY_ID',
});
console.log(token);
"
```

> **This secret expires every 6 months.** Set a calendar reminder at 5 months to regenerate. If it expires, Apple sign-in breaks silently for all users.

## 7. Configure Supabase

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard) > **Authentication** > **Providers**
2. Find **Apple** and enable it
3. Enter:
   - **Client ID**: `ai.dropcal.web` (your Services ID)
   - **Secret**: The JWT from step 6
4. Click **Save**

## 8. Test

1. Start the frontend and backend dev servers
2. Click **Sign in with Apple** on the login screen
3. You should be redirected to Apple's sign-in page
4. After authenticating, you're redirected back and signed in
5. You'll be prompted to connect your Apple Calendar (enter Apple ID + app-specific password)
6. Follow the in-app instructions to generate an app-specific password at [appleid.apple.com](https://appleid.apple.com/account/manage)

## Important Notes

- **Name data**: Apple only provides the user's full name on their very first sign-in. It's captured and persisted automatically, but if missed, the user must revoke the app at appleid.apple.com and re-authorize.
- **Calendar is separate from auth**: Apple Sign-In gives identity only (`name` and `email` scopes). There are no calendar OAuth scopes — CalDAV with an app-specific password is the only web method Apple supports for calendar access. This is an Apple platform limitation, not a DropCal limitation.
- **Revoking access**: Users can revoke Sign in with Apple at [appleid.apple.com](https://appleid.apple.com/account/manage) > Sign-In and Security > Sign in with Apple. App-specific passwords can be revoked separately under App-Specific Passwords.
