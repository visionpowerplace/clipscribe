import Link from 'next/link';
import Icon from '@/components/Icons';
import { PACKS, PLANS } from '@/lib/plans';

const name = process.env.NEXT_PUBLIC_APP_NAME || 'ClipScribe';
const PLATFORMS = ['YouTube', 'Vimeo', 'Instagram', 'TikTok', 'Facebook', 'X / Twitter', 'Reddit', 'Dailymotion', 'Twitch clips', 'SoundCloud', 'Direct MP3/MP4 links', '1000+ more'];

const FEATURES = [
  { i: 'video', c: '', t: 'Transcribe links', d: 'Paste a YouTube, Vimeo, Instagram, TikTok or Facebook link. We fetch the audio and transcribe it with timestamps.' },
  { i: 'upload', c: 'cyan', t: 'Transcribe files', d: 'Upload audio or video: MP3, WAV, M4A, MP4, MOV, MKV, WebM and more.' },
  { i: 'globe', c: 'green', t: 'Translate in 40 languages', d: 'Subtitles and text in Spanish, French, German, Portuguese, Arabic, Hindi, Chinese, Japanese and more.' },
  { i: 'sparkle', c: 'pink', t: 'AI summaries', d: 'Get an overview, key takeaways, chapters and notable quotes without watching the whole video.' },
  { i: 'download', c: '', t: 'Download media', d: 'Optional add-on: save the video or audio-only MP3 from supported links, for content you own or may use.' },
  { i: 'shield', c: 'cyan', t: 'Private by default', d: 'Uploaded files are deleted once processed. Downloads expire after 7 days. Delete any job at any time.' },
];

const SAMPLE = [
  ['00:00', 'Welcome back to the channel. Today we are breaking down how to grow an audience from zero.'],
  ['00:07', 'First, pick one platform and commit to it for ninety days.'],
  ['00:14', 'Second, repurpose every video into short clips, captions and a written summary.'],
];

export default function Home() {
  return (
    <>
      <div className="wrap hero">
        <span className="pill eyebrow"><Icon name="bolt" size={14} /> AI transcription, translation &amp; summaries</span>
        <h1>Turn any video or audio into<br /><span className="grad-text">accurate text, in any language.</span></h1>
        <p className="lead">Paste a link or upload a file. Get a timestamped transcript, SRT/VTT subtitles, translations in 40 languages and an AI summary, in minutes.</p>
        <div className="cta">
          <Link href="/login" className="btn primary lg">Start free: 10 minutes on us <Icon name="arrow" size={18} /></Link>
          <Link href="/pricing" className="btn lg">See pricing</Link>
        </div>
        <div className="card glow mock">
          <div className="bar"><i /><i /><i /><span>growth-masterclass.mp4 · English → Spanish</span></div>
          <div className="body">
            {SAMPLE.map(([t, s]) => (<div className="seg" key={t}><time>{t}</time><span>{s}</span></div>))}
          </div>
        </div>
        <div className="stats">
          <div className="card stat"><b>40</b><span className="muted small">languages</span></div>
          <div className="card stat"><b>SRT · VTT</b><span className="muted small">subtitle export</span></div>
          <div className="card stat"><b>1000+</b><span className="muted small">supported sites</span></div>
          <div className="card stat"><b>&lt; 5 min</b><span className="muted small">for most videos</span></div>
        </div>
      </div>

      <section className="block wrap">
        <div className="sec-head"><h2>Everything you need from a video</h2><p>One workspace for transcripts, subtitles, translations and summaries.</p></div>
        <div className="grid g3x">
          {FEATURES.map((f) => (
            <div className="card feature" key={f.t}>
              <div className={`ico ${f.c}`}><Icon name={f.i} /></div>
              <h3>{f.t}{f.t === 'Download media' && <> <span className="pill">Add-on</span></>}</h3>
              <p className="muted" style={{ margin: 0 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="block wrap">
        <div className="sec-head"><h2>How it works</h2></div>
        <div className="grid g3 steps">
          <div className="card step"><h3>Paste or upload</h3><p className="muted" style={{ margin: 0 }}>Drop in a link or a file and choose what you want: transcript, translation, summary.</p></div>
          <div className="card step"><h3>We process it</h3><p className="muted" style={{ margin: 0 }}>Speech recognition, translation and summarising run in the background. Leave the page if you like.</p></div>
          <div className="card step"><h3>Use the results</h3><p className="muted" style={{ margin: 0 }}>Read, copy, or export as TXT, SRT, VTT or JSON. Failed jobs are refunded automatically.</p></div>
        </div>
      </section>

      <section className="block wrap">
        <div className="sec-head"><h2>Works with the sites you use</h2></div>
        <div className="chips" style={{ justifyContent: 'center' }}>{PLATFORMS.map((p) => <span className="chip" key={p}>{p}</span>)}</div>
        <p className="muted small" style={{ marginTop: 16, textAlign: 'center' }}>Some platforms restrict private, age-gated or region-locked videos. When a link can&apos;t be fetched, upload the file instead.</p>
      </section>

      <section className="block wrap">
        <div className="sec-head"><h2>Simple pricing</h2><p>One minute of audio or video = one credit. Start free, upgrade when you need more.</p></div>
        <div className="grid g4">
          {PLANS.map((p) => (
            <div className={`card ${p.key === 'pro' ? 'plan featured' : ''}`} key={p.key}><h3>{p.name}</h3><div className="price">${p.price}<small>/mo</small></div><p className="muted" style={{ margin: 0 }}>{p.minutes.toLocaleString()} minutes / month</p></div>
          ))}
          <div className="card"><h3>Pay as you go</h3><div className="price">${PACKS[0].price}<small> / {PACKS[0].minutes} min</small></div><p className="muted" style={{ margin: 0 }}>Minute packs that never expire.</p></div>
        </div>
        <p style={{ marginTop: 18, textAlign: 'center' }}><Link href="/pricing" className="btn">Compare plans</Link></p>
      </section>

      <section className="wrap" style={{ paddingTop: 10 }}>
        <div className="cta-band"><h2>Try {name} free</h2><p className="muted">No credit card required. 10 free minutes on signup.</p><Link href="/login" className="btn primary lg">Create your account</Link></div>
      </section>
    </>
  );
}
