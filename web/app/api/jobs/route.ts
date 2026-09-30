import { after, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { LANGUAGES } from '@/lib/languages';
import { validateMediaUrl } from '@/lib/safe-url';
import { adminClient } from '@/lib/supabase/admin';

const MAX_ACTIVE_JOBS = 5;

export async function GET() {
  const { user, supabase, res } = await requireUser();
  if (res) return res;
  const { data, error } = await supabase
    .from('jobs')
    .select('id,title,platform,thumbnail,status,stage,progress,error,duration_seconds,detected_language,target_languages,want_download,media_path,source_type,created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data });
}

export async function POST(req: Request) {
  const { user, supabase, res } = await requireUser();
  if (res) return res;
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  if (b.rightsConfirmed !== true)
    return NextResponse.json({ error: 'Please confirm you have the right to process this content.' }, { status: 400 });

  const wantTranscript = b.wantTranscript !== false;
  const wantDownload = b.wantDownload === true && b.sourceType === 'url';
  if (!wantTranscript && !wantDownload) return NextResponse.json({ error: 'Choose at least one thing to do: transcribe or download.' }, { status: 400 });

  const targets: string[] = Array.isArray(b.targetLanguages) ? [...new Set<string>(b.targetLanguages.map(String))] : [];
  if (targets.some((t) => !LANGUAGES[t])) return NextResponse.json({ error: 'Unsupported translation language.' }, { status: 400 });
  if (targets.length > 5) return NextResponse.json({ error: 'You can translate into up to 5 languages per job.' }, { status: 400 });
  const sourceLanguage = b.sourceLanguage && LANGUAGES[b.sourceLanguage] ? String(b.sourceLanguage) : null;

  const row: Record<string, unknown> = {
    user_id: user!.id,
    want_transcript: wantTranscript,
    want_download: wantDownload,
    want_summary: wantTranscript && b.wantSummary === true,
    download_format: b.downloadFormat === 'mp3' ? 'mp3' : 'mp4',
    download_quality: [360, 480, 720, 1080, 1440, 2160].includes(b.downloadQuality) ? b.downloadQuality : 1080,
    source_language: sourceLanguage,
    target_languages: wantTranscript ? targets : [],
  };

  if (b.sourceType === 'url') {
    const v = validateMediaUrl(String(b.url ?? ''));
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    row.source_type = 'url';
    row.source_url = v.url;
    row.title = v.url.slice(0, 120);
  } else if (b.sourceType === 'upload') {
    const p = String(b.uploadPath ?? '');
    if (!p.startsWith(`${user!.id}/`) || p.includes('..')) return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
    row.source_type = 'upload';
    row.upload_path = p;
    row.original_filename = String(b.filename ?? 'upload').slice(0, 200);
    row.title = row.original_filename;
  } else {
    return NextResponse.json({ error: 'Invalid source.' }, { status: 400 });
  }

  // Fast pre-checks (the worker does the authoritative charge once it knows the duration).
  const { data: profile } = await supabase.from('profiles').select('sub_minutes,pack_minutes,downloads_addon').eq('id', user!.id).single();
  if (wantDownload && !profile?.downloads_addon)
    return NextResponse.json({ error: 'Downloading media needs the Downloads add-on.', code: 'addon_required' }, { status: 402 });
  if (!profile || profile.sub_minutes + profile.pack_minutes <= 0)
    return NextResponse.json({ error: 'You are out of minutes. Add minutes or upgrade your plan to continue.', code: 'no_credits' }, { status: 402 });

  const admin = adminClient();
  const { count } = await admin.from('jobs').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).in('status', ['queued', 'processing']);
  if ((count ?? 0) >= MAX_ACTIVE_JOBS)
    return NextResponse.json({ error: `You already have ${MAX_ACTIVE_JOBS} jobs running. Please wait for one to finish.` }, { status: 429 });

  const { data, error } = await admin.from('jobs').insert(row).select('id').single();
  if (error) return NextResponse.json({ error: 'Could not create the job.' }, { status: 500 });
  // Free worker hosts sleep when idle: poke the worker so it wakes up and claims the job.
  const workerUrl = process.env.WORKER_URL;
  if (workerUrl) {
    after(async () => {
      try {
        await fetch(`${workerUrl.replace(/\/$/, '')}/wake`, { headers: { 'x-worker-secret': process.env.WORKER_SECRET ?? '' }, signal: AbortSignal.timeout(20_000) });
      } catch { /* worker will pick the job up on its next poll anyway */ }
    });
  }
  return NextResponse.json({ id: data.id });
}
