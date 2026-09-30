export interface Segment { start: number; end: number; text: string }

const pad = (n: number, l = 2) => String(n).padStart(l, '0');

function ts(sec: number, sep: ',' | '.'): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

/** Guarantee monotonic, non-overlapping, non-zero-length cues (players choke otherwise). */
function clean(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const nextStart = segs[i + 1]?.start ?? Infinity;
    let end = Math.min(s.end, nextStart);
    if (end <= s.start) end = s.start + 0.5;
    out.push({ start: s.start, end, text: s.text.replace(/\s+\n/g, '\n').trim() });
  }
  return out;
}

export const toSrt = (segs: Segment[]) =>
  clean(segs).map((s, i) => `${i + 1}\n${ts(s.start, ',')} --> ${ts(s.end, ',')}\n${s.text}\n`).join('\n');

export const toVtt = (segs: Segment[]) =>
  'WEBVTT\n\n' + clean(segs).map((s) => `${ts(s.start, '.')} --> ${ts(s.end, '.')}\n${s.text}\n`).join('\n');

export const toTxt = (segs: Segment[]) => segs.map((s) => s.text.trim()).join('\n');

export const fmtClock = (sec: number) => {
  const t = Math.floor(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return (h ? `${h}:${pad(m)}` : `${m}`) + `:${pad(t % 60)}`;
};
