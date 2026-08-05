import type { Metadata } from "next";
import "./globals.css";
import "@notionlike/editor/styles.css";

export const metadata: Metadata = { title: "NotionLike", description: "Your self-hosted workspace" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

