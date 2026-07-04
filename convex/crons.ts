import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// General GA training — paused in favour of endgame-specific training
// crons.interval("ai training step", { minutes: 30 }, internal.trainingActions.runTrainingStep);

// Endgame training: runs every 180 minutes (~0.65 GB-hours/month with beam search)
crons.interval("endgame training step", { minutes: 180 }, internal.endgameTrainingActions.runEndgameTrainingStep);

// Training V2: cross-engine tournament, one subpopulation per tick.
crons.interval("training v2 step", { minutes: 30 }, internal.trainingV2Actions.runTrainingV2Step);

export default crons;
