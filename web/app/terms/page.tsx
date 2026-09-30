export const metadata = { title: 'Terms of Service' };
const name = process.env.NEXT_PUBLIC_APP_NAME || 'ClipScribe';

export default function Terms() {
  return (
    <div className="wrap narrow prose" style={{ paddingTop: 40 }}>
      <h1 style={{ fontSize: '2rem' }}>Terms of Service</h1>
      <div className="alert" style={{ marginBottom: 20 }}><strong>Template — not legal advice.</strong> Have a qualified attorney review and adapt this text (and register a DMCA agent) before launching commercially.</div>
      <p className="muted">Last updated: [DATE]</p>

      <h2>1. The service</h2>
      <p>{name} (&quot;we&quot;, &quot;the Service&quot;) lets you transcribe, translate and, where technically possible, download audio and video that you submit by link or upload.</p>

      <h2>2. Your responsibility for content</h2>
      <ul>
        <li>You may only submit content that you own, that is in the public domain, or that you have permission or a legal right to download, copy, transcribe and translate.</li>
        <li>You are solely responsible for complying with the terms of service of any third-party platform (such as YouTube, Instagram, TikTok, Facebook or Vimeo) and with copyright and other laws in your jurisdiction.</li>
        <li>We do not verify ownership. We may refuse or remove any job and suspend accounts that we believe infringe rights or abuse the Service.</li>
      </ul>

      <h2>3. Prohibited use</h2>
      <p>You may not use the Service to infringe intellectual property, to process content depicting the exploitation of minors, to harass or deceive, to circumvent paywalls or DRM, to resell the Service without our written consent, or to overload or attack our systems.</p>

      <h2>4. Minutes, subscriptions and refunds</h2>
      <p>Usage is measured in minutes as described on the Pricing page. Subscription minutes reset each billing period and do not roll over. Purchased packs do not expire. Subscriptions renew automatically until cancelled from the billing portal. Minutes for a job that fails on our side are refunded automatically. Otherwise, payments are non-refundable except where required by law.</p>

      <h2>5. Accuracy</h2>
      <p>Transcripts and translations are produced by automated systems and may contain errors. Do not rely on them for legal, medical or safety-critical decisions without human review.</p>

      <h2>6. Data retention</h2>
      <p>Uploaded files are deleted after processing. Downloaded media is deleted after 7 days. Transcripts are kept until you delete the job or your account.</p>

      <h2>7. Copyright complaints (DMCA)</h2>
      <p>If you believe content processed through the Service infringes your copyright, contact [DESIGNATED AGENT EMAIL] with the information required by 17 U.S.C. § 512(c)(3). We will respond as required by law and terminate repeat infringers.</p>

      <h2>8. Disclaimers and liability</h2>
      <p>The Service is provided &quot;as is&quot;, without warranties. To the maximum extent permitted by law, our total liability is limited to the amount you paid us in the 3 months before the claim. Third-party platforms may block or change access at any time, so link downloads cannot be guaranteed.</p>

      <h2>9. Governing law</h2>
      <p>These terms are governed by the laws of [STATE/COUNTRY]. Contact: [SUPPORT EMAIL].</p>
    </div>
  );
}
