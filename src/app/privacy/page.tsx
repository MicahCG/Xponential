export const metadata = {
  title: "Privacy Policy – Xponential",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed text-gray-700">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="mb-8 text-gray-500">Last updated: May 18, 2026</p>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          1. Introduction
        </h2>
        <p>
          Xponential (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;)
          operates a brand-aware social publishing platform that lets brand
          owners draft, approve, and publish content to their own connected
          accounts on platforms including X (Twitter), Pinterest, and TikTok.
          This Privacy Policy explains what we collect, why we collect it, and
          what choices you have about your data when you use our service at{" "}
          <a
            href="https://xponential-two.vercel.app"
            className="text-blue-600 underline"
          >
            xponential-two.vercel.app
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          2. Information We Collect
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account information:</strong> email address, display name,
            and the brand identities you create inside Xponential.
          </li>
          <li>
            <strong>Platform OAuth credentials:</strong> access tokens, refresh
            tokens, granted scopes, and token expiration timestamps issued by
            connected platforms (X, Pinterest, TikTok). Used only to perform
            actions you explicitly initiate on those platforms.
          </li>
          <li>
            <strong>Connected account profile data:</strong> the username,
            display name, account identifier (e.g. Pinterest username, TikTok
            open_id), and (for Pinterest) board names returned by the
            platform&apos;s API when you connect.
          </li>
          <li>
            <strong>Content data:</strong> the pins, posts, videos, drafts, and
            associated metadata (title, description, image or video URL,
            destination link, alt text, board selection) that you create or
            approve inside Xponential.
          </li>
          <li>
            <strong>Operational logs:</strong> a record of every API call we
            make to connected platforms — including the endpoint, HTTP status
            code, and a redacted copy of the request and response body — kept
            for audit, debugging, and your own visibility (see{" "}
            <code>/pinterest/logs</code>).
          </li>
          <li>
            <strong>Usage data:</strong> basic analytics about how you interact
            with our platform (page views, feature usage).
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          3. How We Use Your Information
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>To authenticate you and maintain your session.</li>
          <li>
            To publish content to your connected social media accounts only on
            your explicit instruction — every publish action requires a human
            click inside Xponential.
          </li>
          <li>
            To list and select destinations (e.g. Pinterest boards) you own, so
            content lands where you intend.
          </li>
          <li>
            To generate AI-assisted draft suggestions that match your writing
            style; these drafts are never published without your approval.
          </li>
          <li>To improve, maintain, and secure the platform.</li>
        </ul>
        <p className="mt-3">
          We do not sell your personal data, your platform tokens, or your
          content to third parties. We do not use your data for advertising.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          4. Pinterest API and Pinterest Data
        </h2>
        <p className="mb-3">
          Xponential uses Pinterest&apos;s official API (v5) to let brand
          owners publish approved pins to their own Pinterest accounts. We
          adhere to Pinterest&apos;s Developer Guidelines, API Terms of Use,
          and Pinterest&apos;s own{" "}
          <a
            href="https://policy.pinterest.com/en/privacy-policy"
            className="text-blue-600 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
          .
        </p>
        <p className="mb-2 font-medium text-gray-900">
          OAuth scopes we request:
        </p>
        <ul className="mb-3 list-disc space-y-1 pl-5">
          <li>
            <code>user_accounts:read</code> — to display the connected handle
            and account profile inside the connection dashboard.
          </li>
          <li>
            <code>boards:read</code> — to list your boards so you can select
            where a pin should go.
          </li>
          <li>
            <code>pins:read</code> — to surface pins you&apos;ve previously
            published through Xponential.
          </li>
          <li>
            <code>pins:write</code> — to create a single pin at a time on the
            board you select, only when you click Publish.
          </li>
        </ul>
        <p className="mb-3">
          We do not write to your boards, modify existing pins, follow or
          unfollow users, or take any action on Pinterest beyond creating the
          single pin you approve in the composer. Pinterest content is never
          shared with other Xponential users or sold or licensed to third
          parties.
        </p>
        <p>
          You can revoke Xponential&apos;s access to your Pinterest account at
          any time by clicking <strong>Disconnect</strong> on{" "}
          <code>/connections/pinterest</code>, which clears the OAuth tokens
          from our database, or by removing the app from your Pinterest account
          settings.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          5. TikTok API and TikTok Data
        </h2>
        <p className="mb-3">
          Xponential uses TikTok&apos;s official Content Posting API (v2) to
          let brand owners send video drafts to their own TikTok account
          inboxes. We adhere to TikTok&apos;s Developer Terms of Service, API
          Terms, and TikTok&apos;s own{" "}
          <a
            href="https://www.tiktok.com/legal/page/global/privacy-policy/en"
            className="text-blue-600 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
          .
        </p>
        <p className="mb-2 font-medium text-gray-900">
          OAuth scopes we request:
        </p>
        <ul className="mb-3 list-disc space-y-1 pl-5">
          <li>
            <code>user.info.basic</code> — to display the connected account&apos;s
            display name, open_id, and avatar inside the connection dashboard.
          </li>
          <li>
            <code>video.upload</code> — to send a single video to your
            TikTok&apos;s inbox/drafts so you can review and publish it from
            the TikTok app. Xponential does not publish directly to your
            TikTok feed.
          </li>
        </ul>
        <p className="mb-3">
          When you compose a TikTok draft in Xponential, the video URL you
          provide is sent to TikTok via{" "}
          <code>POST /v2/post/publish/inbox/video/init/</code>. TikTok pulls
          the video and places it in your account&apos;s drafts inbox. The
          final decision to publish always happens inside the TikTok app — we
          cannot bypass that step. TikTok content is never shared with other
          Xponential users or sold or licensed to third parties.
        </p>
        <p>
          You can revoke Xponential&apos;s access to your TikTok account at
          any time by clicking <strong>Disconnect</strong> on{" "}
          <code>/connections/tiktok</code>, which clears the OAuth tokens
          from our database, or by removing the app from your TikTok account
          settings.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          6. Third-Party Services
        </h2>
        <p className="mb-2">
          We use the following third-party services to operate the platform.
          Each handles only the data necessary to deliver its function:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Pinterest API</strong> — for board listing and pin
            publishing on your behalf via OAuth.
          </li>
          <li>
            <strong>TikTok API</strong> — for sending video drafts to your
            TikTok inbox on your behalf via OAuth (Content Posting API v2).
          </li>
          <li>
            <strong>X (Twitter) API</strong> — for content actions on your X
            account via OAuth.
          </li>
          <li>
            <strong>Anthropic (Claude)</strong> — to generate draft content
            suggestions. Your platform tokens are never sent to Anthropic.
          </li>
          <li>
            <strong>Supabase</strong> — for database hosting (Postgres).
            Storage is access-controlled and tokens are stored server-side
            only.
          </li>
          <li>
            <strong>Vercel</strong> — for application hosting and serverless
            function execution.
          </li>
          <li>
            <strong>Apify</strong> — used in limited internal/developer
            tooling for backup posting paths; not part of the production
            Pinterest or TikTok paths, which use the platforms&apos; official
            APIs exclusively.
          </li>
        </ul>
        <p className="mt-3">
          Each service has its own privacy policy and data-handling practices,
          which we encourage you to review.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          7. Data Storage and Security
        </h2>
        <p>
          Your data is stored in a secure Postgres database hosted by Supabase
          and accessed only by Xponential&apos;s server-side code running on
          Vercel. OAuth tokens and platform secrets are stored server-side and
          never exposed to the browser or client. We implement
          industry-standard security measures — including HTTPS in transit,
          authenticated database connections, and scoped per-brand access
          controls — to protect your information from unauthorized access.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          8. Data Retention and Deletion
        </h2>
        <p className="mb-3">
          We retain your data for as long as your account is active. You may
          disconnect any individual platform connection at any time through the
          Xponential UI, which immediately revokes our use of the
          corresponding OAuth tokens.
        </p>
        <p>
          You may request full deletion of your account and all associated data
          at any time by contacting us at the email below. Upon a deletion
          request, your account, brands, platform connections, OAuth tokens,
          content history, and operational logs will be removed within 30
          days. Content already published to your Pinterest or X account, and
          TikTok drafts already sent to your inbox, remain on those platforms
          unless you delete them there.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          9. Your Rights
        </h2>
        <p className="mb-2">
          Depending on your location, you may have the right to:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Access the personal data we hold about you.</li>
          <li>Request correction or deletion of your data.</li>
          <li>
            Revoke OAuth access at any time via the{" "}
            <strong>Disconnect</strong> button on the relevant connection page
            in Xponential, or via your Pinterest, TikTok, or X account
            settings.
          </li>
          <li>Opt out of data processing where applicable.</li>
          <li>Lodge a complaint with a supervisory authority.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          10. Children&apos;s Privacy
        </h2>
        <p>
          Xponential is not directed to children under 13 (or the equivalent
          minimum age in your jurisdiction), and we do not knowingly collect
          personal data from children. If you believe a child has provided us
          personal data, please contact us so we can remove it.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          11. Changes to This Policy
        </h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify
          you of significant changes by updating the date at the top of this
          page. Continued use of the platform after changes constitutes
          acceptance of the updated policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          12. Contact
        </h2>
        <p>
          If you have questions about this Privacy Policy, want to exercise
          your data rights, or need to report a privacy concern, please contact
          us at{" "}
          <a
            href="mailto:giraudelc@gmail.com"
            className="text-blue-600 underline"
          >
            giraudelc@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
