import type { Metadata } from "next";
import { Cormorant_Garamond, Marcellus_SC, Spectral } from "next/font/google";
import { AppFrame } from "@/components/frame";
import { LabProvider } from "@/lib/lab/provider";
import "./globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
});
const body = Spectral({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-body",
});
const label = Marcellus_SC({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-label",
});

export const metadata: Metadata = {
  title: "imortal_vampires_spawning_frankenstains",
  description:
    "Describe your night's work out loud. A Familiar learns each task once, and then it runs every night with no AI in it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${label.variable}`}
    >
      <body>
        <LabProvider>
          <AppFrame>{children}</AppFrame>
        </LabProvider>
      </body>
    </html>
  );
}
