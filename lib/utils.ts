import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge our own theme names (app/globals.css), so `text-body`
// is read as a font size and not as a colour that `text-ink` would replace.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "label", "body", "title", "headline", "display"],
      shadow: ["item", "overlay", "sheet"],
      ease: ["standard", "emphasized"],
    },
  },
});

/** Joins class names and lets later Tailwind classes win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
