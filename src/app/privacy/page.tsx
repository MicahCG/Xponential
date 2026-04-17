export const metadata = {
  title: "Privacy Policy – Xponential",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed text-gray-700">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="mb-8 text-gray-500">Last updated: March 10, 2026</p>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">1. Introduction</h2>
        <p>
          Xponential (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates a social media automation
          platform that helps users schedule and publish content on X (Twitter).
          This Privacy Policy explains how we collect, use, and protect your information when
          you use our service at xponential-two.vercel.app.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">2. Information We Collect</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account information:</strong> Email address and name provided during sign-up.
          </li>
          <li>
            <strong>Social media tokens:</strong> OAuth access tokens for X, used
            solely to post content on your behalf.
          </li>
          <li>
            <strong>Content data:</strong> Posts, replies, and drafts you create within the
            platform.
          </li>
          <li>
            <strong>Usage data:</strong> Basic analytics about how you interact with our
            platform (page views, feature usage).
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">3. How We Use Your Information</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>To authenticate you and maintain your session.</li>
          <li>To publish content to your connected social media accounts on your instruction.</li>
          <li>To generate AI-assisted content that matches your writing style.</li>
          <li>To improve and maintain the platform.</li>
        </ul>
        <p className="mt-3">
          We do not sell your personal data to third parties. We do not use your data for
          advertising purposes.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">4. Third-Party Services</h2>
        <p className="mb-2">We use the following third-party services to operate the platform:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>X (Twitter) API</strong> – to post content to your X account.</li>
          <li><strong>Anthropic (Claude)</strong> – to generate content suggestions.</li>
          <li><strong>Supabase</strong> – for database and storage.</li>
          <li><strong>Vercel</strong> – for hosting and deployment.</li>
        </ul>
        <p className="mt-3">
          Each service has its own privacy policy and data handling practices.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">5. Data Storage and Security</h2>
        <p>
          Your data is stored in a secure database hosted by Supabase. OAuth tokens are
          encrypted at rest. We implement industry-standard security measures to protect
          your information from unauthorized access.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">6. Data Retention</h2>
        <p>
          We retain your data for as long as your account is active. You may request deletion
          of your account and associated data at any time by contacting us at the email below.
          Upon deletion, your OAuth tokens and personal data will be removed within 30 days.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">7. Your Rights</h2>
        <p className="mb-2">Depending on your location, you may have the right to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Access the personal data we hold about you.</li>
          <li>Request correction or deletion of your data.</li>
          <li>Revoke OAuth access at any time via your X account settings.</li>
          <li>Opt out of data processing where applicable.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">8. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of significant
          changes by updating the date at the top of this page. Continued use of the platform
          after changes constitutes acceptance of the updated policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">9. Contact</h2>
        <p>
          If you have questions about this Privacy Policy or want to exercise your data rights,
          please contact us at:{" "}
          <a
            href="mailto:privacy@xponential.app"
            className="text-blue-600 underline"
          >
            privacy@xponential.app
          </a>
        </p>
      </section>
    </main>
  );
}
