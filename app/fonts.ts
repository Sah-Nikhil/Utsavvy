import {
  Anek_Devanagari,
  Fraunces,
  Tiro_Devanagari_Hindi,
} from "next/font/google";

// Text, Latin and Devanagari in one family (IMPLEMENTATION_PLAN.md section 7.1).
export const anek = Anek_Devanagari({
  subsets: ["latin", "devanagari"],
  weight: "variable",
  display: "swap",
  variable: "--font-anek",
});

// English display headings.
export const fraunces = Fraunces({
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
  display: "swap",
  variable: "--font-fraunces",
});

// Hindi display headings.
export const tiro = Tiro_Devanagari_Hindi({
  subsets: ["devanagari", "latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-tiro",
});
