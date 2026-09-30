export const LANGUAGES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian',
  nl: 'Dutch', ru: 'Russian', uk: 'Ukrainian', pl: 'Polish', tr: 'Turkish', ar: 'Arabic',
  he: 'Hebrew', hi: 'Hindi', bn: 'Bengali', ur: 'Urdu', id: 'Indonesian', ms: 'Malay',
  vi: 'Vietnamese', th: 'Thai', zh: 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)',
  ja: 'Japanese', ko: 'Korean', sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish',
  el: 'Greek', cs: 'Czech', ro: 'Romanian', hu: 'Hungarian', sw: 'Swahili', yo: 'Yoruba',
  ig: 'Igbo', ha: 'Hausa', tl: 'Filipino', fa: 'Persian', ta: 'Tamil', te: 'Telugu',
};

// Whisper's verbose_json returns the language as an English name ("english"). Map back to ISO codes.
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(LANGUAGES).map(([code, name]) => [name.toLowerCase().replace(/ \(.*\)/, ''), code]),
);
NAME_TO_CODE['mandarin'] = 'zh';
NAME_TO_CODE['chinese'] = 'zh';
NAME_TO_CODE['norwegian'] = 'no';
NAME_TO_CODE['tagalog'] = 'tl';

export function whisperLanguageToCode(name: string | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (LANGUAGES[n]) return n; // already a code
  return NAME_TO_CODE[n] ?? null;
}
