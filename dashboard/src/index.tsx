/// <reference path="./globals.d.ts" />
import type React from "react";
import { reassignTask } from "./api";
(function () {
  "use strict";

  const SDK: any = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) return;

  // The host provides React via the plugin SDK — NOT as a global/injected
  // module. Pull it straight off the SDK (this is what the bundled kanban
  // plugin does). esbuild's jsxFactory "h" + jsxFragment "React.Fragment"
  // resolve against this local `React` const at runtime.
  const React = SDK.React;
  const h: any = React.createElement;
  const { useState, useEffect, useCallback, useMemo, useRef } = SDK.hooks;
  const { cn } = SDK.utils || {};

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function fetchJSON(url: string, init?: RequestInit): Promise<any> {
    return fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    });
  }

  const API = "/api/plugins/kanban";
  function withBoard(url: string, board?: string | null): string {
    if (!board) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}board=${encodeURIComponent(board)}`;
  }
  function buildWsUrl(board?: string | null, since = 0): string {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams({ since: String(since) });
    if (board) params.set("board", board);
    return `${proto}//${location.host}${API}/events?${params.toString()}`;
  }

  // ---------------------------------------------------------------------------
  // Status -> lane mapping (mirrors columns.ts on the build side)
  // ---------------------------------------------------------------------------
  const LANES: {
    id: string;
    title: string;
    shows: string[];
    dropStatus: string;
    accent: string;
    hint: string;
  }[] = [
    { id: "backlog", title: "Backlog", shows: ["triage"], dropStatus: "triage", accent: "#94a3b8", hint: "Brain dump — never auto-worked until dragged to ToDo." },
    { id: "todo", title: "ToDo", shows: ["todo", "ready"], dropStatus: "ready", accent: "#3b82f6", hint: "Ready tasks are picked up by the dispatcher." },
    { id: "doing", title: "Doing", shows: ["running"], dropStatus: "ready", accent: "#22c55e", hint: "The dispatcher runs ready tasks here." },
    { id: "waiting", title: "Waiting", shows: ["blocked", "review", "scheduled"], dropStatus: "blocked", accent: "#f59e0b", hint: "Blocked, in review, or scheduled." },
    { id: "done", title: "Done", shows: ["done"], dropStatus: "done", accent: "#a855f7", hint: "Completed." },
  ];
  function laneOf(status: string): string {
    const l = LANES.find((x) => x.shows.includes(status));
    return l ? l.id : "backlog";
  }

  // ---------------------------------------------------------------------------
  // Card
  // ---------------------------------------------------------------------------
  function CardView(props: { task: any; onDragStart: (e: any) => void; onToggleNotify: (t: any) => void; notifyOn: boolean; onToggleAssign: (t: any) => void; assignLabel: string }) {
    const t = props.task;
    const prio = typeof t.priority === "number" ? t.priority : 0;
    const prioColor = prio > 0 ? "#ef4444" : prio < 0 ? "#64748b" : "#22c55e";
    const assignedToMe = !!t.assignee && t.assignee === props.assignLabel;
    return h(
      "div",
      {
        className: "kt-card",
        draggable: true,
        onDragStart: (e: any) => props.onDragStart(e),
        "data-task-id": t.id,
      },
      h(
        "div",
        { className: "kt-card-top" },
        h("span", { className: "kt-prio", style: { background: prioColor }, title: `priority ${prio}` }, String(prio)),
        h("span", { className: "kt-card-title" }, t.title),
        h(
          "button",
          {
            className: "kt-bell" + (props.notifyOn ? " on" : ""),
            title: props.notifyOn ? "Telegram notifications on" : "Enable Telegram notifications",
            onClick: (e: any) => {
              e.stopPropagation();
              props.onToggleNotify(t);
            },
          },
          props.notifyOn ? "🔔" : "🔕"
        )
      ),
      h(
        "div",
        { className: "kt-card-meta" },
        t.assignee
          ? h("span", { className: "kt-assignee" + (assignedToMe ? " me" : "") }, "@" + t.assignee)
          : h(
              "button",
              {
                className: "kt-assign-btn",
                title: "Assign to " + props.assignLabel,
                onClick: (e: any) => {
                  e.stopPropagation();
                  props.onToggleAssign(t);
                },
              },
              "＋ assign " + props.assignLabel
            ),
        t.comment_count ? h("span", { className: "kt-meta" }, "💬 " + t.comment_count) : null,
        t.progress && t.progress.total ? h("span", { className: "kt-meta" }, `▦ ${t.progress.done}/${t.progress.total}`) : null,
        t.warnings && t.warnings.count ? h("span", { className: "kt-warn" }, "⚠ " + t.warnings.count) : null
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Lane
  // ---------------------------------------------------------------------------
  function LaneView(props: {
    lane: any;
    tasks: any[];
    onDropTask: (taskId: string, laneId: string) => void;
    onDragStart: (e: any, taskId: string) => void;
    onToggleNotify: (t: any) => void;
    notifyMap: Record<string, boolean>;
    onToggleAssign: (t: any) => void;
    assignLabel: string;
    dragOver: string | null;
    setDragOver: (id: string | null) => void;
  }) {
    return h(
      "div",
      {
        className: "kt-lane" + (props.dragOver === props.lane.id ? " drag-over" : ""),
        onDragOver: (e: any) => {
          e.preventDefault();
          props.setDragOver(props.lane.id);
        },
        onDragLeave: () => props.setDragOver(null),
        onDrop: (e: any) => {
          e.preventDefault();
          props.setDragOver(null);
          const id = e.dataTransfer.getData("text/task-id");
          if (id) props.onDropTask(id, props.lane.id);
        },
        style: { borderTopColor: props.lane.accent },
      },
      h(
        "div",
        { className: "kt-lane-head" },
        h("span", { className: "kt-lane-title" }, props.lane.title),
        h("span", { className: "kt-lane-count" }, String(props.tasks.length))
      ),
      h("div", { className: "kt-lane-hint", title: props.lane.hint }, props.lane.hint),
      h(
        "div",
        { className: "kt-lane-body" },
        props.tasks.map((t: any) =>
          h(CardView, {
            key: t.id,
            task: t,
            onDragStart: (e: any) => props.onDragStart(e, t.id),
            onToggleNotify: props.onToggleNotify,
            notifyOn: !!props.notifyMap[t.id],
            onToggleAssign: props.onToggleAssign,
            assignLabel: props.assignLabel,
          })
        ),
        props.tasks.length === 0 ? h("div", { className: "kt-empty" }, "—") : null
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Page
  // ---------------------------------------------------------------------------
  function KanbanTrelloPage() {
    const [board, setBoard] = useState(null);
    const [boards, setBoards] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [notifyMap, setNotifyMap] = useState({});
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dragOver, setDragOver] = useState(null);
    const [newTitle, setNewTitle] = useState("");
    const [assignLabel, setAssignLabel] = useState("aishee");
    const dragTask = useRef(null);

    // Resolve the "assign to" label from kanban.default_assignee (config).
    useEffect(() => {
      fetchJSON(`${API}/config`)
        .then((cfg: any) => {
          const da = (cfg && (cfg.default_assignee || (cfg.kanban && cfg.kanban.default_assignee))) || "";
          if (da) setAssignLabel(String(da));
        })
        .catch(() => {});
    }, []);

    const load = useCallback(() => {
      setLoading(true);
      fetchJSON(withBoard(`${API}/board`, board))
        .then((data: any) => {
          const all: any[] = [];
          (data.columns || []).forEach((c: any) => {
            if (c.name === "archived") return; // hide archived by default
            (c.tasks || []).forEach((t: any) => all.push(t));
          });
          setTasks(all);
          setLoading(false);
          setError(null);
          // best-effort: fetch home channels for the first few tasks to paint bells
          const slice = all.slice(0, 12);
          Promise.all(
            slice.map((t: any) =>
              fetchJSON(withBoard(`${API}/tasks/${encodeURIComponent(t.id)}/home-channels`, board))
                .then((hc: any) => ({ id: t.id, tg: (hc.channels || []).some((c: any) => c.platform === "telegram" && c.subscribed) }))
                .catch(() => ({ id: t.id, tg: false }))
            )
          )
          .then((res) => {
            const m: Record<string, boolean> = {};
            res.forEach((r: any) => (m[r.id] = r.tg));
            setNotifyMap(m);
          });
        })
        .catch((e) => {
          setError(String(e.message || e));
          setLoading(false);
        });
    }, [board]);

    // initial boards list
    useEffect(() => {
      fetchJSON(`${API}/boards`)
        .then((d: any) => setBoards(d.boards || []))
        .catch(() => setBoards([]));
    }, []);

    // load board + live events
    useEffect(() => {
      load();
      let ws: WebSocket | null = null;
      let closed = false;
      try {
        ws = new WebSocket(buildWsUrl(board, 0));
        ws.onmessage = () => {
          if (!closed) load();
        };
        ws.onerror = () => {};
      } catch (_) {}
      return () => {
        closed = true;
        if (ws) ws.close();
      };
    }, [load]);

    const onDragStart = useCallback((e: any, taskId: string) => {
      dragTask.current = taskId;
      e.dataTransfer.setData("text/task-id", taskId);
      e.dataTransfer.effectAllowed = "move";
    }, []);

    const onDropTask = useCallback(
      (taskId: string, laneId: string) => {
        const lane = LANES.find((l) => l.id === laneId);
        if (!lane) return;
        const target = lane.dropStatus;
        const task = tasks.find((t: any) => t.id === taskId);
        if (task && task.status === target) return;
        fetchJSON(withBoard(`${API}/tasks/${encodeURIComponent(taskId)}`, board), {
          method: "PATCH",
          body: JSON.stringify({ status: target, block_reason: target === "blocked" ? "waiting" : undefined }),
        })
          .then(() => {
            // nudge the dispatcher so ToDo/Doing drops get claimed promptly
            if (target === "ready") fetchJSON(withBoard(`${API}/dispatch?max=2`, board), { method: "POST" }).catch(() => {});
            load();
          })
          .catch((e) => setError(String(e.message || e)));
      },
      [tasks, board, load]
    );

    const onToggleNotify = useCallback(
      (task: any) => {
        const on = !!notifyMap[task.id];
        const url = withBoard(`${API}/tasks/${encodeURIComponent(task.id)}/home-subscribe/telegram`, board);
        fetchJSON(url, { method: on ? "DELETE" : "POST" })
          .then(() => {
            setNotifyMap((m: any) => ({ ...m, [task.id]: !on }));
          })
          .catch((e) => setError(String(e.message || e)));
      },
      [notifyMap, board]
    );

    const onToggleAssign = useCallback(
      (task: any) => {
        // Toggle: if assigned to me already (or assigned at all), unassign;
        // otherwise assign to the configured default assignee (you).
        const target = task.assignee ? "" : assignLabel;
        reassignTask(task.id, target, board)
          .then(() => load())
          .catch((e) => setError(String(e.message || e)));
      },
      [assignLabel, board, load]
    );

    const onCreate = useCallback(() => {
      const title = newTitle.trim();
      if (!title) return;
      fetchJSON(withBoard(`${API}/tasks`, board), {
        method: "POST",
        body: JSON.stringify({ title, triage: true }),
      })
        .then(() => {
          setNewTitle("");
          load();
        })
        .catch((e) => setError(String(e.message || e)));
    }, [newTitle, board, load]);

    const byLane = useMemo(() => {
      const map: Record<string, any[]> = {};
      LANES.forEach((l) => (map[l.id] = []));
      tasks.forEach((t: any) => {
        const id = laneOf(t.status);
        (map[id] = map[id] || []).push(t);
      });
      return map;
    }, [tasks]);

    return h(
      "div",
      { className: "kt-root" },
      h(
        "div",
        { className: "kt-toolbar" },
        h("span", { className: "kt-h1" }, "Kanban"),
        boards.length > 1
          ? h(
              "select",
              { className: "kt-select", value: board || "", onChange: (e: any) => setBoard(e.target.value || null) },
              h("option", { value: "" }, "default"),
              boards.filter((b: any) => b.slug !== "default").map((b: any) => h("option", { key: b.slug, value: b.slug }, b.name || b.slug))
            )
          : null,
        h("input", {
          className: "kt-input",
          placeholder: "New card → Backlog…",
          value: newTitle,
          onChange: (e: any) => setNewTitle(e.target.value),
          onKeyDown: (e: any) => {
            if (e.key === "Enter") onCreate();
          },
        }),
        h("button", { className: "kt-btn", onClick: onCreate }, "+ Add"),
        h("button", { className: "kt-btn ghost", onClick: load }, "↻ Refresh")
      ),
      error ? h("div", { className: "kt-error" }, error) : null,
      loading && tasks.length === 0 ? h("div", { className: "kt-loading" }, "Loading board…") : null,
      h(
        "div",
        { className: "kt-board" },
        LANES.map((lane) =>
          h(LaneView, {
            key: lane.id,
            lane,
            tasks: byLane[lane.id] || [],
            onDropTask,
            onDragStart,
            onToggleNotify,
            notifyMap,
            onToggleAssign,
            assignLabel,
            dragOver,
            setDragOver,
          })
        )
      ),
      h("div", { className: "kt-foot" }, "Trello skin over Hermes kanban · Backlog never auto-runs · drag to ToDo to start · ＋assign me / 🔔 Telegram")
    );
  }

  if (window.__HERMES_PLUGINS__ && typeof window.__HERMES_PLUGINS__.register === "function") {
    window.__HERMES_PLUGINS__.register("kanban-trello", KanbanTrelloPage);
  }
})();
