import './globals.css';
import { Mascot } from '@/components/Mascot/Mascot';

export const metadata = {
  title: 'FutureStorage — AI Storage from Singapore to Space',
  description: 'AI-powered storage with smart value-based routing. Local, regional, or orbital — your items, your orbit.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
        <div className="fixed bottom-6 right-6 z-50">
          <Mascot />
        </div>
      </body>
    </html>
  );
}
