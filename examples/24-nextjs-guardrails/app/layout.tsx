import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guardrails Chat - ai-sdk-agents",
  description:
    "A chat interface with input and output guardrails powered by ai-sdk-agents",
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
