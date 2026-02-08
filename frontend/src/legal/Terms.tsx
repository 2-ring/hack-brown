import { PageHeader } from '../components/PageHeader'
import './Legal.css'

export function Terms() {
  return (
    <div className="legal">
      <PageHeader />
      <div className="legal-content">
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: February 7, 2026</p>

        <p>
          By using DropCal ("the Service"), you agree to these terms. If you do
          not agree, please do not use the Service.
        </p>

        <h2>What DropCal Does</h2>
        <p>
          DropCal is a tool that extracts calendar events from unstructured input
          (text, images, audio, documents) and formats them for your calendar. The
          Service uses AI to interpret your input and generate event details.
        </p>

        <h2>Your Account</h2>
        <p>
          You can use DropCal as a guest with limited functionality, or sign in
          with Google for full access. You are responsible for maintaining the
          security of your account and for all activity under your account.
        </p>

        <h2>Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful purpose</li>
          <li>Attempt to interfere with or disrupt the Service</li>
          <li>Circumvent rate limits or access restrictions</li>
          <li>Use automated tools to scrape or extract data from the Service</li>
        </ul>

        <h2>Your Content</h2>
        <p>
          You retain ownership of any content you submit to DropCal. By using the
          Service, you grant us a limited license to process your content for the
          purpose of extracting and formatting calendar events. We do not claim
          ownership of your content.
        </p>

        <h2>AI-Generated Output</h2>
        <p>
          DropCal uses AI to interpret your input and generate calendar events.
          While we strive for accuracy, AI-generated output may contain errors.
          You are responsible for reviewing events before adding them to your
          calendar. We recommend verifying dates, times, and details before
          confirming.
        </p>

        <h2>Calendar Integration</h2>
        <p>
          When you connect your Google Calendar, events are only created when you
          explicitly confirm. DropCal does not modify or delete your existing
          calendar events. You can revoke calendar access at any time through your
          Google Account settings.
        </p>

        <h2>Service Availability</h2>
        <p>
          We aim to keep DropCal available and reliable, but we do not guarantee
          uninterrupted access. The Service may be temporarily unavailable for
          maintenance or due to factors beyond our control.
        </p>

        <h2>Limitation of Liability</h2>
        <p>
          DropCal is provided "as is" without warranties of any kind. We are not
          liable for any damages arising from your use of the Service, including
          but not limited to missed events, incorrect event details, or scheduling
          conflicts. Our total liability is limited to the amount you have paid us
          in the twelve months preceding the claim.
        </p>

        <h2>Changes to These Terms</h2>
        <p>
          We may update these terms from time to time. Continued use of the
          Service after changes constitutes acceptance of the updated terms.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms? Reach us at{' '}
          <a href="mailto:hello@dropcal.ai">hello@dropcal.ai</a>.
        </p>
      </div>
    </div>
  )
}
