import { describe, expect, it } from "vitest";
import {
  aaravBirthday as aaravPriced,
  jaipurWedding as jaipurPriced,
  puneGaneshUtsav as punePriced,
} from "../pricing/workedExamples";
import { planLines } from "../pricing";
import { ALL_FUNCTION_KEYS } from "../types/functions";
import { aaravBirthday, jaipurWedding, puneGaneshUtsav } from "./examples";
import {
  assumeFunctionDetails,
  briefLines,
  cityAssumption,
  defaultFunctions,
  functionKey,
  traditionKey,
  usableFunctionKeys,
} from "./functions";

const TODAY = "2026-10-21";

function byField(assumptions: { field: string; value: string }[]) {
  return Object.fromEntries(assumptions.map((a) => [a.field, a.value]));
}

describe("defaultFunctions", () => {
  it("lists each Tradition's Functions from first-brief.md", () => {
    expect(defaultFunctions("North Indian Hindu")).toEqual([
      "haldi",
      "mehendi",
      "sangeet",
      "wedding",
      "reception",
    ]);
    expect(defaultFunctions("Marwari / Rajasthani")).toEqual([
      "tilak",
      "mayra",
      "haldi",
      "mehendi",
      "sangeet",
      "wedding",
      "reception",
    ]);
    expect(defaultFunctions("Punjabi")).toEqual([
      "roka",
      "chunni",
      "mehendi",
      "jaggo",
      "anand_karaj",
      "reception",
    ]);
    expect(defaultFunctions("Muslim")).toEqual([
      "manjha",
      "mehendi",
      "nikah",
      "walima",
    ]);
    expect(defaultFunctions("South Indian Hindu")).toEqual([
      "nichayathartham",
      "muhurtham",
      "reception",
    ]);
    expect(defaultFunctions("Bengali")).toEqual([
      "aashirbaad",
      "gaye_holud",
      "biye",
      "bou_bhaat",
    ]);
    expect(defaultFunctions("Christian")).toEqual([
      "engagement",
      "church_wedding",
      "reception",
    ]);
  });

  it("merges two lists for a mixed wedding, without repeats", () => {
    expect(defaultFunctions("Mixed", ["Punjabi", "Bengali"])).toEqual([
      "roka",
      "chunni",
      "mehendi",
      "jaggo",
      "anand_karaj",
      "reception",
      "aashirbaad",
      "gaye_holud",
      "biye",
      "bou_bhaat",
    ]);
  });

  it("uses only keys from FUNCTION_KEYS", () => {
    for (const tradition of [
      "North Indian Hindu",
      "Marwari",
      "Punjabi or Sikh",
      "Muslim",
      "South Indian Hindu",
      "Bengali",
      "Christian",
    ]) {
      for (const key of defaultFunctions(tradition)) {
        expect(ALL_FUNCTION_KEYS).toContain(key);
      }
    }
  });

  it("reads the Traditions Members type", () => {
    expect(traditionKey("north indian hindu")).toBe("north_indian_hindu");
    expect(traditionKey("Rajasthani")).toBe("marwari");
    expect(traditionKey("Sikh")).toBe("punjabi_sikh");
    expect(traditionKey("Tamil Brahmin")).toBe("south_indian_hindu");
    expect(traditionKey("Kayastha")).toBeNull();
  });
});

describe("functionKey normalises to FUNCTION_KEYS", () => {
  it("maps the names and spellings Members use", () => {
    expect(functionKey("Mehndi")).toBe("mehendi");
    expect(functionKey("Haldi ceremony")).toBe("haldi");
    expect(functionKey("Anand Karaj")).toBe("anand_karaj");
    expect(functionKey("pheras")).toBe("wedding");
    expect(functionKey("Ganpati sthapana")).toBe("sthapana");
    expect(functionKey("evening aarti")).toBe("daily_aarti");
    expect(functionKey("Cultural night")).toBe("cultural_night");
    expect(functionKey("Bou Bhat")).toBe("bou_bhaat");
  });

  it("keeps the Member's own slug for a Function not on the list", () => {
    expect(functionKey("Cocktail party")).toBe("cocktail_party");
    expect(functionKey("  Pool party!! ")).toBe("pool_party");
  });
});

