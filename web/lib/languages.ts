export const LANGUAGES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian',
  nl: 'Dutch', ru: 'Russian', uk: 'Ukrainian', pl: 'Polish', tr: 'Turkish', ar: 'Arabic',
  he: 'Hebrew', hi: 'Hindi', bn: 'Bengali', ur: 'Urdu', id: 'Indonesian', ms: 'Malay',
  vi: 'Vietnamese', th: 'Thai', zh: 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)',
  ja: 'Japanese', ko: 'Korean', sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish',
  el: 'Greek', cs: 'Czech', ro: 'Romanian', hu: 'Hungarian', sw: 'Swahili', yo: 'Yoruba',
  ig: 'Igbo', ha: 'Hausa', tl: 'Filipino', fa: 'Persian', ta: 'Tamil', te: 'Telugu',
};
export const langName = (c: string) => LANGUAGES[c] ?? (c === 'und' ? 'Original' : c);
