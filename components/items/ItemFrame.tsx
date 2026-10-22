import { MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import {
  FunctionMarker,
  type FunctionIndex,
} from "@/components/ui/function-marker";
import { PointingRing } from "@/components/shell/PointingRing";
import { scriptClass } from "@/lib/script";
import { cn } from "@/lib/utils";

/*
 * The shell every Item kind is built on (IMPLEMENTATION_PLAN.md section 7.1):
 * title, kind, provenance line, actions, Comment count and presence. It only
 * lays things out; each Item kind brings its own body and does its own data work.
 */

export type ItemFrameProps = {
  /** The Item's kind as Members read it: "Budget", "Timeline", "Vendor", "Note" ... */
  kind: string;
  /** A Lucide icon element for the kind, e.g. <Wallet />. */
  icon?: ReactNode;
  title: ReactNode;
  /** Heading level for the title, to fit the page outline. */
  headingLevel?: 2 | 3 | 4;
  /** Short facts after the kind, e.g. "₹25,00,000 total". */
  meta?: ReactNode;
  /** Where this came from: "Added by Meera · 10:12", "from example.in · seen 21 Oct 2026". */
  provenance?: ReactNode;
  /** Item actions (icon Buttons or a Menu). Shown on hover or focus where hover exists. */
  actions?: ReactNode;
  /** Number of Comments; 0 shows a quiet "Comment" affordance, undefined hides it. */
  commentCount?: number;
  onCommentsClick?: () => void;
  /** Avatars of Members looking at this Item right now (e.g. <AvatarStack>). */
  presence?: ReactNode;
  /** The Member has selected this Item (indigo). */
  selected?: boolean;
  /** The Assistant is pointing at this Item (marigold ring). */
  pointed?: boolean;
  /** The Function this Item belongs to, if any; its marker shows the Function's colour. */
  functionIndex?: FunctionIndex;
  functionName?: string;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
};

export function ItemFrame({
  kind,
  icon,
  title,
  headingLevel = 3,
  meta,
  provenance,
  actions,
  commentCount,
  onCommentsClick,
  presence,
  selected = false,
  pointed = false,
  functionIndex,
  functionName,
  className,
  bodyClassName,
  children,
}: ItemFrameProps) {
  const Heading = `h${headingLevel}` as const;

  const comments =
    commentCount === undefined ? null : (
      <CommentCount count={commentCount} onClick={onCommentsClick} />
    );

  const frame = (
    <article
      data-selected={selected ? "" : undefined}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group/item relative flex min-w-0 flex-col rounded-md border border-item-line bg-surface text-ink shadow-item",
        "transition-[box-shadow,border-color] duration-(--dur-feedback) ease-standard",
        selected && "border-action ring-1 ring-action",
        className,
      )}
    >
      <header className="flex items-start gap-2.5 px-4 pt-3.5 pb-2">
        {icon ? (
          <span aria-hidden className="mt-[3px] flex text-ink-3 [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <Heading
            className={cn(
              "truncate-line min-w-0 font-display text-title text-ink",
              scriptClass(title),
            )}
          >
            {title}
          </Heading>
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-caption text-ink-3">
            <span>{kind}</span>
            {functionName ? (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  {functionIndex ? (
                    <FunctionMarker index={functionIndex} />
                  ) : null}
                  {functionName}
                </span>
              </>
            ) : null}
            {meta ? (
              <>
                <span aria-hidden>·</span>
                <span className="num text-ink-2">{meta}</span>
              </>
            ) : null}
          </p>
        </div>
        {presence ? (
          <div className="flex shrink-0 items-center pt-0.5">{presence}</div>
        ) : null}
        {actions ? (
          <div
            className={cn(
              "-mt-1 -mr-2 flex shrink-0 items-center gap-0.5",
              "transition-opacity duration-(--dur-feedback) ease-standard",
              "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/item:opacity-100",
              "[@media(hover:hover)]:group-focus-within/item:opacity-100",
              selected && "[@media(hover:hover)]:opacity-100",
            )}
          >
            {actions}
          </div>
        ) : null}
      </header>
      <div className={cn("min-w-0 flex-1 px-4 pb-3.5", bodyClassName)}>
        {children}
      </div>
      {provenance || comments ? (
        <footer className="flex min-h-10 items-center gap-3 border-t border-rule px-4 py-1.5 text-caption text-ink-3">
          <span className="min-w-0 flex-1 truncate">{provenance}</span>
          {comments}
        </footer>
      ) : null}
    </article>
  );

  if (!pointed) return frame;
  return (
    <PointingRing radiusClassName="rounded-md" labelAlign="end">
      {frame}
    </PointingRing>
  );
}

function CommentCount({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  const label =
    count === 0
      ? "Comment"
      : `${count} ${count === 1 ? "Comment" : "Comments"}`;
  const content = (
    <>
      <MessageSquare aria-hidden className="size-3.5" />
      <span className="num">{count === 0 ? "Comment" : count}</span>
    </>
  );
  const classes =
    "-mr-1.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-xs px-1.5 font-medium text-ink-2";
  if (!onClick) {
    return (
      <span className={classes}>
        {content}
        {count > 0 ? (
          <span className="sr-only">
            {count === 1 ? " Comment" : " Comments"}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(classes, "state-layer active:rounded-[3px]")}
    >
      {content}
    </button>
  );
}
