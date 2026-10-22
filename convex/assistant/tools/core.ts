import { notBuiltYetTool } from "../../lib/toolStub";

// S7 (The Assistant's Canvas tools) owns this file. Chat web search (`webSearch`)
// is Anthropic's provider-executed tool, added by S7 where the run's model is Claude.

export const coreTools = {
  readCanvas: notBuiltYetTool("readCanvas", "S7"),
  readChat: notBuiltYetTool("readChat", "S7"),
  addEntry: notBuiltYetTool("addEntry", "S7"),
  updateEntry: notBuiltYetTool("updateEntry", "S7"),
  addItem: notBuiltYetTool("addItem", "S7"),
  updateItem: notBuiltYetTool("updateItem", "S7"),
  moveItem: notBuiltYetTool("moveItem", "S7"),
  createSection: notBuiltYetTool("createSection", "S7"),
  addComment: notBuiltYetTool("addComment", "S7"),
  pointAt: notBuiltYetTool("pointAt", "S7"),
};
