"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light/dark themes via the `.dark` class, following the system setting by default. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
