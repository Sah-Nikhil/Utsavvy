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
};

/** The label an Assumption is listed with on the Brief summary: "Haldi date", "Menu". */
export function assumptionLabel(field: string): string {
  const fn = field.match(/^function\.([^.]+)\.(date|guests|time)$/);
  if (fn) {
    const what =
      fn[2] === "guests" ? "Guests" : fn[2] === "time" ? "time" : "date";
    return `${functionName(fn[1]!)} ${what}`;
  }
  return FIELD_LABELS[field] ?? field;
}
