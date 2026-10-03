export const metadata = { title: 'Privacy Policy' };
const name = process.env.NEXT_PUBLIC_APP_NAME || 'ClipScribe';

export default function Privacy() {
  return (
    <div className="wrap narrow prose" style={{ paddingTop: 40 }}>
      <h1 style={{ fontSize: '2rem' }}>Privacy Policy</h1>
      <div className="alert" style={{ marginBottom: 20 }}><strong>Template — not legal advice.</strong> Have a qualified attorney review and adapt this before launch (GDPR/CCPA obligations depend on where your users are).</div>
      <p className="muted">Last updated: October 2, 2026</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account data: your email address and authentication details.</li>
        <li>Content you submit: links, uploaded audio/video, and the transcripts and translations we generate.</li>
        <li>Billing data: handled by Stripe. We never see or store your card number; we store your Stripe customer ID and plan status.</li>
        <li>Basic technical logs for security and debugging.</li>
      </ul>
      <h2>How we use it</h2>
      <p>To provide the Service, prevent abuse, process payments and support you. We do not sell your data and do not use your content to train AI models.</p>
      <h2>Service providers</h2>
      <p>{name} uses Supabase (database, authentication), Cloudflare R2 or Supabase Storage (file storage), OpenAI (speech-to-text and translation processing), Stripe (payments), Vercel and Railway (hosting). Your audio and text are sent to these providers only as needed to perform the Service.</p>
      <h2>Retention and deletion</h2>
      <p>Uploaded files are deleted after processing; downloaded media after 7 days. Transcripts stay until you delete the job. You can delete any job in the app, or email support@theclipscribe.com to delete your account and data.</p>
      <h2>Your rights</h2>
      <p>Depending on your location you may have rights to access, correct, export or delete your data. Contact support@theclipscribe.com.</p>
    </div>
  );
}
