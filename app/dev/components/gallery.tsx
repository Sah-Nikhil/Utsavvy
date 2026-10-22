"use client";

import {
  ArrowUp,
  CalendarDays,
  Copy,
  Ellipsis,
  Globe,
  ListFilter,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  StickyNote,
  Store,
  Trash2,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { ItemFrame } from "@/components/items/ItemFrame";
import {
  AssistantOrb,
  type AssistantOrbState,
} from "@/components/shell/AssistantOrb";
import { PointingRing } from "@/components/shell/PointingRing";
import { SectionFrame } from "@/components/shell/SectionOrnament";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  FunctionMarker,
  functionBand,
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
import { PriceBadge } from "@/components/ui/price-badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  type SheetSide,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import palettes from "./demo-palette.json";

const FUNCTIONS: { index: FunctionIndex; name: string }[] = [
  { index: 1, name: "Haldi" },
  { index: 2, name: "Mehendi" },
  { index: 3, name: "Sangeet" },
  { index: 4, name: "Wedding" },
  { index: 5, name: "Reception" },
];

export function Gallery() {
  return (
    <TooltipProvider>
      <main className="mx-auto grid max-w-[1180px] gap-12 px-5 pt-10 pb-24 sm:px-8">
        <header className="grid gap-2">
          <h1 className="font-display text-display text-ink">
            Utsavvy components
          </h1>
          <p className="max-w-[62ch] text-body text-ink-2">
            Every primitive and the Item shell, drawn from the tokens in{" "}
            <code className="rounded-xs bg-surface-sunk px-1 text-label">
              app/globals.css
            </code>
            . Turn ornaments off or on from the account menu. Development only.
          </p>
        </header>

        <Workspace />

        <div className="grid gap-12 lg:grid-cols-2">
          <Block title="Buttons">
            <ButtonsDemo />
          </Block>
          <Block title="Fields">
            <FieldsDemo />
          </Block>
          <Block title="Function filter and switches">
            <ChipsDemo />
          </Block>
          <Block title="Badges and prices">
            <BadgesDemo />
          </Block>
          <Block title="Assistant">
            <OrbDemo />
          </Block>
          <Block title="Members">
            <AvatarsDemo />
          </Block>
          <Block title="Overlays">
            <OverlaysDemo />
          </Block>
          <Block title="Tabs and accordion">
            <DisclosureDemo />
          </Block>
        </div>
      </main>
    </TooltipProvider>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-4">
      <h2 className="border-b border-rule pb-2 font-display text-headline text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="grid gap-2">
      {label ? (
        <p className="text-caption font-semibold text-ink-3">{label}</p>
      ) : null}
      <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function Workspace() {
  const [selected, setSelected] = useState<"budget" | "vendor" | null>(
    "vendor",
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionFrame label="Money and dates" count="2 Items">
        <div className="grid gap-4">
          <BudgetItem
            selected={selected === "budget"}
            onSelect={() => setSelected("budget")}
          />
          <ItemFrame
            kind="Note"
            icon={<StickyNote />}
            title="Jain counter at the sangeet"
            provenance="Added by Meera · 10:12"
            commentCount={0}
            onCommentsClick={() => {}}
            pointed
          >
            <p className="text-body text-ink">
              Ask the caterer about a Jain counter at the sangeet. About 40
              Guests eat Jain.
            </p>
          </ItemFrame>
        </div>
      </SectionFrame>

      <SectionFrame label="Vendors" count="1 Item">
        <div className="grid gap-4">
          <ItemFrame
            kind="Vendor"
            icon={<Store />}
            title="Gulmohar Garden"
            meta="Venue · up to 500 Guests"
            functionIndex={3}
            functionName="Sangeet"
            provenance={
              <span className="inline-flex items-center gap-1.5">
                <Globe aria-hidden className="size-3.5" /> from example.in ·
                seen 21 Oct 2026
              </span>
            }
            commentCount={3}
            onCommentsClick={() => {}}
            presence={
              <AvatarStack>
                <Avatar
                  name="Rohan Mehta"
                  presence="online"
                  size="sm"
                  colour={2}
                />
              </AvatarStack>
            }
            actions={<ItemActions />}
            selected={selected === "vendor"}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Badge tone="neutral">Contacted</Badge>
              <span className="text-body text-ink-2">
                Marriage garden, Vaishali Nagar, Jaipur
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <PriceBadge
                kind="listed"
                source="example.in"
                seenOn="21 Oct 2026"
              />
              <p className="num text-title font-semibold text-ink">
                ₹1,90,000{" "}
                <span className="text-label font-normal text-ink-2">
                  per Function
                </span>
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                variant="tonal"
                size="sm"
                onClick={() => setSelected("vendor")}
              >
                Select
              </Button>
              <Button variant="text" size="sm">
                Open site
              </Button>
            </div>
          </ItemFrame>

          <ItemFrame
            kind="Timeline"
            icon={<CalendarDays />}
            title="Book the wedding Venue"
            meta="15 Oct"
            provenance="Added by the Assistant · edited by Rohan"
          >
            <p className="text-body text-ink-2">
              <span className="font-semibold text-warn">6 days late.</span>{" "}
              Pulled to P1 because the wedding is 11 Feb.
            </p>
          </ItemFrame>
        </div>
      </SectionFrame>
    </div>
  );
}

function ItemActions() {
  return (
    <>
      <Tooltip content="Edit">
        <Button variant="text" size="sm" icon aria-label="Edit">
          <Pencil />
        </Button>
      </Tooltip>
      <Menu>
        <MenuTrigger
          render={
            <Button variant="text" size="sm" icon aria-label="More actions" />
          }
        >
          <Ellipsis />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem icon={<Copy />}>Duplicate</MenuItem>
          <MenuItem icon={<Share2 />}>Copy link</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} tone="danger">
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </>
  );
}

type Entry = {
  label: string;
  detail?: string;
  amount: string;
  price:
    | { kind: "estimate" }
    | { kind: "listed"; source: string; seenOn: string }
    | { kind: "quote"; source?: string };
};

const SANGEET: Entry[] = [
  {
    label: "Venue",
    detail: "Gulmohar Garden",
    amount: "₹1,90,000",
    price: { kind: "listed", source: "example.in", seenOn: "21 Oct 2026" },
  },
  {
    label: "Food",
    detail: "300 plates",
    amount: "₹2,40,000",
    price: { kind: "estimate" },
  },
  {
    label: "Mehendi artists",
    detail: "Mehendi by Saba",
    amount: "₹45,000",
    price: { kind: "quote", source: "Saba, on WhatsApp" },
  },
];

function BudgetItem({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <ItemFrame
      kind="Budget"
      icon={<Wallet />}
      title="Budget"
      meta="₹25,00,000 planned"
      provenance="Updated by the Assistant · 10:12"
      commentCount={2}
      onCommentsClick={() => {}}
      presence={
        <AvatarStack>
          <Avatar name="Meera Shah" presence="online" size="sm" colour={1} />
          <Avatar name="Aditi Rao" presence="away" size="sm" colour={3} />
        </AvatarStack>
      }
      actions={
        <Button
          variant="text"
          size="sm"
          icon
          aria-label="Select Budget"
          onClick={onSelect}
        >
          <ListFilter />
        </Button>
      }
      selected={selected}
    >
      <table className="w-full border-collapse text-body">
        <caption className="sr-only">
          Sangeet Entries with their price kinds
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Entry</th>
            <th scope="col">Price kind</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className={cn(functionBand[3])}>
            <th
              scope="rowgroup"
              colSpan={3}
              className="rounded-xs px-2 py-1.5 text-left text-label font-semibold text-ink"
            >
              <span className="inline-flex items-center gap-2">
                <FunctionMarker index={3} />
                Sangeet
                <span className="font-text font-normal text-ink-2 not-italic">
                  · Sat 13 Feb · 300 Guests
                </span>
              </span>
            </th>
          </tr>
          {SANGEET.map((entry) => (
            <tr
              key={entry.label}
              className="border-b border-rule last:border-b-0"
            >
              <th
                scope="row"
                className="py-2 pr-2 pl-2 text-left font-normal text-ink"
              >
                {entry.label}
                {entry.detail ? (
                  <span className="text-label text-ink-3">
                    {" "}
                    · {entry.detail}
                  </span>
                ) : null}
              </th>
              <td className="py-2 pr-3 text-right align-middle">
                <PriceBadge {...entry.price} detail="none" />
              </td>
              <td className="num w-24 py-2 text-right font-medium text-ink">
                {entry.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-caption text-ink-3">
        Estimates, Listed prices and Quotes are labelled separately and never
        added into one total.
      </p>
    </ItemFrame>
  );
}

/* ------------------------------------------------------------------------ */

function ButtonsDemo() {
  const variants = ["filled", "tonal", "outline", "text"] as const;
  return (
    <div className="grid gap-5">
      {(["lg", "md", "sm"] as const).map((size) => (
        <Row key={size} label={`Size ${size}`}>
          {variants.map((variant) => (
            <Button key={variant} variant={variant} size={size}>
              {variant === "filled" ? <Plus aria-hidden /> : null}
              {variant[0]?.toUpperCase() + variant.slice(1)}
            </Button>
          ))}
        </Row>
      ))}
      <Row label="Icon only, disabled, in context">
        <Tooltip content="Send">
          <Button icon aria-label="Send">
            <ArrowUp />
          </Button>
        </Tooltip>
        <Tooltip content="Ask the Assistant">
          <Button icon variant="tonal" aria-label="Ask the Assistant">
            <Sparkles />
          </Button>
        </Tooltip>
        <Tooltip content="Edit">
          <Button icon variant="outline" aria-label="Edit">
            <Pencil />
          </Button>
        </Tooltip>
        <Button icon variant="text" aria-label="More">
          <Ellipsis />
        </Button>
        <Button disabled>Accept</Button>
        <Button variant="outline" disabled>
          Reject
        </Button>
      </Row>
      <Row label="Proposal footer">
        <div className="flex w-full items-center justify-between gap-3 rounded-md border border-item-line bg-surface p-3 shadow-item">
          <p className="num text-label text-ink-2">
            After: <span className="font-semibold text-ink">₹24,60,000</span> of
            ₹25L
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              Reject
            </Button>
            <Button size="sm">Accept</Button>
          </div>
        </div>
      </Row>
    </div>
  );
}

function FieldsDemo() {
  return (
    <div className="grid gap-5">
      <Field
        label="Event name"
        description="Shown to every Member and in invite links."
      >
        <Input defaultValue="Meera weds Rohan" />
      </Field>
      <Field
        label="Guest count"
        error="Enter a number of Guests, for example 300."
      >
        <Input defaultValue="three hundred" inputMode="numeric" />
      </Field>
      <Field label="Note for the caterer">
        <Textarea placeholder="Jain counter, 40 Guests, no onion or garlic" />
      </Field>
      <Field
        label="City"
        disabled
        description="Set by the Brief. Change it in Event settings."
      >
        <Input defaultValue="Jaipur" />
      </Field>
    </div>
  );
}

function ChipsDemo() {
  const [picked, setPicked] = useState<Set<FunctionIndex>>(new Set([3, 4]));
  return (
    <div className="grid gap-5">
      <Row label="Functions">
        {FUNCTIONS.map((fn) => (
          <Chip
            key={fn.index}
            functionIndex={fn.index}
            selected={picked.has(fn.index)}
            onSelectedChange={(on) =>
              setPicked((prev) => {
                const next = new Set(prev);
                if (on) next.add(fn.index);
                else next.delete(fn.index);
                return next;
              })
            }
          >
            {fn.name}
          </Chip>
        ))}
        <Chip disabled>Daily aarti</Chip>
      </Row>
      <Row label="Function row bands" className="grid gap-1">
        {FUNCTIONS.map((fn) => (
          <div
            key={fn.index}
            className={cn(
              "flex items-center gap-2 rounded-xs px-2 py-1.5 text-label font-semibold text-ink",
              functionBand[fn.index],
            )}
          >
            <FunctionMarker index={fn.index} />
            {fn.name}
          </div>
        ))}
      </Row>
      <Row label="Switches">
        <Switch label="Don't reply" />
        <Switch label="Show Assumptions" defaultChecked />
        <Switch label="Event key" disabled />
      </Row>
    </div>
  );
}

function BadgesDemo() {
  return (
    <div className="grid gap-5">
      <Row label="Vendor checklist status">
        <Badge tone="neutral">Considering</Badge>
        <Badge tone="neutral">Contacted</Badge>
        <Badge tone="quote">Quoted</Badge>
        <Badge tone="booked">Booked</Badge>
        <Badge tone="warn">To find</Badge>
        <Badge tone="action">Assumed</Badge>
        <Badge tone="outline">Dropped</Badge>
      </Row>
      <Row label="Price badges" className="items-start gap-5">
        <PriceBadge kind="estimate" />
        <PriceBadge kind="listed" source="example.in" seenOn="21 Oct 2026" />
        <PriceBadge kind="quote" source="Gulmohar Garden" />
      </Row>
      <Row label="Assistant pointing at a line">
        <PointingRing
          tint
          radiusClassName="rounded-xs"
          labelAlign="end"
          className="w-full"
        >
          <div className="flex items-center justify-between gap-3 px-2 py-2 text-body">
            <span>Food · 300 plates</span>
            <span className="flex items-center gap-3">
              <PriceBadge kind="estimate" />
              <span className="num font-medium">₹2,85,000</span>
            </span>
          </div>
        </PointingRing>
      </Row>
    </div>
  );
}

function OrbDemo() {
  const states: AssistantOrbState[] = ["idle", "thinking", "streaming"];
  return (
    <div className="grid gap-5">
      <Row label="Jaipur Theme: royal Rajputana, marigold, pastel pink (marigold dropped)">
        {states.map((state) => (
          <figure key={state} className="m-0 grid justify-items-center gap-2">
            <AssistantOrb
              palette={palettes.jaipur}
              state={state}
              size={56}
              label={`Assistant, ${state}`}
            />
            <figcaption className="text-caption text-ink-2">{state}</figcaption>
          </figure>
        ))}
      </Row>
      <Row label="Other Themes">
        <figure className="m-0 grid justify-items-center gap-2">
          <AssistantOrb palette={palettes.mehendi} state="thinking" size={56} />
          <figcaption className="text-caption text-ink-2">
            mehendi greens
          </figcaption>
        </figure>
        <figure className="m-0 grid justify-items-center gap-2">
          <AssistantOrb palette={[]} state="idle" size={56} />
          <figcaption className="text-caption text-ink-2">
            no Theme yet
          </figcaption>
        </figure>
      </Row>
      <Row label="In Chat">
        <div className="flex w-full items-start gap-3 rounded-md border border-item-line bg-surface p-3 shadow-item">
          <AssistantOrb palette={palettes.jaipur} state="streaming" size={28} />
          <div className="grid gap-0.5">
            <p className="text-label font-semibold text-ink">
              Assistant{" "}
              <span className="num font-normal text-ink-3">10:12</span>
            </p>
            <p lang="hi" className="text-body text-ink">
              संगीत के खाने का बजट अब <span className="num">₹2,85,000</span> है।
              क्या मैं कटौती सुझाऊँ?
            </p>
          </div>
        </div>
      </Row>
    </div>
  );
}

function AvatarsDemo() {
  return (
    <div className="grid gap-5">
      <Row label="Sizes and presence">
        <Avatar name="Meera Shah" presence="online" size="lg" />
        <Avatar name="Rohan Mehta" presence="away" size="md" />
        <Avatar name="Aditi Rao" size="md" />
        <Avatar name="Prakash" presence="online" size="sm" />
      </Row>
      <Row label="Stack">
        <AvatarStack>
          <Avatar name="Meera Shah" presence="online" colour={1} />
          <Avatar name="Rohan Mehta" presence="online" colour={2} />
          <Avatar name="Aditi Rao" presence="away" colour={3} />
          <Avatar name="Prakash Jain" colour={4} />
        </AvatarStack>
      </Row>
      <Separator />
      <p className="text-caption text-ink-3">
        Colours come from a hash of the name, so a Member keeps theirs
        everywhere.
      </p>
    </div>
  );
}

function OverlaysDemo() {
  const sides: { side: SheetSide; label: string }[] = [
    { side: "right", label: "Side sheet" },
    { side: "bottom", label: "Bottom sheet" },
    { side: "full", label: "Full-screen sheet" },
  ];
  return (
    <div className="grid gap-5">
      <Row label="Dialog">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>
            Delete Event…
          </DialogTrigger>
          <DialogContent
            title="Delete Meera weds Rohan?"
            description="Every Item, Comment and upload in this Event is deleted for all Members. This can't be undone."
          >
            <DialogFooter>
              <DialogClose render={<Button variant="text" />}>
                Keep Event
              </DialogClose>
              <DialogClose render={<Button />}>Delete Event</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Row>
      <Row label="Sheets">
        {sides.map(({ side, label }) => (
          <Sheet key={side}>
            <SheetTrigger render={<Button variant="tonal" />}>
              {label}
            </SheetTrigger>
            <SheetContent
              side={side}
              title={side === "full" ? "Google places" : "Comments"}
              description={
                side === "full" ? "Search near Jaipur" : "Gulmohar Garden"
              }
            >
              <div className="grid gap-4">
                <p className="text-body text-ink-2">
                  {side === "full"
                    ? "Google's own list and map sit here, side by side."
                    : "Meera: Can we see the lawn before we book?"}
                </p>
                <Field label="Add a Comment">
                  <Textarea placeholder="Write to the Members" />
                </Field>
              </div>
            </SheetContent>
          </Sheet>
        ))}
      </Row>
      <Row label="Menu and tooltip">
        <Menu>
          <MenuTrigger render={<Button variant="outline" />}>
            Add Item <Plus aria-hidden />
          </MenuTrigger>
          <MenuContent>
            <MenuGroup>
              <MenuGroupLabel>On the Canvas</MenuGroupLabel>
              <MenuItem icon={<StickyNote />}>Note</MenuItem>
              <MenuItem icon={<CalendarDays />}>Timeline</MenuItem>
              <MenuItem icon={<Store />} hint="V">
                Vendor
              </MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuItem icon={<Wallet />} disabled>
              Budget (one per Event)
            </MenuItem>
          </MenuContent>
        </Menu>
        <Tooltip content="Only Owners and Co-owners can change Event keys">
          <Button variant="text">Why is this locked?</Button>
        </Tooltip>
      </Row>
    </div>
  );
}

function DisclosureDemo() {
  return (
    <div className="grid gap-6">
      <Tabs defaultValue="freeform">
        <TabsList aria-label="Canvas view">
          <TabsTab value="freeform">Freeform</TabsTab>
          <TabsTab value="compact">Compact</TabsTab>
          <TabsTab value="map">Map</TabsTab>
        </TabsList>
        <TabsPanel value="freeform">
          Items sit where Members put them.
        </TabsPanel>
        <TabsPanel value="compact">
          The same Items as one list, in Section order.
        </TabsPanel>
        <TabsPanel value="map">Vendors with an address, as Markers.</TabsPanel>
      </Tabs>
      <Accordion defaultValue={["assumptions"]}>
        <AccordionItem value="assumptions">
          <AccordionTrigger>Assumptions (3)</AccordionTrigger>
          <AccordionPanel>
            Mehendi Guest count assumed as 150. Run sheet times assumed. Haldi
            date assumed as 11 Feb.
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="sources">
          <AccordionTrigger>Where the Estimates come from</AccordionTrigger>
          <AccordionPanel>
            Researched ranges from Vendors&apos; own sites, or the reference
            table when research finds nothing.
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
