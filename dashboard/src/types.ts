// Shared types for the Trello-style kanban skin.

// The internal Hermes kanban status enum (fixed in core; do not extend).
export type InternalStatus =
  | "triage"
  | "todo"
  | "ready"
  | "running"
  | "blocked"
  | "review"
  | "scheduled"
  | "done"
  | "archived";

// Our 5 presentation lanes.
export type LaneId = "backlog" | "todo" | "doing" | "waiting" | "done";

export interface Lane {
  id: LaneId;
  title: string;
  // Statuses that display in this lane.
  shows: InternalStatus[];
  // Status a card is set to when dropped into this lane.
  dropStatus: InternalStatus;
  accent: string;
  hint?: string;
}

export interface KanbanTask {
  id: string;
  title: string;
  status: InternalStatus;
  assignee?: string | null;
  priority?: number;
  body?: string | null;
  summary?: string | null;
  comment_count?: number;
  link_counts?: { parents: number; children: number };
  progress?: { done: number; total: number } | null;
  warnings?: { count: number; highest_severity?: string } | null;
  created_at?: number;
  updated_at?: number;
}

export interface BoardResponse {
  columns: { name: InternalStatus; tasks: KanbanTask[] }[];
  tenants?: string[];
  assignees?: string[];
  latest_event_id?: number;
  now?: number;
}

export interface HomeChannel {
  platform: string;
  chat_id: string;
  thread_id?: string | null;
  subscribed?: boolean;
}