describe("assumeFunctionDetails", () => {
  it("gives the Jaipur wedding the Assumptions in first-brief.md", () => {
    const { functions, assumptions } = assumeFunctionDetails({
      ...jaipurWedding.extraction,
      tradition: "North Indian Hindu",
      functionKeys: defaultFunctions("North Indian Hindu"),
      children: null,
      today: TODAY,
    });
    expect(functions.map((f) => [f.key, f.date, f.guests, f.assumed])).toEqual([
      ["haldi", { kind: "day", value: "2027-02-14" }, 60, ["date", "guests"]],
      [
        "mehendi",
        { kind: "day", value: "2027-02-13" },
        120,
        ["date", "guests"],
      ],
      [
        "sangeet",
        { kind: "day", value: "2027-02-14" },
        225,
        ["date", "guests"],
      ],
      ["wedding", { kind: "day", value: "2027-02-15" }, 300, ["date"]],
      [
        "reception",
        { kind: "day", value: "2027-02-16" },
        300,
        ["date", "guests"],
      ],
    ]);
    expect(byField(assumptions)).toMatchObject({
      date: "Wedding on 15 Feb 2027",
      "function.mehendi.date": "13 Feb 2027, evening",
      "function.haldi.date": "14 Feb 2027, morning, at home",
      "function.sangeet.date": "14 Feb 2027, evening",
      "function.reception.date": "16 Feb 2027, evening",
      "function.haldi.guests": "60 Guests",
      "function.mehendi.guests": "120 Guests",
      "function.sangeet.guests": "225 Guests",
      "function.reception.guests": "300 Guests",
      menu: "Vegetarian",
      jewellery: "Not included in the Budget",
      invitations: "150 invitation cards",
      photography: "Photographer for 4 days",
    });
    expect(assumptions.find((a) => a.field === "date")?.reason).toBe(
      "Only the month was given, so the 15th",
    );
  });

  it("lays out the Ganesh utsav's four programmes over the festival", () => {
    const { functions, assumptions } = assumeFunctionDetails({
      ...puneGaneshUtsav.extraction,
      date: { kind: "day", value: "2027-09-04" },
      guests: 400,
      functionKeys: null,
      children: null,
      today: TODAY,
    });
    expect(functions.map((f) => [f.key, f.date, f.guests])).toEqual([
      ["sthapana", { kind: "day", value: "2027-09-04" }, 150],
      [
        "daily_aarti",
        { kind: "range", from: "2027-09-04", to: "2027-09-13" },
        100,
      ],
      ["cultural_night", { kind: "day", value: "2027-09-11" }, 400],
      ["visarjan", { kind: "day", value: "2027-09-14" }, 300],
    ]);
    // Every date and Guest count is assumed except the cultural night's Guests.
    expect(functions[2]!.assumed).toEqual(["date"]);
    expect(byField(assumptions)).toMatchObject({
      "function.daily_aarti.guests": "100 Guests a day",
      "function.visarjan.date": "14 Sep 2027",
    });
  });

  it("gives Aarav's party its time, return gifts and cake", () => {
    const { functions, assumptions } = assumeFunctionDetails({
      ...aaravBirthday.extraction,
      functionKeys: null,
      children: 35,
      today: TODAY,
    });
    expect(functions).toEqual([
      {
        key: "party",
        name: "Party",
        date: { kind: "day", value: "2026-12-12" },
        guests: 60,
        assumed: [],
      },
    ]);
    expect(byField(assumptions)).toMatchObject({
      "function.party.time": "4:00 to 7:00 pm in a party hall",
      children: "35 children get return gifts",
      cake: "3 kg cake",
    });
  });

  it("puts a wedding with no date 12 months from today, on the 15th", () => {
    const { functions, assumptions } = assumeFunctionDetails({
      ...jaipurWedding.extraction,
      date: null,
      tradition: "Muslim",
      functionKeys: ["nikah"],
      children: null,
      today: TODAY,
    });
    expect(functions[0]!.date).toEqual({ kind: "day", value: "2027-10-15" });
    expect(byField(assumptions).date).toBe("Wedding on 15 Oct 2027");
  });
});

