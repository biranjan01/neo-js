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

const SITE_URL = "https://neopeptide-rho.vercel.app";

export const metadata: Metadata = {
  title: "NeoPeptide — Neoantigen Vaccine Prediction Pipeline | Cancer Immunotherapy",
  description:
    "Automated 15-step computational pipeline for neoantigen vaccine candidate identification in cancer immunotherapy research. MHC-I/II binding prediction (NetMHCpan 4.1), B-cell epitopes (BepiPred 3.0), antigenicity (VaxiJen), allergenicity (AllerTOP), toxicity (ToxinPred), physicochemical analysis (ProtParam), and HLA population coverage. Handles 500K+ peptides with chunked IEDB processing. Docker-based, open source.",
  keywords: [
    "neoantigen",
    "vaccine design",
    "cancer immunotherapy",
    "bioinformatics",
    "immunoinformatics",
    "MHC binding prediction",
    "NetMHCpan",
    "epitope prediction",
    "IEDB",
    "VaxiJen",
    "AllerTOP",
    "ToxinPred",
    "BepiPred",
    "ProtParam",
    "ExPASy",
    "MAFFT",
    "multiple sequence alignment",
    "HLA population coverage",
    "neoepitope",
    "tumor antigens",
    "cancer vaccine",
    "computational biology",
    "Docker",
    "Next.js",
    "FastAPI",
    "open source",
  ],
  authors: [{ name: "Ravi" }, { name: "S. Shriya" }],
  creator: "Ravi & S. Shriya",
  publisher: "Ravi & S. Shriya",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "NeoPeptide",
    title: "NeoPeptide — Neoantigen Vaccine Prediction Pipeline",
    description:
      "Automated 15-step computational pipeline for neoantigen vaccine candidate identification in cancer immunotherapy. MHC-I/II binding, B-cell epitopes, antigenicity, toxicity, immunogenicity scoring, and HLA population coverage. Docker-based, handles 500K+ peptides.",
    images: [
      {
        url: "/favicon.svg",
        width: 512,
        height: 512,
        alt: "NeoPeptide — Neoantigen Vaccine Prediction Pipeline",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NeoPeptide — Neoantigen Vaccine Prediction Pipeline",
    description:
      "Automated 15-step computational pipeline for neoantigen vaccine candidate identification in cancer immunotherapy. Docker-based, open source.",
    images: ["/favicon.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  manifest: "/manifest.json",
  alternates: {
    canonical: SITE_URL,
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
