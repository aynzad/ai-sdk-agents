import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Human-in-the-Loop - ai-sdk-agents",
  description:
    "An approval workflow where tool calls require user confirmation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
