'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LANGUAGES } from '@/lib/languages';
import { createClient } from '@/lib/supabase/client';

export default function NewJobForm({ hasAddon = false }: { hasAddon?: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<'url' | 'upload'>('url');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [wantTranscript, setWantTranscript] = useState(true);
  const [wantSummary, setWantSummary] = useState(false);
  const [wantDownload, setWantDownload] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'mp4' | 'mp3'>('mp4');
  const [downloadQuality, setDownloadQuality] = useState(1080);
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const addTarget = (c: string) => c && !targets.includes(c) && targets.length < 5 && setTargets([...targets, c]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (tab === 'url' && !url.trim()) return setError('Paste a link first.');
    if (tab === 'upload' && !file) return setError('Choose a file first.');
    if (!wantTranscript && !(wantDownload && tab === 'url')) return setError('Choose at least one thing to do.');
    if (!rights) return setError('Please confirm you have the right to process this content.');
    setBusy(true);
    try {
      let body: Record<string, unknown> = {
        wantTranscript, wantSummary: wantTranscript && wantSummary, wantDownload: tab === 'url' && wantDownload, downloadFormat, downloadQuality,
        sourceLanguage: sourceLanguage || null, targetLanguages: targets, rightsConfirmed: rights,
      };
      if (tab === 'url') {
        body = { ...body, sourceType: 'url', url: url.trim() };
      } else {
        setPhase('Uploading file…');
        const s = await fetch('/api/uploads/sign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file!.name, size: file!.size }) });
        const sj = await s.json();
        if (!s.ok) throw new Error(sj.error ?? 'Upload failed.');
        const { error: upErr } = await createClient().storage.from('uploads').uploadToSignedUrl(sj.path, sj.token, file!, { contentType: file!.type || 'application/octet-stream' });
        if (upErr) throw new Error('Upload failed: ' + upErr.message);
        body = { ...body, sourceType: 'upload', uploadPath: sj.path, filename: file!.name };
      }
      setPhase('Starting…');
      const r = await fetch('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Could not start the job.');
      setUrl(''); setFile(null);
      router.push(`/jobs/${j.id}`);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong.');
    } finally {
      setBusy(false); setPhase('');
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="tabs" role="tablist">
        <button type="button" className={tab === 'url' ? 'on' : ''} onClick={() => setTab('url')}>Paste a link</button>
        <button type="button" className={tab === 'upload' ? 'on' : ''} onClick={() => setTab('upload')}>Upload a file</button>
      </div>

      {tab === 'url' ? (
        <div>
          <label className="field" htmlFor="u">Video or audio link</label>
          <input id="u" type="url" placeholder="https://www.youtube.com/watch?v=…  ·  vimeo, instagram, tiktok, facebook…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      ) : (
        <div
          className={`drop ${over ? 'over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
        >
          <input ref={fileRef} type="file" hidden accept="audio/*,video/*,.mkv,.m4a,.opus,.flac" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? <strong>{file.name} <span className="muted">({(file.size / 1048576).toFixed(1)} MB)</span></strong> : <span className="muted">Drop an audio or video file here, or click to browse (up to 2 GB)</span>}
        </div>
      )}

      <div className="stack">
        <label className="check"><input type="checkbox" checked={wantTranscript} onChange={(e) => setWantTranscript(e.target.checked)} /><span><strong>Transcribe</strong> <span className="muted small">— text with timestamps, SRT/VTT export</span></span></label>
        {wantTranscript && (
          <label className="check"><input type="checkbox" checked={wantSummary} onChange={(e) => setWantSummary(e.target.checked)} /><span><strong>AI summary</strong> <span className="muted small">— overview, key takeaways, chapters and quotes (+0.2 min per minute)</span></span></label>
        )}
        {tab === 'url' && (
          hasAddon ? (
            <label className="check"><input type="checkbox" checked={wantDownload} onChange={(e) => setWantDownload(e.target.checked)} /><span><strong>Download the media</strong> <span className="muted small">— save the video or audio file</span></span></label>
          ) : (
            <label className="check" style={{ cursor: 'default', opacity: 0.85 }}><input type="checkbox" disabled /><span><strong>Download the media</strong> <span className="pill">Add-on</span> <span className="muted small">— <a href="/pricing#addon">unlock downloads</a> to save video or audio files</span></span></label>
          )
        )}
      </div>

      {tab === 'url' && wantDownload && (
        <div className="row">
          <div><label className="field" htmlFor="fmt">Format</label>
            <select id="fmt" value={downloadFormat} onChange={(e) => setDownloadFormat(e.target.value as 'mp4' | 'mp3')}><option value="mp4">Video (MP4)</option><option value="mp3">Audio only (MP3)</option></select></div>
          {downloadFormat === 'mp4' && (
            <div><label className="field" htmlFor="q">Max quality</label>
              <select id="q" value={downloadQuality} onChange={(e) => setDownloadQuality(Number(e.target.value))}>{[360, 480, 720, 1080, 1440, 2160].map((q) => <option key={q} value={q}>{q}p</option>)}</select></div>
          )}
        </div>
      )}

      {wantTranscript && (
        <div className="stack">
          <div className="row">
            <div className="grow"><label className="field" htmlFor="sl">Spoken language</label>
              <select id="sl" value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)}>
                <option value="">Auto-detect</option>
                {Object.entries(LANGUAGES).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select></div>
            <div className="grow"><label className="field" htmlFor="tl">Translate into (up to 5)</label>
              <select id="tl" value="" onChange={(e) => addTarget(e.target.value)}>
                <option value="">Add a language…</option>
                {Object.entries(LANGUAGES).filter(([c]) => !targets.includes(c)).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select></div>
          </div>
          {targets.length > 0 && (
            <div className="chips">{targets.map((t) => <span className="chip" key={t}>{LANGUAGES[t]}<button type="button" aria-label={`Remove ${LANGUAGES[t]}`} onClick={() => setTargets(targets.filter((x) => x !== t))}>×</button></span>)}</div>
          )}
        </div>
      )}

      <label className="check"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} /><span className="small">I own this content or have permission to download, transcribe and translate it, and I agree to the <a href="/terms" target="_blank">Terms</a>.</span></label>

      {error && <div className="alert err">{error}</div>}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted small">Cost: 1 min per minute · +0.5 per translation · +0.2 for a summary · downloads 1 per 10 min. Failed jobs are refunded.</span>
        <button className="btn primary" disabled={busy}>{busy ? phase || 'Working…' : 'Start'}</button>
      </div>
    </form>
  );
}
