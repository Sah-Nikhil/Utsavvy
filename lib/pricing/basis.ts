import type { CityTier, EstimateBasis } from "../types";
import { REFERENCE_TABLE_VERSION } from "./table";

/** A basis without its display line, plus the tier a table line was priced for. */
export type BasisFields = Omit<EstimateBasis, "text"> & {
  text?: string;
  tier?: CityTier;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** "22 Oct 2026" for a timestamp, on India's calendar. */
function istDay(at: number): string {
  const d = new Date(at + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Oct 2026" for a table version such as "2026-10-22". */
function versionMonth(version: string): string {
  const [year, month] = version.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * The Estimate badge's source line (IMPLEMENTATION_PLAN.md section 4.14):
 * "Researched 22 Oct 2026 · 3 sources", "Utsavvy reference table, Y tier, Oct 2026"
 * or "Assistant's own estimate, no sources". A stored reference-table basis
 * keeps its tier only in `text`, so without `tier` that text is returned.
 */
export function basisText(basis: BasisFields): string {
  switch (basis.kind) {
    case "researched": {
      const count = basis.sourceUrls.length;
      const day =
        basis.searchedAt === null ? "" : ` ${istDay(basis.searchedAt)}`;
      return `Researched${day} · ${count} ${count === 1 ? "source" : "sources"}`;
    }
    case "referenceTable": {
      const month = versionMonth(basis.tableVersion ?? REFERENCE_TABLE_VERSION);
      if (basis.tier) {
        return `Utsavvy reference table, ${basis.tier} tier, ${month}`;
      }
      return basis.text ?? `Utsavvy reference table, ${month}`;
    }
    case "assistantKnowledge":
      return "Assistant's own estimate, no sources";
  }
}

type Range = { unit: string; unitLow: number; unitHigh: number };

export function referenceTableBasis(
  range: Range & { tier: CityTier },
): EstimateBasis {
  const fields: Omit<EstimateBasis, "text"> = {
    kind: "referenceTable",
    unit: range.unit,
    unitLow: range.unitLow,
    unitHigh: range.unitHigh,
    sourceUrls: [],
    searchedAt: null,
    reasoning: null,
    tableVersion: REFERENCE_TABLE_VERSION,
  };
  return { ...fields, text: basisText({ ...fields, tier: range.tier }) };
}

export function researchedBasis(
  range: Range & {
    sourceUrls: string[];
    searchedAt: number;
    reasoning: string;
  },
): EstimateBasis {
  const fields: Omit<EstimateBasis, "text"> = {
    kind: "researched",
    unit: range.unit,
    unitLow: range.unitLow,
    unitHigh: range.unitHigh,
    sourceUrls: range.sourceUrls,
    searchedAt: range.searchedAt,
    reasoning: range.reasoning,
    tableVersion: null,
  };
  return { ...fields, text: basisText(fields) };
}

export function knowledgeBasis(
  range: Range & { reasoning: string },
): EstimateBasis {
  const fields: Omit<EstimateBasis, "text"> = {
    kind: "assistantKnowledge",
    unit: range.unit,
    unitLow: range.unitLow,
    unitHigh: range.unitHigh,
    sourceUrls: [],
    searchedAt: null,
    reasoning: range.reasoning,
    tableVersion: null,
  };
  return { ...fields, text: basisText(fields) };
}
