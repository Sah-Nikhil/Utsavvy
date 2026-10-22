import type { ProposalOpHandler } from "../../../lib/types/proposals";
import { NotBuiltYet } from "../../lib/errors";
import { notBuiltYetTool } from "../../lib/toolStub";

// S13 (Inspirations) owns this file: searchStockImages, updateTheme, tagInspiration
// and the updateTheme Proposal op handler.

export const updateThemeOp: ProposalOpHandler<"updateTheme"> = {
  validate: async () => {
    throw new NotBuiltYet("the updateTheme Proposal op", "S13");
  },
  apply: async () => {
    throw new NotBuiltYet("the updateTheme Proposal op", "S13");
  },
};

export const imageTools = {
  searchStockImages: notBuiltYetTool("searchStockImages", "S13"),
  updateTheme: notBuiltYetTool("updateTheme", "S13"),
  tagInspiration: notBuiltYetTool("tagInspiration", "S13"),
};
