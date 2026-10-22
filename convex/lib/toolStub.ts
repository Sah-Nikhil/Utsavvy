import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { NotBuiltYet } from "./errors";

/**
 * A placeholder Assistant tool for the registry in
 * `convex/assistant/tools/index.ts`. Its slice replaces it in its own file.
 */
export function notBuiltYetTool(name: string, slice: string) {
  return createTool({
    description: `${name} (not built yet; ${slice} adds it).`,
    inputSchema: z.object({}),
    execute: async (): Promise<string> => {
      throw new NotBuiltYet(`the ${name} tool`, slice);
    },
  });
}
