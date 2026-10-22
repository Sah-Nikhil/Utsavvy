import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * The three daily jobs (IMPLEMENTATION_PLAN.md section 4.7). Cron times are UTC;
 * IST is UTC+05:30. Each target starts as a no-op stub in its owning slice's file.
 */
const crons = cronJobs();

// 08:00 IST = 02:30 UTC (S17).
crons.cron(
  "due-soon Nudge sweep",
  "30 2 * * *",
  internal.nudges.dueSoonSweep,
  {},
);

// 03:30 IST = 22:00 UTC the day before (S13). The plan fixes the time.
// eslint-disable-next-line @convex-dev/no-top-of-hour-crons
crons.cron(
  "purge deleted Inspiration files",
  "0 22 * * *",
  internal.inspirations.purgeDeletedFiles,
  {},
);

// 03:00 IST = 21:30 UTC the day before (S19a).
crons.cron("reset the demo Event", "30 21 * * *", internal.demo.reset, {});

export default crons;
