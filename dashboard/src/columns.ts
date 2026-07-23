import type { InternalStatus, Lane, LaneId } from "./types";

// The 5 columns the user asked for, mapped onto the fixed internal statuses.
//
//   Backlog  <- triage       (brain dump; NEVER auto-claimed by the dispatcher)
//   ToDo     <- todo + ready (dragging here = status `ready` = work may begin)
//   Doing    <- running      (dispatcher claims `ready` tasks and runs them)
//   Waiting  <- blocked + review + scheduled
//   Done     <- done         (archived is hidden by default)
//
// `dropStatus` is the internal status a card is SET to when dropped into a lane.
// `running` cannot be set directly (the dispatcher owns it), so dropping into
// Doing sets `ready` and lets the dispatcher promote it on the next tick.
export const LANES: Lane[] = [
  {
    id: "backlog",
    title: "Backlog",
    shows: ["triage"],
    dropStatus: "triage",
    accent: "#94a3b8",
    hint: "Brain dump. Nothing here is worked until you drag it to ToDo.",
  },
  {
    id: "todo",
    title: "ToDo",
    shows: ["todo", "ready"],
    dropStatus: "ready",
    accent: "#3b82f6",
    hint: "Drag a card here to make it ready. The dispatcher picks up ready tasks.",
  },
  {
    id: "doing",
    title: "Doing",
    shows: ["running"],
    dropStatus: "ready",
    accent: "#22c55e",
    hint: "The dispatcher moves ready tasks here when it runs them.",
  },
  {
    id: "waiting",
    title: "Waiting",
    shows: ["blocked", "review", "scheduled"],
    dropStatus: "blocked",
    accent: "#f59e0b",
    hint: "Blocked, in review, or scheduled/deferred.",
  },
  {
    id: "done",
    title: "Done",
    shows: ["done"],
    dropStatus: "done",
    accent: "#a855f7",
    hint: "Completed.",
  },
];

export function laneOf(status: InternalStatus): LaneId {
  const lane = LANES.find((l) => l.shows.includes(status));
  return lane ? lane.id : "backlog";
}
