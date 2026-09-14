import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "薄荷溪居 · 生活手记",
  description: "睡眠、学习与生活习惯，按自己的节奏记录。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
