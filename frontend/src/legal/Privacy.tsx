import { PageHeader } from '../components/PageHeader'
import './Legal.css'

export function Privacy() {
  return (
    <div className="legal">
      <PageHeader />
      <div className="legal-content">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: February 7, 2026</p>

        <p>
          DropCal ("we", "our", "us") operates the dropcal.ai website and service.
          This policy explains how we collect, use, and protect your information.
        </p>

        <h2>Information We Collect</h2>

        <h3>Account Information</h3>
        <p>
          When you sign in with Google, we receive your name, email address, and
          profile photo from your Google account. We use this to create and manage
          your DropCal account.
        </p>

        <h3>Calendar Data</h3>
        <p>
          With your permission, we access your Google Calendar to check for
          scheduling conflicts and to create new events on your behalf. We read
          your existing events solely for conflict detection and do not modify or
          delete your existing calendar entries.
        </p>

        <h3>Content You Provide</h3>
        <p>
          When you use DropCal, you may submit text, images, audio recordings,
          PDFs, or URLs. We process this content to extract calendar event
          information. Your input content and the resulting events are stored in
          your account so you can access your session history.
        </p>

        <h3>Guest Sessions</h3>
        <p>
          You can use DropCal without an account. Guest sessions are stored with
          an anonymous identifier and can be migrated to a full account if you
          later sign in.
        </p>

        <h2>How We Use Your Information</h2>
        <ul>
          <li>To extract calendar events from your input</li>
          <li>To check for scheduling conflicts with your existing calendar</li>
          <li>To create events in your Google Calendar when you confirm</li>
          <li>To improve event formatting based on your preferences over time</li>
          <li>To maintain your session history</li>
        </ul>

        <h2>Third-Party Services</h2>
        <p>
          We use the following third-party services to operate DropCal. Your data
          may be processed by these services as described:
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> — Database hosting, authentication, and file
            storage. Stores your account data, sessions, and uploaded files.
          </li>
          <li>
            <strong>Google</strong> — OAuth authentication and Calendar API
            integration. We request calendar access with your explicit consent.
          </li>
          <li>
            <strong>AI Providers (Anthropic, OpenAI, xAI)</strong> — Your input
            text and extracted event data are sent to AI models for processing.
            These providers process data according to their respective privacy
            policies and do not use API inputs for model training.
          </li>
          <li>
            <strong>Deepgram</strong> — Audio files are sent for transcription when
            you submit audio recordings.
          </li>
        </ul>

        <h2>Data Security</h2>
        <p>
          OAuth tokens (used to access your calendar) are encrypted at rest using
          industry-standard encryption before being stored. All data is transmitted
          over HTTPS.
        </p>

        <h2>Data Retention</h2>
        <p>
          Your sessions and events are stored for as long as you maintain your
          account. You can delete individual sessions at any time. If you wish to
          delete your account and all associated data, contact us at the email
          below.
        </p>

        <h2>Cookies and Tracking</h2>
        <p>
          We use essential cookies for authentication (session management via
          Supabase). We do not use analytics trackers, advertising cookies, or
          any third-party tracking scripts.
        </p>

        <h2>Your Rights</h2>
        <p>You can:</p>
        <ul>
          <li>Access and view all data stored in your account</li>
          <li>Delete individual sessions and their associated events</li>
          <li>Revoke calendar access at any time through your Google Account settings</li>
          <li>Request full account deletion by contacting us</li>
        </ul>

        <h2>Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. We will notify users of
          significant changes by updating the date at the top of this page.
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
