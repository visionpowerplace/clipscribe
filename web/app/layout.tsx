import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';

const name = process.env.NEXT_PUBLIC_APP_NAME || 'ClipScribe';

export const metadata: Metadata = {
  title: { default: `${name} — Transcribe, translate & download videos`, template: `%s · ${name}` },
  description: 'Paste a link or upload a file. Get an accurate transcript, translations in 40 languages, and downloadable media in minutes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
        <footer className="site">
          <div className="wrap">
            <span>© {new Date().getFullYear()} {name}</span>
            <span><a href="/pricing">Pricing</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></span>
          </div>
        </footer>
      </body>
    </html>
  );
}
