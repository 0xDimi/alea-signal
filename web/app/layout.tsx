import type { Metadata } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";

import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Alea Market Screener",
  description: "Internal market screener + researchability score.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${instrumentSans.variable} ${fraunces.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
