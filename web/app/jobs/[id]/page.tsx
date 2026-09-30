import { notFound } from 'next/navigation';
import JobView from '@/components/JobView';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Job' };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: job } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
  if (!job) notFound();
  const { data: transcripts } = await supabase.from('transcripts').select('lang,is_original,segments').eq('job_id', id);
  const { media_path, upload_path, worker_id, ...safe } = job;
  return <JobView id={id} initialJob={{ ...safe, has_media: !!media_path } as any} initialTranscripts={(transcripts ?? []) as any} />;
}
