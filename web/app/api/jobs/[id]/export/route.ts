import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { fmtClock, Segment, toSrt, toTxt, toVtt } from '@/lib/subtitles';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { supabase, res } = await requireUser();
  if (res) return res;
  const url = new URL(req.url);
  const format = url.searchParams.get('format') ?? 'srt';
  const lang = url.searchParams.get('lang');

  const { data: job } = await supabase.from('jobs').select('id,title,summary').eq('id', id).maybeSingle();
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (format === 'summary') {
    const s = job.summary as { tldr: string; key_points: string[]; chapters: { start: number; title: string }[]; quotes: { start: number; text: string }[] } | null;
    if (!s) return NextResponse.json({ error: 'No summary for this job.' }, { status: 404 });
    const md = [
      `# ${job.title ?? 'Summary'}`, '', '## Overview', s.tldr, '', '## Key takeaways', ...s.key_points.map((k) => `- ${k}`), '',
      '## Chapters', ...s.chapters.map((c) => `- ${fmtClock(c.start)} ${c.title}`),
      ...(s.quotes.length ? ['', '## Notable quotes', ...s.quotes.map((q) => `> ${q.text} (${fmtClock(q.start)})`)] : []), '',
    ].join('\n');
    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${(job.title ?? 'summary').replace(/[^\w.-]+/g, '_').slice(0, 60)}.summary.md"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  let q = supabase.from('transcripts').select('lang,segments,is_original').eq('job_id', id);
  q = lang ? q.eq('lang', lang) : q.eq('is_original', true);
  const { data: t } = await q.maybeSingle();
  if (!t) return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });

  const segs = t.segments as Segment[];
  const base = (job.title ?? 'transcript').replace(/[^\w.-]+/g, '_').slice(0, 60) + `.${t.lang}`;
  let body: string, type: string, ext: string;
  switch (format) {
    case 'vtt': body = toVtt(segs); type = 'text/vtt'; ext = 'vtt'; break;
    case 'txt': body = toTxt(segs); type = 'text/plain'; ext = 'txt'; break;
    case 'json': body = JSON.stringify({ language: t.lang, segments: segs }, null, 2); type = 'application/json'; ext = 'json'; break;
    default: body = toSrt(segs); type = 'application/x-subrip'; ext = 'srt';
  }
  return new NextResponse(body, {
    headers: {
      'Content-Type': `${type}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${base}.${ext}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
