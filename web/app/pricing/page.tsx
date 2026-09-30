import { BuyButton } from '@/components/BuyButton';
import { ADDON, PACKS, PLANS } from '@/lib/plans';

export const metadata = { title: 'Pricing' };

export default function Pricing() {
  return (
    <div className="wrap" style={{ paddingTop: 40 }}>
      <h1 style={{ fontSize: '2.4rem' }}>Pricing</h1>
      <p className="muted">Start free with 10 minutes. Subscriptions reset monthly; minute packs never expire.</p>

      <div className="grid g3" style={{ marginTop: 24 }}>
        {PLANS.map((p) => (
          <div key={p.key} className={`card plan ${p.key === 'pro' ? 'featured' : ''}`}>
            <h3>{p.name}</h3>
            <p className="muted small">{p.blurb}</p>
            <div className="price">${p.price}<small>/month</small></div>
            <ul className="clean" style={{ marginTop: 14 }}>
              <li>{p.minutes.toLocaleString()} minutes per month</li>
              <li>Transcribe links &amp; uploads</li>
              <li>Translate into 40 languages</li>
              <li>SRT, VTT, TXT, JSON export</li>
            </ul>
            <BuyButton kind="plan" itemKey={p.key} label={`Choose ${p.name}`} primary={p.key === 'pro'} />
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 48 }}>Need more? Buy minutes as you go</h2>
      <div className="grid g3">
        {PACKS.map((k) => (
          <div key={k.key} className="card">
            <div className="price">${k.price}</div>
            <p className="muted">{k.minutes.toLocaleString()} minutes · ${(k.price / k.minutes).toFixed(3)}/min · never expire</p>
            <BuyButton kind="pack" itemKey={k.key} label="Buy pack" />
          </div>
        ))}
      </div>

      <h2 id="addon" style={{ marginTop: 48 }}>Add-on: download videos &amp; audio</h2>
      <div className="card row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="grow">
          <h3 style={{ marginBottom: 4 }}>{ADDON.name} <span className="price" style={{ fontSize: '1.3rem' }}>${ADDON.price}<small>/month</small></span></h3>
          <p className="muted" style={{ margin: 0 }}>Save the video (MP4, up to 4K) or audio-only (MP3) from supported links, on top of any plan. Only for content you own or have permission to download. Downloads also use minutes (1 per 10 minutes of media).</p>
        </div>
        <div style={{ minWidth: 200 }}><BuyButton kind="addon" itemKey={ADDON.key} label="Add downloads" /></div>
      </div>

      <div className="card" style={{ marginTop: 40 }}>
        <h3>How minutes are counted</h3>
        <ul className="clean">
          <li>Transcription: 1 minute per minute of audio/video (rounded up).</li>
          <li>Each translation language: +0.5 minute per minute of audio/video.</li>
          <li>AI summary (overview, key takeaways, chapters, quotes): +0.2 minute per minute of audio/video (minimum 1).</li>
          <li>Downloading a video or audio file: 1 minute per 10 minutes of media (minimum 1).</li>
          <li>If a job fails, the minutes are refunded automatically.</li>
        </ul>
      </div>
    </div>
  );
}
