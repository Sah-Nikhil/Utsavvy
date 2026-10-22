import type { ComponentProps } from "react";

/** Text for screen readers only. */
export function VisuallyHidden(props: ComponentProps<"span">) {
  return <span className="sr-only" {...props} />;
}
