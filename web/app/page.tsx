import Link from 'next/link';
import { PACKS, PLANS } from '@/lib/plans';

const name = process.env.NEXT_PUBLIC_APP_NAME || 'ClipScribe';

const PLATFORMS = ['YouTube', 'Vimeo', 'Instagram', 'TikTok', 'Facebook', 'X / Twitter', 'Reddit', 'Dailymotion', 'Twitch clips', 'SoundCloud', 'Direct MP3/MP4 links', '1000+ more'];

export default function Home() {
  return (
    <>
      <div className="wrap hero">
        <h1>Turn any video or audio into<br />accurate text, in any language.</h1>
        <p className="lead">Paste a link or upload a file. Get a timestamped transcript, subtitles (SRT/VTT) and translations in 40 languages — in minutes. Add an AI summary with key takeaways and chapters. Add-on: save the video or audio too.</p>
        <div className="cta">
          <Link href="/login" className="btn primary">Start free — 10 minutes on us</Link>
          <Link href="/pricing" className="btn">See pricing</Link>
        </div>
      </div>

      <section className="block wrap">
        <div className="grid g3">
          <div className="card"><h3>Transcribe links</h3><p className="muted">YouTube, Vimeo, Instagram, TikTok, Facebook and more. Paste the URL — we fetch the audio and transcribe it.</p></div>
          <div className="card"><h3>Transcribe files</h3><p className="muted">Upload audio or video up to 2 GB: MP3, WAV, M4A, MP4, MOV, MKV, WebM and others.</p></div>
          <div className="card"><h3>Translate</h3><p className="muted">Get subtitles and text in Spanish, French, German, Portuguese, Arabic, Hindi, Chinese, Japanese and 30+ more.</p></div>
          <div className="card"><h3>Download media <span className="pill">Add-on</span></h3><p className="muted">Optionally save the video or audio-only MP3 from supported links — for content you own or have permission to use.</p></div>
          <div className="card"><h3>Export anywhere</h3><p className="muted">SRT and VTT subtitles, plain text, or JSON with timestamps for your own tools.</p></div>
          <div className="card"><h3>Private by default</h3><p className="muted">Your files are deleted after processing. Downloads expire after {7} days. Delete any job any time.</p></div>
        </div>
      </section>

      <section className="block wrap">
        <h2>Works with the sites you use</h2>
        <div className="chips">{PLATFORMS.map((p) => <span className="chip" key={p}>{p}</span>)}</div>
        <p className="muted small" style={{ marginTop: 14 }}>Some platforms restrict access to private, age-gated or region-locked videos. When a link can&apos;t be fetched, upload the file instead.</p>
      </section>

      <section className="block wrap">
        <h2>Simple pricing</h2>
        <p className="muted">One minute of audio or video = one credit. Start free, upgrade when you need more.</p>
        <div className="grid g3">
          {PLANS.map((p) => (
            <div className="card" key={p.key}><h3>{p.name}</h3><div className="price">${p.price}<small>/mo</small></div><p className="muted">{p.minutes.toLocaleString()} minutes / month</p></div>
          ))}
          <div className="card"><h3>Pay as you go</h3><div className="price">${PACKS[0].price}<small> / {PACKS[0].minutes} min</small></div><p className="muted">Minute packs that never expire.</p></div>
        </div>
        <p style={{ marginTop: 16 }}><Link href="/pricing" className="btn">Compare plans</Link></p>
      </section>
      <section className="wrap narrow" style={{ textAlign: 'center', padding: '20px 20px 0' }}>
        <h2>Try {name} free</h2>
        <p className="muted">No credit card required.</p>
        <Link href="/login" className="btn primary">Create your account</Link>
      </section>
    </>
  );
}
