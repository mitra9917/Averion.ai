import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap"
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap"
});

const description =
  "Ask questions across your organization's documents. Every answer stays attached to the passage it came from.";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: {
    default: "Averion",
    template: "%s · Averion"
  },
  description,
  applicationName: "Averion",
  openGraph: {
    title: "Averion",
    description,
    siteName: "Averion",
    type: "website",
    locale: "en_US"
  },
  twitter: {
    card: "summary_large_image",
    title: "Averion",
    description
  }
};

export const viewport: Viewport = {
  themeColor: "#F8F8F7",
  colorScheme: "light"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const messages = await getMessages();

  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable}`}
      lang="en"
    >
      <body className="bg-canvas font-sans text-ink antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
