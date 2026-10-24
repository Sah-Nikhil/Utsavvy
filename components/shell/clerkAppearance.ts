import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

type Appearance = NonNullable<
  ComponentProps<typeof ClerkProvider>["appearance"]
>;

/*
 * Clerk's sign-in, sign-up and account menu, themed from our own tokens and
 * fonts so nothing looks like Clerk's default card. Variables carry the
 * colours (as our CSS variables, so the look stays in app/globals.css); the
 * `elements` classes reshape individual parts to match components/ui (pill
 * buttons that square off when pressed, tonal fields, Fraunces headings).
 *
 * Clerk's own styles sit in the `clerk` cascade layer, declared in
 * app/globals.css between Tailwind's base and utilities, so these classes win
 * without !important.
 *
 * The orange "Development mode" strip can't be removed on development keys;
 * the card is flush (no frame of its own) and sits in our own frame instead
 * (components/shell/AuthFrame.tsx), so the strip reads as part of the footer.
 */

const pill =
  "rounded-[22px] transition-[border-radius,background-color,box-shadow] duration-(--dur-shape) ease-standard active:rounded-sm";

export const clerkAppearance: Appearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "var(--action)",
    colorPrimaryForeground: "var(--on-action)",
    colorDanger: "var(--warn)",
    colorSuccess: "var(--booked)",
    colorWarning: "var(--warn)",
    colorNeutral: "var(--ink)",
    colorForeground: "var(--ink)",
    colorMutedForeground: "var(--ink-2)",
    colorMuted: "var(--surface-high)",
    colorBackground: "var(--surface-raised)",
    colorInput: "var(--surface)",
    colorInputForeground: "var(--ink)",
    colorBorder: "var(--rule-strong)",
    colorRing: "var(--focus)",
    colorShadow: "var(--scrim)",
    colorModalBackdrop: "var(--scrim)",
    fontFamily:
      'var(--font-anek), "Nirmala UI", "Noto Sans Devanagari", system-ui, sans-serif',
    fontFamilyButtons:
      'var(--font-anek), "Nirmala UI", "Noto Sans Devanagari", system-ui, sans-serif',
    fontSize: "0.9375rem",
    borderRadius: "0.75rem",
  },
  options: {
    socialButtonsVariant: "blockButton",
    elevation: "flush",
    shimmer: false,
  },
  elements: {
    headerTitle: "font-display text-headline font-semibold text-ink",
    headerSubtitle: "text-body text-ink-2",
    socialButtonsBlockButton: `${pill} state-layer h-11 border border-rule-strong bg-transparent text-ink shadow-none`,
    socialButtonsBlockButtonText: "text-body font-semibold text-ink",
    dividerLine: "bg-rule",
    dividerText: "text-caption text-ink-3",
    formFieldLabel: "text-label font-semibold text-ink",
    formFieldInput:
      "h-11 rounded-md border border-rule-strong bg-surface px-3.5 text-body text-ink shadow-none transition-[border-radius,border-color,box-shadow] duration-(--dur-shape) ease-standard hover:border-ink-2 focus:rounded-sm focus:border-action focus:shadow-[inset_0_0_0_1px_var(--action)]",
    formButtonPrimary: `${pill} state-layer h-11 bg-action text-body font-semibold normal-case text-on-action shadow-none hover:bg-action hover:shadow-[0_1px_2px_var(--scrim)]`,
    formFieldAction: "text-label font-semibold text-action",
    footerActionText: "text-label text-ink-2",
    footerActionLink:
      "text-label font-semibold text-action underline-offset-2 hover:underline",
    identityPreview: "rounded-full border-rule bg-surface-high",
    identityPreviewEditButton: "text-action",
    otpCodeFieldInput: "rounded-md border-rule-strong",
    alert: "rounded-lg border-0 bg-warn-soft",
    alertText: "text-label text-warn",
    formFieldErrorText: "text-caption text-warn",
    // The account menu (UserButton) used in the headers.
    userButtonTrigger:
      "rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    userButtonAvatarBox: "size-8 ring-2 ring-surface",
    userButtonPopoverCard:
      "rounded-xl border-0 bg-surface-container shadow-overlay",
    userButtonPopoverMain: "bg-surface-container",
    userButtonPopoverActionButton:
      "state-layer mx-1.5 rounded-md text-label font-medium text-ink",
    userButtonPopoverActionButtonIcon: "text-ink-2",
    userButtonPopoverFooter: "bg-surface-container",
    userPreviewMainIdentifier: "font-display text-title text-ink",
    userPreviewSecondaryIdentifier: "text-caption text-ink-2",
  },
};
