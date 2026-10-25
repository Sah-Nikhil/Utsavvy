import { functionName } from "./functions";

const FIELD_LABELS: Record<string, string> = {
  date: "Date",
  guests: "Guests",
  budget: "Budget",
  households: "Households",
  children: "Return gifts",
  cake: "Cake",
  menu: "Menu",
  jewellery: "Jewellery",
  invitations: "Invitations",
  photography: "Photography",
  "city.tier": "City tier",
  eventType: "Event type",
  runSheets: "Run sheets",
};

/** "decor.style", "welcomeDrinks" or "return_gift_type" as words: "Decor style". */
function humanize(field: string): string {
  const words = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The label an Assumption is listed with on the Brief summary: "Haldi date", "Menu". */
export function assumptionLabel(field: string): string {
  const fn = field.match(/^function\.([^.]+)\.(date|guests|time)$/);
  if (fn) {
    const what =
      fn[2] === "guests" ? "Guests" : fn[2] === "time" ? "time" : "date";
    return `${functionName(fn[1]!)} ${what}`;
  }
  // A field the plan's model made up still reads as words, never as a key.
  return FIELD_LABELS[field] ?? humanize(field);
}