describe("cityAssumption", () => {
  it("treats a city on neither list as Z, shown as an Assumption", () => {
    expect(cityAssumption("Kishangarh")).toEqual({
      field: "city.tier",
      value: "Treated as a smaller city",
      reason:
        "Kishangarh isn't on the government's list of X or Y cities, so prices use the smaller-city range",
    });
    expect(cityAssumption("Jaipur")).toBeNull();
    expect(cityAssumption("Pune")).toBeNull();
  });
});

describe("briefLines", () => {
  it("names the Jaipur wedding's budget lines as the worked example does", () => {
    const { functions, assumptions } = assumeFunctionDetails({
      ...jaipurWedding.extraction,
      tradition: "North Indian Hindu",
      functionKeys: defaultFunctions("North Indian Hindu"),
      children: null,
      today: TODAY,
    });
    const lines = briefLines({
      eventType: "wedding",
      tradition: "North Indian Hindu",
      functions,
      assumptions,
      guests: 300,
    });
    expect(planLines(lines)).toEqual(planLines(jaipurPriced.plan));
  });

  it("names Aarav's party lines as the worked example does", () => {
    const { functions, assumptions } = assumeFunctionDetails({
      ...aaravBirthday.extraction,
      functionKeys: null,
      children: 35,
      today: TODAY,
    });
    const lines = briefLines({
      eventType: "birthday",
      tradition: null,
      functions,
      assumptions,
      guests: 60,
    });
    expect(planLines(lines)).toEqual(planLines(aaravPriced.plan));
  });

  it("names the Ganesh utsav's lines as the worked example does", () => {
    const { functions, assumptions } = assumeFunctionDetails({
      ...puneGaneshUtsav.extraction,
      date: { kind: "day", value: "2027-09-04" },
      guests: 400,
      functionKeys: null,
      children: null,
      today: TODAY,
    });
    const lines = briefLines({
      eventType: "community",
      tradition: null,
      functions,
      assumptions,
      guests: 400,
    });
    expect(planLines(lines)).toEqual(planLines(punePriced.plan));
  });
});

describe("Hindi and Hinglish Function names (M6)", () => {
  it("map to FUNCTION_KEYS", () => {
    expect(functionKey("हल्दी")).toBe("haldi");
    expect(functionKey("मेहंदी")).toBe("mehendi");
    expect(functionKey("मेंहदी")).toBe("mehendi");
    expect(functionKey("संगीत")).toBe("sangeet");
    expect(functionKey("शादी")).toBe("wedding");
    expect(functionKey("फेरे")).toBe("wedding");
    expect(functionKey("रिसेप्शन")).toBe("reception");
    expect(functionKey("सगाई")).toBe("engagement");
    expect(functionKey("तिलक")).toBe("tilak");
    expect(functionKey("निकाह")).toBe("nikah");
    expect(functionKey("स्थापना")).toBe("sthapana");
    expect(functionKey("आरती")).toBe("daily_aarti");
    expect(functionKey("विसर्जन")).toBe("visarjan");
    expect(functionKey("mehndi ki raat")).toBe("mehendi");
    expect(functionKey("haldee")).toBe("haldi");
    expect(functionKey("sangeeth")).toBe("sangeet");
    expect(functionKey("shaadi")).toBe("wedding");
    expect(functionKey("phere")).toBe("wedding");
    expect(functionKey("sagai")).toBe("engagement");
  });
});

describe("usableFunctionKeys (M5)", () => {
  it("keeps only the Functions an Event type uses", () => {
    expect(
      usableFunctionKeys("community", "Navratri garba", ["garba", "dandiya"]),
    ).toEqual([]);
    expect(
      usableFunctionKeys("community", "Ganesh utsav", [
        "sthapana",
        "garba",
        "visarjan",
      ]),
    ).toEqual(["sthapana", "visarjan"]);
    expect(
      usableFunctionKeys("birthday", null, ["mehendi", "puja", "dinner"]),
    ).toEqual(["puja", "dinner"]);
    // A wedding keeps a Function the Member added by name.
    expect(
      usableFunctionKeys("wedding", null, ["mehendi", "cocktail_party"]),
    ).toEqual(["mehendi", "cocktail_party"]);
  });
});
