import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "つもる ― 見積アシスト",
  description: "過去の見積を溜めて、似た案件から見積の叩き台・判定・手戻り注意を出す。地場印刷向けPoC。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
