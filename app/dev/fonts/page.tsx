import type { Metadata } from "next";
import { StickyNote } from "lucide-react";
import { notFound } from "next/navigation";
import { ItemFrame } from "@/components/items/ItemFrame";
import { SectionFrame } from "@/components/shell/SectionOrnament";
import { Money } from "@/components/ui/money";
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
    role: "English display (no Devanagari or ₹: those fall back to Anek)",
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

      <InContext />

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

/**
 * The display roles as the app uses them, at the sizes and line-height
 * utilities that could clip matras: Hindi in text-headline (1.2) and
 * text-display (1.12), a Hindi Section label (15 px leading-tight), a Hindi
 * Item title that truncates, Hindi inside an English heading, and an amount
 * inside a Fraunces heading.
 */
function InContext() {
  return (
    <section className="grid gap-6" aria-labelledby="in-context">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule pb-2">
        <h2 id="in-context" className="font-display text-headline text-ink">
          In context
        </h2>
        <p className="text-label text-ink-3">
          Display roles at the sizes that could clip matras
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-3">
          <p lang="hi" className="font-display text-display text-ink">
            संगीत और मेहंदी की तैयारी
          </p>
          <p lang="hi" className="font-display text-headline text-ink-2">
            उत्सव की योजना, साथ मिलकर
          </p>
          <h3 className="font-display text-headline text-ink">
            Plan your{" "}
            <span lang="hi" className="font-display-hi">
              उत्सव
            </span>{" "}
            together
          </h3>
          <h3 className="font-display text-headline text-ink">
            Sangeet catering, <Money amount={285000} />
          </h3>
          <p className="text-body text-ink-2">
            Body text: Mehendi <span lang="hi">के लिए</span>{" "}
            <Money amount={240000} />, Hinglish and Hindi runs stay in Anek.
          </p>
        </div>
        <div className="max-w-[360px]">
          <SectionFrame label="खाना और सजावट" count="1 Item">
            <ItemFrame
              kind="Note"
              icon={<StickyNote />}
              title="हल्दी की रस्म के लिए गेंदे के फूल, प्रसाद और कुर्सियाँ"
              provenance="Added by Meera · 10:12"
            >
              <p className="px-4 pb-3 text-body">
                <span lang="hi">पंडित जी से मुहूर्त पूछना है।</span>
              </p>
            </ItemFrame>
          </SectionFrame>
        </div>
      </div>
    </section>
  );
}
