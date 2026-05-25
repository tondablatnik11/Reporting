import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/lib/data-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Labor Management & Reporting",
  description: "Hellmann Logistics Labor Management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className={`${inter.className} min-h-full flex flex-col bg-[#030507] text-[#e8ecf4]`}>
        <DataProvider>
          {children}
        </DataProvider>
      </body>
    </html>
  );
}
