import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Monitoramento de SAFs',
  description: 'Dashboard de acompanhamento e priorização de tickets SAF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Inicializa dark mode antes de renderizar para evitar flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}})();`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans min-h-screen flex flex-col`}>
        {children}
      </body>
    </html>
  );
}
