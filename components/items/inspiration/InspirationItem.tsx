"use client";

import { useMutation, useQuery } from "convex/react";
import {
  Check,
  ChevronDown,
  Image as ImageIcon,
  ImageOff,
  MoreHorizontal,
  Palette,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useCanvasItem } from "@/components/canvas/CanvasItemContext";
import { PexelsCredit, Swatches } from "@/components/inspirations/parts";
import { useUploadImage } from "@/components/inspirations/useUploadImage";
import { ItemFrame } from "@/components/items/ItemFrame";
import type { ItemComponentProps } from "@/components/items/registry";
import { errorMessage } from "@/components/people/errors";
import { ReferenceEmbed } from "@/components/references/ReferenceEmbed";
import { Button } from "@/components/ui/button";
import {
  FunctionMarker,
  type FunctionIndex,
} from "@/components/ui/function-marker";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { api } from "@/convex/_generated/api";
import { colourName, isColourWord } from "@/lib/inspirations/theme";
import { cn } from "@/lib/utils";

/*
 * An Inspiration on the Canvas (S13): a stock library photo, a Member's upload
 * or a Reference (X2's embed). Every one shows where it came from (rule 24),
 * carries a Function chip (rule 8) and, for photos, "Use for Theme" (rule 15).
 */

type Item = ItemComponentProps<"inspiration">["item"];

