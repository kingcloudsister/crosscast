import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crosscast",
  description: "Cross-platform content creation workspace",
  icons: {
    icon: "/crosscast-icon.png",
    apple: "/crosscast-icon.png",
  },
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
