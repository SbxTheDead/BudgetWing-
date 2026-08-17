import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BudgetWing — AI Budget Flight Optimizer",
  description:
    "An agentic AI that explores thousands of route and date combinations to fit the most destinations into your budget.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-base text-foreground">
        {children}
      </body>
    </html>
  );
}