export function InspirationItem({ item }: ItemComponentProps<"inspiration">) {
  const canvas = useCanvasItem();
  const canvasView = useQuery(api.canvas.get, { eventId: item.eventId });
  const canEdit = canvasView !== undefined && canvasView.me.role !== "viewer";
  const functions = canvasView?.functions ?? [];
  const applyToTheme = useMutation(api.inspirations.useForTheme);
  const tag = useMutation(api.inspirations.tag);
  const remove = useMutation(api.inspirations.remove);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "ok" | "warn";
    text: string;
  } | null>(null);
  const { data } = item;
  const source = data.source;

  // A confirmation fades after a few seconds; an error stays until the next try.
  useEffect(() => {
    if (notice?.tone !== "ok") return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      if (done) setNotice({ tone: "ok", text: done });
      return result;
    } catch (e) {
      setNotice({
        tone: "warn",
        text: errorMessage(e, "That didn't work. Try again."),
      });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function themeFromThis() {
    const result = (await run(() =>
      applyToTheme({ eventId: item.eventId, itemId: item._id }),
    )) as { changed: boolean } | null;
    if (result)
      setNotice(
        result.changed
          ? { tone: "ok", text: "Added to the Theme." }
          : { tone: "ok", text: "The Theme already has these." },
      );
  }

  const addedBy =
    canvasView?.people.find((p) => p.membershipId === data.addedBy)?.name ??
    "a former Member";

  const title =
    source.kind === "pexels"
      ? titleFromTags(source.tags)
      : source.kind === "upload"
        ? "Uploaded photo"
        : source.platform === "pinterest"
          ? "Pinterest"
          : "Instagram";

  const provenance =
    source.kind === "pexels" ? (
      <PexelsCredit
        photographer={source.photographer}
        photographerUrl={source.photographerUrl}
        pageUrl={source.pageUrl}
      />
    ) : source.kind === "upload" ? (
      <span>
        Uploaded by {addedBy}
        {source.fromReference ? ", from a Reference" : ""}
      </span>
    ) : (
      <span>Added by {addedBy}</span>
    );

  const isImage = source.kind !== "reference";

  return (
    <ItemFrame
      kind="Inspiration"
      icon={<ImageIcon />}
      title={title}
      functionIndex={canvas?.functionIndex}
      functionName={canvas?.functionName}
      selected={canvas?.selected}
      provenance={provenance}
      actions={
        canEdit ? (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="text"
                  size="sm"
                  icon
                  aria-label="Inspiration actions"
                  disabled={busy}
                />
              }
            >
              <MoreHorizontal />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem
                icon={<Trash2 />}
                tone="danger"
                onClick={() =>
                  void run(() =>
                    remove({ eventId: item.eventId, itemId: item._id }),
                  )
                }
              >
                Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        ) : null
      }
      bodyClassName="grid gap-3"
    >
      {source.kind === "pexels" ? (
        <figure className="relative aspect-[4/3] overflow-hidden rounded-sm bg-surface-sunk">
          <Image
            src={source.localPath}
            alt={source.alt}
            fill
            sizes="300px"
            unoptimized
            className="object-cover"
          />
        </figure>
      ) : source.kind === "upload" ? (
        <UploadPicture item={item} />
      ) : (
        <ReferenceEmbed platform={source.platform} url={source.url} />
      )}

      {data.memberNote ? (
        <p className="text-label text-ink-2">“{data.memberNote}”</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <FunctionChip
          item={item}
          functions={functions}
          functionIndex={canvas?.functionIndex}
          disabled={!canEdit || busy}
          onPick={(functionKey) =>
            void run(() =>
              tag({ eventId: item.eventId, itemId: item._id, functionKey }),
            )
          }
        />
        {isImage && canEdit ? (
          <Button
            variant="tonal"
            size="sm"
            disabled={busy}
            onClick={() => void themeFromThis()}
          >
            <Palette aria-hidden />
            Use for Theme
          </Button>
        ) : null}
        {isImage && data.seen ? (
          <span className="ml-auto inline-flex items-center">
            <Swatches palette={data.seen.palette.slice(0, 5)} />
            <span className="sr-only">
              Colours: {data.seen.palette.map(colourName).join(", ")}
            </span>
          </span>
        ) : null}
      </div>

      {notice ? (
        <p
          role={notice.tone === "warn" ? "alert" : "status"}
          className={cn(
            "flex items-center gap-1.5 text-caption",
            notice.tone === "warn" ? "text-warn" : "text-booked",
          )}
        >
          {notice.tone === "ok" ? (
            <Check aria-hidden strokeWidth={2.5} className="size-3.5" />
          ) : null}
          {notice.text}
        </p>
      ) : null}
    </ItemFrame>
  );
}

/** "Haldi, marigold, urli": a library photo's first few curator tags, without occasion or colour words. */
function titleFromTags(tags: readonly string[]): string {
  const words = tags
    .filter((t) => !["wedding", "birthday", "branded"].includes(t))
    .filter((t) => !isColourWord(t))
    .slice(0, 3);
  const text = words.join(", ");
  return text ? text[0]!.toUpperCase() + text.slice(1) : "Stock photo";
}

function UploadPicture({ item }: { item: Item }) {
  const image = useUploadImage(item.eventId, item._id);
  const description =
    item.data.seen?.description || "A photo a Member uploaded";
  return (
    <figure className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-sm bg-surface-sunk">
      {image.state === "ready" ? (
        // A blob: URL of the Event's own upload; next/image can't optimise it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src}
          alt={description}
          className="absolute inset-0 size-full object-cover"
        />
      ) : image.state === "gone" ? (
        <span className="grid justify-items-center gap-1.5 px-6 text-center text-caption text-ink-3">
          <ImageOff aria-hidden className="size-5" />
          This photo&apos;s file was removed after it was deleted.
        </span>
      ) : (
        <span className="absolute inset-0 animate-pulse bg-surface-sunk motion-reduce:animate-none">
          <span className="sr-only">Loading the photo</span>
        </span>
      )}
    </figure>
  );
}

/** The Function chip (rule 8): Event-wide by default, or one Function. */
function FunctionChip({
  item,
  functions,
  functionIndex,
  disabled,
  onPick,
}: {
  item: Item;
  functions: readonly { key: string; name: string }[];
  functionIndex: FunctionIndex | undefined;
  disabled: boolean;
  onPick: (functionKey: string | null) => void;
}) {
  const current = functions.find((f) => f.key === item.functionKey);
  const label = current?.name ?? "Event-wide";
  const chip = (
    <>
      {functionIndex && current ? (
        <FunctionMarker index={functionIndex} />
      ) : null}
      {label}
    </>
  );
  if (disabled || functions.length === 0)
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-rule px-2.5 text-label text-ink-2">
        {chip}
      </span>
    );
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label={`Function: ${label}. Change`}
            className="state-layer inline-flex h-8 items-center gap-1.5 rounded-sm border border-rule-strong px-2.5 text-label font-medium text-ink-2 transition-colors duration-(--dur-feedback) ease-standard"
          />
        }
      >
        {chip}
        <ChevronDown aria-hidden className="size-3.5 text-ink-3" />
      </MenuTrigger>
      <MenuContent>
        <MenuGroup>
          <MenuGroupLabel>Which Function is this for?</MenuGroupLabel>
          {functions.map((fn) => (
            <MenuItem
              key={fn.key}
              onClick={() => onPick(fn.key)}
              icon={
                fn.key === item.functionKey ? (
                  <Check />
                ) : (
                  <span className="size-4" />
                )
              }
            >
              {fn.name}
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem
          onClick={() => onPick(null)}
          icon={
            item.functionKey === null ? <Check /> : <span className="size-4" />
          }
        >
          Event-wide
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
