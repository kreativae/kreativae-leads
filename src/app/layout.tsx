import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell";
import { THEME_INIT_SCRIPT } from "@/components/theme";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  weight: ["400", "500", "600", "700"],
  display: 'swap',
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: 'swap',
});

export const metadata: Metadata = {
  title: "kreativ.ae — Radar de Leads",
  description:
    "Sistema interno de captação de leads: encontre empresas sem site ou com sites desatualizados e aborde pelo WhatsApp.",
};

/*
 * Exportar "viewport" faz o Next gerar a tag <meta viewport> só com os
 * campos daqui dentro — sem width/initialScale, o Safari mobile assume uma
 * viewport de desktop (~980px) e dá zoom pra encaixar, cortando as bordas
 * no primeiro acesso. viewport-fit=cover continua necessário pro
 * env(safe-area-inset-top) não devolver 0.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${grotesk.variable} ${inter.variable} font-sans bg-ink text-zinc-200 antialiased noise`}
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
