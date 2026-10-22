import { formatINR, formatLakh } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Classes every shown amount gets. The Fraunces subset has no ₹ (U+20B9), so
 * an amount inside a display heading would draw ₹ in a fallback font beside
 * Fraunces digits; setting the whole amount in Anek with tabular figures keeps
 * the sign and digits together.
 */
export const moneyClassName = "font-text num whitespace-nowrap";

/**
 * An amount in rupees with lakh grouping, e.g. ₹2,40,000 (or ₹25L with
 * `short`). Use it wherever an amount is shown, headings included.
 */
export function Money({
  amount,
  short = false,
  className,
}: {
  amount: number;
  short?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(moneyClassName, className)}>
      {short ? formatLakh(amount) : formatINR(amount)}
    </span>
  );
}
