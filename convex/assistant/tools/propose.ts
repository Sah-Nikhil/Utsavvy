import type {
  ProposalOp,
  ProposalOpHandler,
} from "../../../lib/types/proposals";
import { NotBuiltYet } from "../../lib/errors";
import { notBuiltYetTool } from "../../lib/toolStub";

// S10 (Proposals) owns this file: the `propose` tool and the handlers for every
// Proposal op except addQuote (S12), updateTheme (S13) and changeEssential (S14).

function notBuiltYet<Op extends ProposalOp>(op: Op): ProposalOpHandler<Op> {
  return {
    validate: async () => {
      throw new NotBuiltYet(`the ${op} Proposal op`, "S10");
    },
    apply: async () => {
      throw new NotBuiltYet(`the ${op} Proposal op`, "S10");
    },
  };
}

export const addEntryOp = notBuiltYet("addEntry");
export const updateEntryOp = notBuiltYet("updateEntry");
export const addItemOp = notBuiltYet("addItem");
export const updateItemOp = notBuiltYet("updateItem");
export const moveItemOp = notBuiltYet("moveItem");
export const createSectionOp = notBuiltYet("createSection");
export const addCommentOp = notBuiltYet("addComment");
export const deleteEntryOp = notBuiltYet("deleteEntry");
export const deleteItemOp = notBuiltYet("deleteItem");
export const setBudgetTotalOp = notBuiltYet("setBudgetTotal");

export const proposeTools = {
  propose: notBuiltYetTool("propose", "S10"),
};
