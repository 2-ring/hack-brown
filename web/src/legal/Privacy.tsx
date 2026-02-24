import { PageHeader } from '../components/PageHeader'
import './Legal.css'

export function Privacy() {
  return (
    <div className="legal">
      <PageHeader />
      <div className="legal-content">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: February 23, 2026</p>

        <p>
          DropCal ("we", "our", "us") operates the dropcal.ai website and
          service. This policy explains how we collect, use, store, and protect
          your information when you use DropCal.
        </p>

        <h2>Information We Collect</h2>

        <h3>Account Information</h3>
        <p>
          When you sign in with Google or another provider, we receive your
          name, email address, and profile photo. We use this to create and
          manage your DropCal account.
        </p>

        <h3>Calendar Data</h3>
        <p>
          With your explicit permission, we access your calendar (Google
          Calendar, Microsoft Outlook, or Apple Calendar) to read your existing
          events, check for scheduling conflicts, and create new events on your
          behalf. We sync your calendar events to provide personalized event
          formatting — DropCal learns your naming conventions, scheduling
          patterns, and calendar organization from your existing events so that
          new events match your style. We do not modify or delete your existing
          calendar entries.
        </p>

        <h3>Content You Provide</h3>
        <p>
          When you use DropCal, you may submit text, images, audio recordings,
          PDFs, or other files. We process this content to extract calendar
          event information. Uploaded files are stored securely and your input
          content and resulting events are stored in your account so you can
          access your session history.
        </p>

        <h3>Guest Sessions</h3>
        <p>
          You can use DropCal without an account. Guest sessions are stored
          with an anonymous identifier and are not linked to any personal
          information. Guest sessions can be migrated to a full account if you
          later sign in.
        </p>

        <h2>How We Use Your Information</h2>
        <ul>
          <li>To extract calendar events from your input using AI</li>
          <li>To check for scheduling conflicts with your existing calendar</li>
          <li>To create events in your calendar when you confirm them</li>
          <li>
            To learn your personal formatting preferences (naming style,
            calendar organization, event categorization) from your existing
            events and apply them to new events you create through DropCal
          </li>
          <li>To maintain your session history</li>
          <li>To improve and monitor the reliability of our service</li>
        </ul>

        <h2>How We Process Your Data with AI</h2>
        <p>
          DropCal uses AI models to extract events from your input and to
          personalize event formatting. This involves sending data to
          third-party AI providers via their APIs for processing:
        </p>
        <ul>
          <li>
            Your input content (text, transcribed audio, extracted document
            text) is sent to AI models to identify and extract event details.
          </li>
          <li>
            A sample of your existing calendar event titles, dates, and
            locations may be sent to AI models to analyze your formatting
            preferences. This analysis is performed solely for your account and
            is never combined with other users' data.
          </li>
          <li>
            We generate numerical representations (embeddings) of your events
            to find similar past events and improve formatting suggestions.
            These embeddings are stored per-user and used only for your
            personalization.
          </li>
        </ul>
        <p>
          All AI processing is performed on a per-user basis to provide
          features directly to you. We do not use your data to train, create,
          or improve any generalized or foundational AI models. Our AI
          providers' API terms prohibit them from using API inputs for model
          training.
        </p>

        <h2>Third-Party Services</h2>
        <p>
          We use the following third-party services to operate DropCal. Your
          data may be processed by these services as described:
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> — Database hosting, authentication, and
            file storage. Stores your account data, sessions, and uploaded
            files.
          </li>
          <li>
            <strong>Google</strong> — OAuth authentication and Google Calendar
            API integration. We request calendar access with your explicit
            consent.
          </li>
          <li>
            <strong>Microsoft</strong> — OAuth authentication and Outlook
            Calendar API integration for users who connect Microsoft accounts.
          </li>
          <li>
            <strong>AI Providers (Anthropic, xAI, OpenAI)</strong> — Your input
            content, extracted event data, and calendar event samples are sent
            to AI models for event extraction and personalization. These
            providers' API terms prohibit them from using inputs for model
            training.
          </li>
          <li>
            <strong>Deepgram</strong> — Audio files are sent for speech-to-text
            transcription when you submit audio recordings.
          </li>
          <li>
            <strong>PostHog</strong> — Product analytics. We collect usage data
            such as page views and feature interactions to understand how
            DropCal is used and improve the service. If you are signed in, this
            data is associated with your account. PostHog does not receive your
            calendar data or input content.
          </li>
        </ul>

        <h2>Google User Data</h2>
        <p>
          DropCal's use and transfer to any other app of information received
          from Google APIs will adhere to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>Specifically, we:</p>
        <ul>
          <li>
            Only access Google Calendar data necessary to provide DropCal's
            features (conflict detection, event creation, and personalized
            formatting)
          </li>
          <li>
            Do not use Google Calendar data for advertising, retargeting, or
            serving ads
          </li>
          <li>
            Do not sell, rent, or transfer Google Calendar data to third
            parties, except as necessary to provide the service (AI processing
            as described above) or as required by law
          </li>
          <li>
            Do not use Google Calendar data to train, create, or improve
            generalized AI or machine learning models
          </li>
          <li>
            Encrypt OAuth tokens at rest using industry-standard encryption
          </li>
          <li>
            Allow you to revoke access and request deletion of your data at any
            time
          </li>
        </ul>

        <h2>Browser Extension</h2>
        <p>
          The DropCal browser extension provides an alternative way to submit
          content to DropCal. The extension:
        </p>
        <ul>
          <li>
            Reads your authentication token from dropcal.ai to keep you signed
            in — the extension's content script runs only on dropcal.ai and
            www.dropcal.ai
          </li>
          <li>
            Stores your authentication token, recent session history, and
            display preferences (theme, date format) locally in your browser
            using Chrome's storage API
          </li>
          <li>
            Sends text, images, and files you submit to api.dropcal.ai for
            processing — the same backend described in this policy
          </li>
          <li>
            Does not collect browsing history, track activity on other websites,
            or inject content into any page other than dropcal.ai
          </li>
        </ul>
        <p>
          All locally stored extension data is cleared when you sign out.
          Uninstalling the extension removes all locally stored data.
        </p>

        <h2>Data Security</h2>
        <p>
          OAuth tokens used to access your calendar are encrypted at rest using
          industry-standard encryption (Fernet symmetric encryption) before
          being stored in our database. All data is transmitted over HTTPS. File
          uploads are stored in access-controlled cloud storage with
          time-limited signed URLs.
        </p>

        <h2>Data Retention and Deletion</h2>
        <p>
          Your sessions, events, and uploaded files are stored for as long as
          you maintain your account. You can delete individual sessions and
          their associated data at any time through the app.
        </p>
        <p>
          If you disconnect a calendar provider, we delete the associated
          access tokens from our active systems. If you delete your account, we
          delete all of your data from our active systems, including your
          profile, sessions, events, uploaded files, learned preferences, and
          stored embeddings. Residual copies may persist in encrypted backups
          for a limited period before being overwritten.
        </p>
        <p>
          You may also revoke DropCal's access to your Google account at any
          time through your{' '}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Account permissions
          </a>
          .
        </p>

        <h2>Cookies and Tracking</h2>
        <p>
          We use essential cookies for authentication and session management
          (via Supabase). We use PostHog for product analytics (page views and
          feature usage). We do not use advertising cookies or sell data to
          advertisers.
        </p>

        <h2>Your Rights</h2>
        <p>You can:</p>
        <ul>
          <li>Access and view all data stored in your account</li>
          <li>Delete individual sessions and their associated events</li>
          <li>
            Disconnect any calendar provider, which removes stored access tokens
          </li>
          <li>
            Revoke calendar access at any time through your calendar provider's
            account settings
          </li>
          <li>
            Delete your account and all associated data directly from the app
            settings
          </li>
        </ul>

        <h2>Children</h2>
        <p>
          DropCal is not intended for use by anyone under the age of 13. We do
          not knowingly collect personal information from children under 13. If
          we become aware that we have collected data from a child under 13, we
          will take steps to delete it promptly.
        </p>

        <h2>Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. We will notify users of
          significant changes by updating the date at the top of this page.
          Your continued use of DropCal after changes are posted constitutes
          acceptance of the updated policy.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy? Reach us at{' '}
          <a href="mailto:privacy@dropcal.ai">privacy@dropcal.ai</a>.
        </p>
      </div>
    </div>
  )
}
