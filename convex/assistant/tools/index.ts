import { coreTools } from "./core";
import { imageTools } from "./images";
import { proposeTools } from "./propose";
import { quoteTools } from "./quotes";
import { vendorTools } from "./vendors";

/**
 * The Assistant's tools by their final names (IMPLEMENTATION_PLAN.md section 6).
 * Each slice replaces its stubs in its own file; the Agent (S5) passes this
 * object as its `tools`. The later-stage tools (discoverVendors,
 * addVendorFromUrl, generateImage, remixImage) join with X1 and X3b.
 */
export const ASSISTANT_TOOLS = {
  ...coreTools,
  ...proposeTools,
  ...vendorTools,
  ...imageTools,
  ...quoteTools,
};

export type AssistantToolName = keyof typeof ASSISTANT_TOOLS;
