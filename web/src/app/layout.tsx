import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'BoxGym Admin',
  description: 'Boxing gym management panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-gray-950 text-white">
        <nav className="border-b border-gray-800 px-8 py-3 flex gap-6 text-sm text-gray-400">
          <Link href="/dashboard" className="hover:text-white transition-colors">📊 Дашборд</Link>
          <Link href="/schedule"  className="hover:text-white transition-colors">📅 Расписание</Link>
          <Link href="/athletes"  className="hover:text-white transition-colors">👥 Атлеты</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
