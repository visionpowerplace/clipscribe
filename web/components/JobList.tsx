'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { langName } from '@/lib/languages';

export interface JobRow {
  id: string; title: string | null; platform: string | null; thumbnail: string | null; status: string; stage: string | null;
  progress: number; error: string | null; duration_seconds: number | null; target_languages: string[]; created_at: string;
}

export const STAGE_LABEL: Record<string, string> = {
  probing: 'Checking link', downloading: 'Downloading', extracting: 'Preparing audio', transcribing: 'Transcribing', translating: 'Translating', summarizing: 'Summarizing', uploading: 'Saving file',
};

export default function JobList({ initial }: { initial: JobRow[] }) {
  const [jobs, setJobs] = useState<JobRow[]>(initial);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch('/api/jobs', { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); if (!stop) setJobs(j.jobs); }
      } catch {}
      const active = jobsRef.current.some((x) => x.status === 'queued' || x.status === 'processing');
      if (!stop) timer = setTimeout(tick, active ? 3000 : 20000);
    };
    timer = setTimeout(tick, 3000);
    return () => { stop = true; clearTimeout(timer); };
  }, []);

  if (!jobs.length) return <p className="muted">No jobs yet. Paste a link or upload a file above to get started.</p>;
  return (
    <div>
      {jobs.map((j) => (
        <Link className="job" key={j.id} href={`/jobs/${j.id}`}>
          {j.thumbnail ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={j.thumbnail} alt="" /> : <div className="thumb-ph" />}
          <div className="info">
            <strong>{j.title ?? 'Untitled'}</strong>
            <span className="muted small">
              {j.platform ?? ''}{j.duration_seconds ? ` · ${Math.ceil(j.duration_seconds / 60)} min` : ''}
              {j.target_languages?.length ? ` · → ${j.target_languages.map(langName).join(', ')}` : ''}
            </span>
            {(j.status === 'processing' || j.status === 'queued') && (
              <div style={{ marginTop: 6 }}><div className="progress"><div style={{ width: `${Math.max(3, j.progress)}%` }} /></div></div>
            )}
            {j.status === 'failed' && j.error && <span className="small" style={{ color: 'var(--bad)' }}>{j.error}</span>}
          </div>
          <span className={`status ${j.status}`}>{j.status === 'processing' ? (j.stage ? STAGE_LABEL[j.stage] ?? 'Processing' : 'Processing') : j.status}</span>
        </Link>
      ))}
    </div>
  );
}
