export interface Job {
  id: string;
  user_id: string;
  source_type: 'url' | 'upload';
  source_url: string | null;
  upload_path: string | null;
  original_filename: string | null;
  want_transcript: boolean;
  want_download: boolean;
  want_summary: boolean;
  download_format: 'mp4' | 'mp3';
  download_quality: number;
  source_language: string | null;
  target_languages: string[];
  status: string;
  attempts: number;
  credits_charged: boolean;
  credit_cost: number | null;
  title: string | null;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface Summary {
  lang: string;
  tldr: string;
  key_points: string[];
  chapters: { start: number; title: string }[];
  quotes: { start: number; text: string }[];
}
