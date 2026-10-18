import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

// 書体はデッキ(Claude Design 版)と同じ Zen Kaku Gothic New(WO-022・代表の決定)。
// ビルド時に取り込んで自分のサーバーから配る(画面を開くたびに Google へは取りに行かない)。
// 日本語の字は subsets に無いため preload はせず、読み込むまでは代わりのゴシックで出す(display: swap)。
const zen = Zen_Kaku_Gothic_New({
  weight: ["400", "700"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
  variable: "--font-zen",
});

export const metadata: Metadata = {
  title: "つもる ― 見積アシスト",
  description: "過去の見積を溜めて、似た案件から見積の叩き台・判定・手戻り注意を出す。地場印刷向けPoC。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${zen.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
