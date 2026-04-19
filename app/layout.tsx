import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "교회 선거 실시간 집계",
  description: "팀별 입력 + 실시간 득표 대시보드"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
