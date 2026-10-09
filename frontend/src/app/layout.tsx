import "@cloudscape-design/global-styles/index.css";
import "./globals.css";
import "./console-chrome.css";

import type { Metadata } from "next";

import { Providers } from "@/components/layout/Providers";

export const metadata: Metadata = {
  title: "Route 53 Management Console",
  description: "A functional clone of the AWS Route 53 console: hosted zones, DNS records, routing policies and a DNS simulator.",
};

// Applies the saved theme before first paint to avoid a light-mode flash.
const THEME_SCRIPT = `try{if(localStorage.getItem('r53-theme')==='dark')document.body.classList.add('awsui-dark-mode')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Cloudscape renders with Open Sans; App Router has no _document, so the root layout loads it. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&display=swap" rel="stylesheet" />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%238c4fff'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-family='Arial' font-weight='700' font-size='15' fill='white'%3E53%3C/text%3E%3C/svg%3E" />
      </head>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
