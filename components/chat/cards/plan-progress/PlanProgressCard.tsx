"use client";

import { useQuery } from "convex/react";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { useId } from "react";
import type { ChatCardProps } from "@/components/chat/cards/registry";
import { Money } from "@/components/ui/money";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { progressLine } from "./progressLine";

/*
 * The first plan's progress in the Chat (S14): one line saying which Section
 * just landed and which is next, and the steps as a short list that ticks as
 * each Section fills on the Canvas. Live for every Member and Viewer.
 */
export function PlanProgressCard({ eventId, cardId }: ChatCardProps) {
  const headingId = useId();
  const progress = useQuery(
    api.plan.progress,
    cardId === null ? "skip" : { eventId, runId: cardId as Id<"runs"> },
  );
  if (cardId === null || progress === null) return null;
  if (progress === undefined) {
    return (
      <div
        aria-hidden
        className="h-28 animate-pulse rounded-md bg-surface-sunk motion-reduce:animate-none"
      />
    );
  }

  const { status, steps } = progress;
  const running = status === "running" || status === "queued";
  const finished = status === "done" && steps.every((s) => s.done);
  const stopped = !running && !finished;
  const current = steps.findIndex((s) => !s.done);
  const check = progress.budgetCheck;

  return (
    <section
      aria-labelledby={headingId}
      data-plan-progress={status}
      className={cn(
        "flex flex-col gap-2.5 rounded-md px-3.5 py-3 text-body",
        stopped
          ? "border border-rule bg-surface-sunk text-ink-2"
          : "bg-surface-raised shadow-item",
      )}
    >
      <header className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cn(
            "mt-1 grid size-5 shrink-0 place-items-center rounded-full",
            finished
              ? "bg-booked-soft text-booked"
              : stopped
                ? "bg-warn-soft text-warn"
                : "bg-selected text-on-selected",
          )}
        >
          {finished ? (
            <Check className="size-3.5" />
          ) : stopped ? (
            <TriangleAlert className="size-3" />
          ) : (
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
          )}
        </span>
        <div className="flex min-w-0 flex-col">
          <h3
            id={headingId}
            className="font-display text-title leading-tight text-ink"
          >
            {finished ? "Plan ready" : "Making your plan"}
          </h3>
          <p
            role="status"
            aria-live="polite"
            className="text-label text-ink-2"
            data-plan-progress-line
          >
            {progressLine(status, steps)}
          </p>
        </div>
      </header>

      <ol
        aria-label="Steps"
        className="grid grid-cols-2 gap-x-3 gap-y-1 pl-7.5 text-label"
      >
        {steps.map((step, i) => {
          const now = running && i === current;
          return (
            <li
              key={step.key}
              data-step={step.key}
              data-done={step.done || undefined}
              aria-current={now ? "step" : undefined}
              className={cn(
                "flex min-w-0 items-center gap-1.5",
                step.done ? "text-ink" : now ? "text-ink" : "text-ink-3",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rotate-45 rounded-[1px] transition-colors duration-300",
                  step.done ? "bg-motif" : now ? "bg-action" : "bg-rule-strong",
                )}
              />
              <span className={cn("truncate", now && "font-semibold")}>
                {step.label}
              </span>
              <span className="sr-only">
                {step.done ? ", done" : now ? ", under way" : ""}
              </span>
            </li>
          );
        })}
      </ol>

      {finished && check && progress.budgetTotal !== null ? (
        <p className="pl-7.5 text-label text-ink-2" data-plan-total>
          <Money
            amount={progress.budgetTotal}
            className="font-semibold text-ink"
          />{" "}
          in Estimates and Contingency
          {check.perHousehold !== null ? (
            <>
              , <Money amount={check.perHousehold} /> per household
            </>
          ) : null}
          .
        </p>
      ) : null}
    </section>
  );
}
