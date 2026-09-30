'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { langName } from '@/lib/languages';
import { fmtClock, Segment } from '@/lib/subtitles';
import { STAGE_LABEL } from './JobList';

interface Job {
  id: string; title: string | null; platform: string | null; thumbnail: string | null; status: string; stage: string | null; progress: number;
  error: string | null; duration_seconds: number | null; detected_language: string | null; has_media: boolean; media_filename: string | null;
  source_url: string | null; want_download: boolean; credit_cost: number | null; summary: Summary | null;
}
interface Summary { tldr: string; key_points: string[]; chapters: { start: number; title: string }[]; quotes: { start: number; text: string }[] }
interface T { lang: string; is_original: boolean; segments: Segment[] }

export default function JobView({ id, initialJob, initialTranscripts }: { id: string; initialJob: Job; initialTranscripts: T[] }) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [ts, setTs] = useState(initialTranscripts);
  const [lang, setLang] = useState(initialTranscripts.find((t) => t.is_original)?.lang ?? initialTranscripts[0]?.lang ?? '');
  const [copied, setCopied] = useState(false);
  const [copiedSum, setCopiedSum] = useState(false);

  useEffect(() => {
    if (job.status === 'completed' || job.status === 'failed') return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/jobs/${id}`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      setJob(j.job); setTs(j.transcripts);
      if (j.job.status === 'completed') setLang((l) => l || j.transcripts.find((x: T) => x.is_original)?.lang || j.transcripts[0]?.lang || '');
    }, 2500);
    return () => clearInterval(t);
  }, [id, job.status]);

  const active = job.status === 'queued' || job.status === 'processing';
  const current = ts.find((t) => t.lang === lang);
  const ordered = [...ts].sort((a, b) => Number(b.is_original) - Number(a.is_original));

  async function copyText() {
    if (!current) return;
    await navigator.clipboard.writeText(current.segments.map((s) => s.text).join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }
  async function copySummary() {
    const s = job.summary;
    if (!s) return;
    const text = [s.tldr, '', 'Key takeaways:', ...s.key_points.map((k) => `- ${k}`), '', 'Chapters:', ...s.chapters.map((c) => `${fmtClock(c.start)} ${c.title}`)].join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedSum(true); setTimeout(() => setCopiedSum(false), 1500);
  }
  async function del() {
    if (!confirm('Delete this job, its transcripts and any saved file? This cannot be undone.')) return;
    const r = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    if (r.ok) router.push('/dashboard'); else alert((await r.json()).error ?? 'Could not delete.');
  }

  return (
    <div className="wrap" style={{ paddingTop: 32 }}>
      <p><a href="/dashboard">← Dashboard</a></p>
      <div className="row" style={{ alignItems: 'flex-start', marginBottom: 20 }}>
        {job.thumbnail && /* eslint-disable-next-line @next/next/no-img-element */ <img src={job.thumbnail} alt="" style={{ width: 160, borderRadius: 10 }} />}
        <div className="grow">
          <h1 style={{ fontSize: '1.6rem', wordBreak: 'break-word' }}>{job.title ?? 'Untitled'}</h1>
          <span className="muted small">
            {job.platform}{job.duration_seconds ? ` · ${fmtClock(job.duration_seconds)}` : ''}
            {job.detected_language && job.detected_language !== 'und' ? ` · spoken: ${langName(job.detected_language)}` : ''}
            {job.credit_cost ? ` · ${job.credit_cost} min used` : ''}
          </span>
        </div>
        <button className="btn sm danger" onClick={del} disabled={job.status === 'processing'}>Delete</button>
      </div>

      {active && (
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{job.status === 'queued' ? 'Waiting in queue…' : STAGE_LABEL[job.stage ?? ''] ?? 'Processing…'}</strong>
            <span className="muted small">{job.progress}%</span>
          </div>
          <div className="progress"><div style={{ width: `${Math.max(3, job.progress)}%` }} /></div>
          <span className="muted small">You can leave this page — it keeps running and shows up in your dashboard.</span>
        </div>
      )}

      {job.status === 'failed' && <div className="alert err">{job.error ?? 'This job failed.'} <span className="muted">Any minutes charged were refunded.</span></div>}

      {job.status === 'completed' && (
        <div className="stack">
          {job.has_media && (
            <div className="card row" style={{ justifyContent: 'space-between' }}>
              <div><strong>Your download is ready</strong><div className="muted small">{job.media_filename} · available for 7 days</div></div>
              <a className="btn primary" href={`/api/jobs/${id}/media`}>Download</a>
            </div>
          )}
          {job.summary && (
            <div className="card stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>AI summary</h2>
                <div className="row">
                  <button className="btn sm" onClick={copySummary}>{copiedSum ? 'Copied ✓' : 'Copy summary'}</button>
                  <a className="btn sm" href={`/api/jobs/${id}/export?format=summary`}>Download (.md)</a>
                </div>
              </div>
              <p dir="auto" style={{ margin: 0 }}>{job.summary.tldr}</p>
              {job.summary.key_points.length > 0 && (<div><strong>Key takeaways</strong><ul dir="auto" style={{ margin: '6px 0 0', paddingLeft: 20 }}>{job.summary.key_points.map((k, i) => <li key={i}>{k}</li>)}</ul></div>)}
              {job.summary.chapters.length > 0 && (<div><strong>Chapters</strong>{job.summary.chapters.map((c, i) => <div className="seg" key={i}><time>{fmtClock(c.start)}</time><span dir="auto">{c.title}</span></div>)}</div>)}
              {job.summary.quotes.length > 0 && (<div><strong>Notable quotes</strong>{job.summary.quotes.map((q, i) => <blockquote key={i} dir="auto" style={{ margin: '6px 0', paddingLeft: 12, borderLeft: '3px solid var(--border, #ccc)' }}>{q.text} <span className="muted small">({fmtClock(q.start)})</span></blockquote>)}</div>)}
            </div>
          )}
          {ts.length > 0 && (
            <div className="card stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="tabs" style={{ flexWrap: 'wrap' }}>
                  {ordered.map((t) => <button key={t.lang} className={t.lang === lang ? 'on' : ''} onClick={() => setLang(t.lang)}>{langName(t.lang)}{t.is_original ? ' (original)' : ''}</button>)}
                </div>
                <div className="row">
                  <button className="btn sm" onClick={copyText}>{copied ? 'Copied ✓' : 'Copy text'}</button>
                  {(['srt', 'vtt', 'txt', 'json'] as const).map((f) => (
                    <a key={f} className="btn sm" href={`/api/jobs/${id}/export?format=${f}&lang=${encodeURIComponent(lang)}`}>{f.toUpperCase()}</a>
                  ))}
                </div>
              </div>
              <div>
                {current?.segments.map((s, i) => (
                  <div className="seg" key={i}><time>{fmtClock(s.start)}</time><span dir="auto">{s.text}</span></div>
                ))}
              </div>
            </div>
          )}
          {ts.length === 0 && !job.has_media && <div className="alert">Nothing to show for this job.</div>}
        </div>
      )}
    </div>
  );
}
