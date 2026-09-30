import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Einbürgerung / German citizenship assistant",
  description:
    "Bilingual assistant for questions about German citizenship and naturalisation, grounded in current law and official sources.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
