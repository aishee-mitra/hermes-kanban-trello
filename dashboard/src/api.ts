import type { BoardResponse, HomeChannel, KanbanTask } from "./types";

// All calls hit the BUNDLED kanban backend shipped with Hermes. This plugin is
// a thin presentation layer — it never writes to the kanban DB directly.
const BASE = "/api/plugins/kanban";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export function withBoard(url: string, board?: string | null): string {
  if (!board) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}board=${encodeURIComponent(board)}`;
}

export function getBoard(board?: string | null): Promise<BoardResponse> {
  return fetchJSON<BoardResponse>(withBoard(`${BASE}/board`, board));
}

export function updateTaskStatus(
  taskId: string,
  status: string,
  board?: string | null,
  extra?: Record<string, unknown>
): Promise<{ task: KanbanTask }> {
  return fetchJSON(`${withBoard(`${BASE}/tasks/${encodeURIComponent(taskId)}`, board)}`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...extra }),
  });
}

export function createTask(
  title: string,
  board?: string | null
): Promise<{ task: KanbanTask }> {
  return fetchJSON(withBoard(`${BASE}/tasks`, board), {
    method: "POST",
    body: JSON.stringify({ title, triage: true }), // lands in Backlog
  });
}

export function triggerDispatch(board?: string | null): Promise<unknown> {
  return fetchJSON(withBoard(`${BASE}/dispatch?max=4`, board), { method: "POST" });
}

export function getHomeChannels(taskId: string, board?: string | null): Promise<{ channels: HomeChannel[] }> {
  return fetchJSON(withBoard(`${BASE}/tasks/${encodeURIComponent(taskId)}/home-channels`, board));
}

export function subscribeHome(taskId: string, platform: string, board?: string | null): Promise<unknown> {
  return fetchJSON(
    withBoard(`${BASE}/tasks/${encodeURIComponent(taskId)}/home-subscribe/${platform}`, board),
    { method: "POST" }
  );
}

export function unsubscribeHome(taskId: string, platform: string, board?: string | null): Promise<unknown> {
  return fetchJSON(
    withBoard(`${BASE}/tasks/${encodeURIComponent(taskId)}/home-subscribe/${platform}`, board),
    { method: "DELETE" }
  );
}

export function getTask(taskId: string, board?: string | null): Promise<{ task: any }> {
  return fetchJSON(withBoard(`${BASE}/tasks/${encodeURIComponent(taskId)}`, board));
}

export function reassignTask(
  taskId: string,
  profile: string,
  board?: string | null
): Promise<{ ok: boolean; task_id: string; assignee?: string | null }> {
  return fetchJSON(withBoard(`${BASE}/tasks/${encodeURIComponent(taskId)}/reassign`, board), {
    method: "POST",
    body: JSON.stringify({ profile, reclaim_first: false }),
  });
}

export function updateTask(
  taskId: string,
  patch: Record<string, unknown>,
  board?: string | null
): Promise<{ task: KanbanTask }> {
  return fetchJSON(withBoard(`${BASE}/tasks/${encodeURIComponent(taskId)}`, board), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// Build a WebSocket URL for live task_events, mirroring the host SDK's
// buildWsUrl() so we reuse the dashboard's session credential.
export function buildEventsWsUrl(board?: string | null, since = 0): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ since: String(since) });
  if (board) params.set("board", board);
  return `${proto}//${location.host}${BASE}/events?${params.toString()}`;
}
