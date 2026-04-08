import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// General GA training — paused in favour of endgame-specific training
// crons.interval("ai training step", { minutes: 30 }, internal.trainingActions.runTrainingStep);

// Endgame training: runs every 60 minutes, < 0.5 GB action compute / day
crons.interval("endgame training step", { minutes: 60 }, internal.endgameTrainingActions.runEndgameTrainingStep);

export default crons;
