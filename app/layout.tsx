import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crosscast",
  description: "Cross-platform content creation workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
