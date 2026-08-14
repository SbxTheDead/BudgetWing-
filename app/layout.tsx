import type { Metadata } from "next";
import { Chakra_Petch, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Display: angular, instrument-panel lettering for headings and city codes.
const chakra = Chakra_Petch({
  variable: "--font-chakra",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

// Body: geometric humanist sans, high legibility at small sizes.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

// Data: tabular figures for prices, times and durations.
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BudgetWing — AI Budget Flight Optimizer",
  description:
    "An agentic AI that explores thousands of route and date combinations to fit the most destinations into your budget.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${chakra.variable} ${manrope.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink-950 text-chalk">
        {children}
      </body>
    </html>
  );
}
