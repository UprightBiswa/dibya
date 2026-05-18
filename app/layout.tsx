import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HeartLink",
  description: "A private social chat app for profiles, friend requests, shared rooms, messages, photos, themes, and small love games."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
