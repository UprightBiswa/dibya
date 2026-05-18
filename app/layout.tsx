import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dibya & Biswajit Love Room",
  description: "A private caring room for Dibya and Biswajit to chat, play, share gifts, photos, and daily love notes."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
