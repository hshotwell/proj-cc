import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("ai training step", { minutes: 2 }, internal.trainingActions.runTrainingStep);

export default crons;
