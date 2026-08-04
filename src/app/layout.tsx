import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://github.com/biranjan01/neopeptide";

export const metadata: Metadata = {
  title: "NeoPeptide — Neoantigen Vaccine Prediction Pipeline",
  description:
    "Automated 14-step computational pipeline for neoantigen vaccine candidate identification in cancer immunotherapy research. Cloud-based, open source.",
  keywords: [
    "neoantigen",
    "vaccine design",
    "cancer immunotherapy",
    "bioinformatics",
    "MHC binding prediction",
    "NetMHCpan",
    "epitope prediction",
    "Vercel",
    "open source",
  ],
  authors: [{ name: "Ravi" }, { name: "S. Shriya" }],
  creator: "Ravi & S. Shriya",
  publisher: "Ravi & S. Shriya",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content="#030712" />
        <meta name="msapplication-TileColor" content="#030712" />
      </head>
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">{children}</body>
    </html>
  );
}
