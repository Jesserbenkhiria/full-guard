import type { Metadata } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "BLACK SHIELD SÉCURITÉ PRIVÉE",
    template: "%s | BLACK SHIELD",
  },
  description:
    "BLACK SHIELD SÉCURITÉ PRIVÉE — assistant de planification du personnel de sécurité.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <TooltipProvider>
          {children}
          <Toaster richColors closeButton />
        </TooltipProvider>
      </body>
    </html>
  );
}
