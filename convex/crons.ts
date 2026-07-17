import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// General GA training — paused in favour of endgame-specific training
// crons.interval("ai training step", { minutes: 30 }, internal.trainingActions.runTrainingStep);

// Endgame training — paused 2026-07-16: best fitness plateaued at 108.66
// since generation 144 (~90 generations with no improvement on the current
// 20-puzzle set). The best genome remains persisted in endgameEvolvedGenome
// and is served to clients via getActiveEndgameGenome.
// crons.interval("endgame training step", { minutes: 180 }, internal.endgameTrainingActions.runEndgameTrainingStep);

// Training V2: cross-engine tournament, one subpopulation per tick.
crons.interval("training v2 step", { minutes: 30 }, internal.trainingV2Actions.runTrainingV2Step);

export default crons;
