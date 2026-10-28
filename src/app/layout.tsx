import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = DM_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const sans = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Sesim — System Design Simulator",
  description:
    "Design distributed systems on a canvas, place feature workloads on compute, and verify non-functional requirements.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The variables go on <html> so the html { font-family } rule in globals.css can resolve them.
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
