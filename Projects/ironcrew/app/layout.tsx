import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

import { siteUrl } from "@/lib/site";

const defaultUrl = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  applicationName: "SEMA Fitness",
  title: "SEMA Fitness - Grow better everyday",
  description: "All around fitness come from SEMA - Strength, Endurance, Mobility, and Agility.",
  openGraph: {
    title: "SEMA Fitness - Grow better everyday",
    description: "All around fitness come from SEMA - Strength, Endurance, Mobility, and Agility.",
    siteName: "SEMA Fitness",
    type: "website",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "SEMA Fitness",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SEMA Fitness - Grow better everyday",
    description: "All around fitness come from SEMA - Strength, Endurance, Mobility, and Agility.",
    images: [
      {
        url: "/twitter-image.png",
        width: 1200,
        height: 630,
        alt: "SEMA Fitness",
      },
    ],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
