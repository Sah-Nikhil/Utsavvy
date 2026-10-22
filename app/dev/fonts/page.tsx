import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Font check (dev)",
  robots: { index: false },
};

/*
 * The font check from IMPLEMENTATION_PLAN.md section 7.1: Hindi matras and
 * conjuncts at 13, 16 and 32 px in each family, including mixed Latin and
 * Devanagari. Look for clipped matras, broken conjuncts and ₹ falling back
 * to another font. If Anek fails, Mukta is the text fallback.
 */

const SIZES = [13, 16, 32] as const;

const FAMILIES = [
  {
    id: "anek",
    name: "Anek Devanagari",
    role: "Text, Latin and Hindi",
    className: "font-text",
  },
  {
    id: "tiro",
    name: "Tiro Devanagari Hindi",
    role: "Hindi display",
    className: "font-display-hi",
  },
  {
    id: "fraunces",
    name: "Fraunces",
    role: "English display (no Devanagari: Hindi falls back)",
    className: "[font-family:var(--font-display)]",
  },
] as const;

const LINES: { text: string; lang?: "hi"; note: string }[] = [
  { text: "Mehendi के लिए ₹2,40,000", note: "mixed Latin, Hindi and ₹" },
  {
    text: "क्षत्रिय श्रृंगार द्वार स्त्री प्रज्ज्वलित हृदय",
    lang: "hi",
    note: "conjuncts",
  },
  {
    text: "कि की कु कू के कै को कौ कं कँ कः कृ",
    lang: "hi",
    note: "matras on one consonant",
  },
  {
    text: "संगीत के खाने का बजट अब ₹2,85,000 है। क्या मैं कटौती सुझाऊँ?",
    lang: "hi",
    note: "a real Chat line",
  },
  {
    text: "Haldi · Thu 11 Feb · 120 Guests · ₹1,10,000",
    note: "tabular figures",
  },
];

export default function FontsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto grid max-w-[1180px] gap-10 px-5 pt-10 pb-24 sm:px-8">
      <header className="grid gap-2">
        <h1 className="font-display text-display text-ink">Font check</h1>
        <p className="max-w-[62ch] text-body text-ink-2">
          Hindi matras and conjuncts at 13, 16 and 32 px in each family (section
          7.1). Check for clipped matras above and below the line, broken
          conjuncts and a ₹ drawn in another font.
        </p>
      </header>

      {FAMILIES.map((family) => (
        <section
          key={family.id}
          className="grid gap-4"
          aria-labelledby={`family-${family.id}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule pb-2">
            <h2
              id={`family-${family.id}`}
              className="font-display text-headline text-ink"
            >
              {family.name}
            </h2>
            <p className="text-label text-ink-3">{family.role}</p>
          </div>
          <div className="grid gap-6">
            {SIZES.map((size) => (
              <div
                key={size}
                className="grid gap-1.5 sm:grid-cols-[4rem_1fr] sm:gap-4"
              >
                <p className="num pt-1 text-caption font-semibold text-ink-3">
                  {size} px
                </p>
                <div className="grid min-w-0 gap-2">
                  {LINES.map((line) => (
                    <p
                      key={line.text}
                      lang={line.lang}
                      title={line.note}
                      className={cn(
                        "num m-0 break-words text-ink",
                        family.className,
                        "[line-height:1.55]",
                      )}
                      style={{ fontSize: size }}
                    >
                      {line.lang ? (
                        line.text
                      ) : (
                        <>
                          {line.text
                            .split(/([ऀ-ॿ][ऀ-ॿ\s]*[ऀ-ॿ])/)
                            .map((part, i) =>
                              /[ऀ-ॿ]/.test(part) ? (
                                <span key={i} lang="hi">
                                  {part}
                                </span>
                              ) : (
                                part
                              ),
                            )}
                        </>
                      )}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
