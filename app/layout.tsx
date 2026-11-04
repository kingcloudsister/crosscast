import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crosscast",
  description: "Cross-platform content creation workspace",
  applicationName: "Crosscast",
  icons: {
    icon: "/crosscast-icon.png",
    apple: "/icons/icon-180.png",
  },
  appleWebApp: {
    capable: true,
    title: "Crosscast",
    statusBarStyle: "default",
  },
  // Next emits only the standard tag; older iOS versions need the Apple one to open full-screen.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fefdf8",
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
