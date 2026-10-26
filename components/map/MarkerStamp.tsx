import { CategoryIllustration } from "@/components/vendors/CategoryIllustration";
import { cn } from "@/lib/utils";
import { TONE_CLASS, type MarkerTone } from "./markers";

/*
 * Our own Marker (IMPLEMENTATION_PLAN.md section 7.5), never MapLibre's
 * default: a rounded pin in the status colour with the category's line
 * drawing in a paper disc. An approximate Marker is the same shape, hollow,
 * with "approximate" under it. The tip sits on the Vendor's point.
 */

const PIN =
  "M18 44.5c-.6 0-1.1-.3-1.5-.8C10.2 35.4 3 27.4 3 18.2 3 9.8 9.7 3 18 3s15 6.8 15 15.2c0 9.2-7.2 17.2-13.5 25.5-.4.5-.9.8-1.5.8z";

export function MarkerPin({
  category,
  tone,
  approximate,
  selected = false,
  labelled = true,
  className,
}: {
  category: string;
  tone: MarkerTone;
  approximate: boolean;
  selected?: boolean;
  /** Shows "approximate" under the pin; a list row says it in its own badge. */
  labelled?: boolean;
  className?: string;
}) {
  const faint = tone === "other";
  return (
    <span
      data-marker-tone={tone}
      data-approximate={approximate || undefined}
      className={cn(
        "relative flex flex-col items-center",
        TONE_CLASS[tone],
        faint && !selected && "opacity-60",
        className,
      )}
    >
      <span
        className={cn(
          "relative block transition-transform duration-(--dur-shape) ease-standard",
          faint ? "h-[37px] w-[29px]" : "h-[46px] w-9",
          selected && "-translate-y-0.5 scale-115",
        )}
      >
        <svg
          viewBox="0 0 36 46"
          aria-hidden
          focusable="false"
          className="absolute inset-0 size-full overflow-visible drop-shadow-[0_2px_2px_var(--scrim)]"
        >
          <path
            d={PIN}
            fill={approximate ? "var(--surface)" : "currentColor"}
            stroke="currentColor"
            strokeWidth={approximate ? 2.25 : 1}
            strokeDasharray={approximate ? "4 2.5" : undefined}
          />
          <circle
            cx="18"
            cy="18.2"
            r="11.2"
            fill="var(--surface)"
            stroke={approximate ? "currentColor" : "none"}
            strokeOpacity={0.35}
          />
        </svg>
        <CategoryIllustration
          category={category}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 text-current",
            faint ? "top-[6px] size-[17px]" : "top-[7.5px] size-[21px]",
          )}
        />
      </span>
      {approximate && labelled ? (
        // Below the tip, out of the layout, so the pin's tip stays the anchor.
        <span className="absolute top-full left-1/2 mt-0.5 -translate-x-1/2 rounded-full border border-current bg-surface px-1.5 text-[10px] leading-[14px] font-semibold tracking-[0.01em] whitespace-nowrap">
          approximate
        </span>
      ) : null}
    </span>
  );
}
