import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { GlobalNewMessageNotifier } from '@/components/GlobalNewMessageNotifier';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Atendimento aos Franqueados',
  description: 'Dashboard de acompanhamento e priorização de tickets SAF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Inicializa tema antes de renderizar para evitar flash.
            Padrão = claro; só aplica dark se o usuário escolheu explicitamente. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}})();`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans min-h-screen flex flex-col`}>
        {children}
        {/* Alertas de nova mensagem — global, continua ativo em qualquer tela */}
        <GlobalNewMessageNotifier />
      </body>
    </html>
  );
}
