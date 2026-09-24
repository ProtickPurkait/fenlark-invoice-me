import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import "./globals.css";

const inter = localFont({
  src: [
    { path: "../../assets/fonts/Inter-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../assets/fonts/Inter-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../assets/fonts/Inter-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../assets/fonts/Inter-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Fenlark Billing", template: "%s · Fenlark Billing" },
  description: "Invoices, quotes and payments for fenlark.in",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={inter.variable}>
      <body className="min-h-screen font-sans">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
