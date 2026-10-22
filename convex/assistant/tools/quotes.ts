import type { ProposalOpHandler } from "../../../lib/types/proposals";
import { NotBuiltYet } from "../../lib/errors";

// S12 (Quotes) owns this file: the addQuote Proposal op handler.

export const addQuoteOp: ProposalOpHandler<"addQuote"> = {
  validate: async () => {
    throw new NotBuiltYet("the addQuote Proposal op", "S12");
  },
  apply: async () => {
    throw new NotBuiltYet("the addQuote Proposal op", "S12");
  },
};
