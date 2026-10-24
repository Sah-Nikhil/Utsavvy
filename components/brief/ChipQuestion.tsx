"use client";

import { useMutation } from "convex/react";
import { Plus, SendHorizontal } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/field";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { functionKey, functionName } from "@/lib/brief/functions";
import {
  AnswerChip,
  BriefError,
  useBriefCall,
  type BriefSummaryData,
} from "./shared";

type Question = NonNullable<BriefSummaryData["question"]>;

/**
 * One chip question (docs/design/first-brief.md "Chip questions"). The
 * question itself is the Chat line above the card. Single-answer chips
 * answer on tap; Q7's Functions are toggles with "Add a Function" and Done.
 * Every question has a "type my own" box. Plain buttons and inputs, so it all
 * works from the keyboard.
 */
export function ChipQuestion({
  eventId,
  question,
}: {
  eventId: Id<"events">;
  question: Question;
}) {
  const answerChip = useMutation(api.brief.answerChip);
  const { run, busy, error } = useBriefCall((answer: string[]) =>
    answerChip({ eventId, question: question.id, answer }),
  );
  const [typing, setTyping] = useState<"own" | "day" | "month" | null>(null);

  if (question.multi) {
    return (
      <FunctionToggles
        key={question.id}
        question={question}
        busy={busy}
        error={error}
        onDone={(keys) => void run(keys)}
      />
    );
  }

  const tap = (value: string) => {
    if (value === "pick-day") return setTyping("day");
    if (value === "pick-month") return setTyping("month");
    void run([value]);
  };

  return (
    <div className="flex flex-col gap-2.5" data-brief-question={question.id}>
      <div
        role="group"
        aria-label={question.prompt}
        className="flex flex-wrap gap-1.5"
      >
        {question.chips.map((chip, index) => (
          <AnswerChip
            key={chip.value}
            onClick={() => tap(chip.value)}
            disabled={busy}
            emphasis={index === 0 && chip.value.startsWith("festival:")}
          >
            {chip.label}
          </AnswerChip>
        ))}
        {question.typeOwn && question.typeOwn.input !== "date" ? (
          <Button
            variant="text"
            size="sm"
            onClick={() => setTyping(typing === "own" ? null : "own")}
            aria-expanded={typing === "own"}
            disabled={busy}
          >
            Type my own
          </Button>
        ) : null}
      </div>
      {typing !== null ? (
        <TypeOwn
          key={typing}
          kind={
            typing === "day"
              ? "date"
              : typing === "month"
                ? "month"
                : (question.typeOwn?.input ?? "text")
          }
          label={
            typing === "day"
              ? "Pick a date"
              : typing === "month"
                ? "Pick the month"
                : (question.typeOwn?.label ?? "Type my own")
          }
          busy={busy}
          onSubmit={(value) =>
            void run([
              typing === "day"
                ? `day:${value}`
                : typing === "month"
                  ? `month:${value}`
                  : value,
            ])
          }
        />
      ) : null}
      <BriefError>{error}</BriefError>
    </div>
  );
}

function TypeOwn({
  kind,
  label,
  busy,
  onSubmit,
}: {
  kind: "text" | "count" | "amount" | "date" | "month";
  label: string;
  busy: boolean;
  onSubmit: (value: string) => void;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };
  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={id} className="text-caption font-medium text-ink-2">
          {label}
        </label>
        <Input
          id={id}
          autoFocus
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          type={kind === "date" ? "date" : kind === "month" ? "month" : "text"}
          inputMode={
            kind === "count"
              ? "numeric"
              : kind === "amount"
                ? "text"
                : undefined
          }
          placeholder={
            kind === "amount"
              ? "e.g. 15 lakh"
              : kind === "count"
                ? "e.g. 250"
                : undefined
          }
          maxLength={120}
        />
      </div>
      <Button
        type="submit"
        size="md"
        icon
        aria-label="Answer"
        disabled={busy || !value.trim()}
      >
        <SendHorizontal />
      </Button>
    </form>
  );
}

function FunctionToggles({
  question,
  busy,
  error,
  onDone,
}: {
  question: Question;
  busy: boolean;
  error: string | null;
  onDone: (keys: string[]) => void;
}) {
  const [options, setOptions] = useState(question.chips);
  const [chosen, setChosen] = useState(
    () => new Set(question.chips.map((c) => c.value)),
  );
  const [adding, setAdding] = useState(false);
  const toggle = (value: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(value);
      else next.delete(value);
      return next;
    });
  const add = (name: string) => {
    const key = functionKey(name);
    if (!options.some((o) => o.value === key)) {
      setOptions((current) => [
        ...current,
        { value: key, label: functionName(key) },
      ]);
    }
    toggle(key, true);
    setAdding(false);
  };
  const keys = options.map((o) => o.value).filter((v) => chosen.has(v));

  return (
    <div className="flex flex-col gap-2.5" data-brief-question={question.id}>
      <div
        role="group"
        aria-label={question.prompt}
        className="flex flex-wrap gap-1.5"
      >
        {options.map((option) => (
          <Chip
            key={option.value}
            selected={chosen.has(option.value)}
            onSelectedChange={(on) => toggle(option.value, on)}
            disabled={busy}
          >
            {option.label}
          </Chip>
        ))}
        <Button
          variant="text"
          size="sm"
          onClick={() => setAdding((a) => !a)}
          aria-expanded={adding}
          disabled={busy}
        >
          <Plus />
          {question.typeOwn?.label ?? "Add a Function"}
        </Button>
      </div>
      {adding ? (
        <TypeOwn
          kind="text"
          label="The Function's name"
          busy={busy}
          onSubmit={add}
        />
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => onDone(keys)}
          disabled={busy || keys.length === 0}
        >
          {keys.length === 1
            ? "Plan this Function"
            : `Plan these ${keys.length}`}
        </Button>
        <p className="text-caption text-ink-3">
          Tap to leave one out. Dates and Guests come next, as Assumptions.
        </p>
      </div>
      <BriefError>{error}</BriefError>
    </div>
  );
}
