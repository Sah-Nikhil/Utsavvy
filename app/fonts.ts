import {
  Anek_Devanagari,
  Fraunces,
  Tiro_Devanagari_Hindi,
} from "next/font/google";

// All product text, Latin and Devanagari in one family, normal width
// (IMPLEMENTATION_PLAN.md section 7.1).
export const anek = Anek_Devanagari({
  subsets: ["latin", "devanagari"],
  weight: "variable",
  display: "swap",
  variable: "--font-anek",
});

// English display headings and Section labels, upright only (look D has no
// italic). Its Latin subset has no ₹: amounts use <Money> in Anek.
export const fraunces = Fraunces({
  subsets: ["latin"],
  weight: "variable",
  style: "normal",
  axes: ["opsz", "SOFT"],
  display: "swap",
  variable: "--font-fraunces",
});

// Standalone Hindi display only, upright 400 (its only weight). Devanagari
// subset only: Latin text never uses Tiro, so nothing Latin is preloaded.
export const tiro = Tiro_Devanagari_Hindi({
  subsets: ["devanagari"],
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-tiro",
});
