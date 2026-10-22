import type { ProposalOp, ProposalOpHandler } from "../../lib/types/proposals";
import {
  addCommentOp,
  addEntryOp,
  addItemOp,
  createSectionOp,
  deleteEntryOp,
  deleteItemOp,
  moveItemOp,
  setBudgetTotalOp,
  updateEntryOp,
  updateItemOp,
} from "../assistant/tools/propose";
import { updateThemeOp } from "../assistant/tools/images";
import { addQuoteOp } from "../assistant/tools/quotes";
import { changeEssentialOp } from "../plan";

/**
 * The registry from Proposal op to its handler (IMPLEMENTATION_PLAN.md section
 * 6). Each handler lives in its owning slice's file; S10's `applyProposal`
 * looks the op up here.
 */
export const PROPOSAL_OPS: { [Op in ProposalOp]: ProposalOpHandler<Op> } = {
  addEntry: addEntryOp,
  updateEntry: updateEntryOp,
  addItem: addItemOp,
  updateItem: updateItemOp,
  moveItem: moveItemOp,
  createSection: createSectionOp,
  addComment: addCommentOp,
  deleteEntry: deleteEntryOp,
  deleteItem: deleteItemOp,
  setBudgetTotal: setBudgetTotalOp,
  addQuote: addQuoteOp,
  updateTheme: updateThemeOp,
  changeEssential: changeEssentialOp,
};

export function handlerFor<Op extends ProposalOp>(
  op: Op,
): ProposalOpHandler<Op> {
  return PROPOSAL_OPS[op];
}
