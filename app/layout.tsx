import type { Metadata } from "next";
import { DotGothic16, Press_Start_2P } from "next/font/google";
import "./globals.css";

// 日本語が使えるピクセルフォント。8bit の見た目はほぼこれで決まる。
const dot = DotGothic16({
  variable: "--font-dot",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

// 英数字と見出し用
const press = Press_Start_2P({
  variable: "--font-press",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const SITE = "https://jev-asks-until-sure.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "バレる。｜ AIがあなたを言い当てる",
  description:
    "いくつかの質問に答えるだけで、AIがあなたの文章人格・出身地・年代・性格を言い当てます。AIが確信した時点で質問は止まります。TypeSafe の System One モデル Jev で動いています。",
  openGraph: {
    title: "バレる。",
    description: "AIが かくしんした じてんで、しつもんは とまります。",
    type: "website",
    url: SITE,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "バレる。" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "バレる。",
    description: "AIが かくしんした じてんで、しつもんは とまります。",
    images: ["/og.png"],
  },
};

export const viewport = { themeColor: "#12121f" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${dot.variable} ${press.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
