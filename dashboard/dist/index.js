"use strict";
(() => {
  // dashboard/src/api.ts
  var BASE = "/api/plugins/kanban";
  async function fetchJSON(url, init) {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`${res.status}: ${text}`);
    }
    return await res.json();
  }
  function withBoard(url, board) {
    if (!board) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}board=${encodeURIComponent(board)}`;
  }
  function getTask(taskId, board) {
    return fetchJSON(withBoard(`${BASE}/tasks/${encodeURIComponent(taskId)}`, board));
  }
  function reassignTask(taskId, profile, board) {
    return fetchJSON(withBoard(`${BASE}/tasks/${encodeURIComponent(taskId)}/reassign`, board), {
      method: "POST",
      body: JSON.stringify({ profile, reclaim_first: false })
    });
  }
  function updateTask(taskId, patch, board) {
    return fetchJSON(withBoard(`${BASE}/tasks/${encodeURIComponent(taskId)}`, board), {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
  }

  // dashboard/src/index.tsx
  (function() {
    "use strict";
    const SDK = window.__HERMES_PLUGIN_SDK__;
    if (!SDK) return;
    const React = SDK.React;
    const h = React.createElement;
    const { useState, useEffect, useCallback, useMemo, useRef } = SDK.hooks;
    const { cn } = SDK.utils || {};
    function fetchJSON2(url, init) {
      return fetch(url, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...init
      }).then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          throw new Error(`${res.status}: ${text}`);
        }
        return res.json();
      });
    }
    const API = "/api/plugins/kanban";
    function withBoard2(url, board) {
      if (!board) return url;
      const sep = url.includes("?") ? "&" : "?";
      return `${url}${sep}board=${encodeURIComponent(board)}`;
    }
    function buildWsUrl(board, since = 0) {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams({ since: String(since) });
      if (board) params.set("board", board);
      return `${proto}//${location.host}${API}/events?${params.toString()}`;
    }
    const LANES = [
      { id: "backlog", title: "Backlog", shows: ["triage"], dropStatus: "triage", accent: "#94a3b8", hint: "Brain dump \u2014 never auto-worked until dragged to ToDo." },
      { id: "todo", title: "ToDo", shows: ["todo", "ready"], dropStatus: "ready", accent: "#3b82f6", hint: "Ready tasks are picked up by the dispatcher." },
      { id: "doing", title: "Doing", shows: ["running"], dropStatus: "ready", accent: "#22c55e", hint: "The dispatcher runs ready tasks here." },
      { id: "waiting", title: "Waiting", shows: ["blocked", "review", "scheduled"], dropStatus: "blocked", accent: "#f59e0b", hint: "Blocked, in review, or scheduled." },
      { id: "done", title: "Done", shows: ["done"], dropStatus: "done", accent: "#a855f7", hint: "Completed." }
    ];
    function laneOf(status) {
      const l = LANES.find((x) => x.shows.includes(status));
      return l ? l.id : "backlog";
    }
    const STATUS_OPTIONS = [
      { value: "triage", label: "Backlog" },
      { value: "todo", label: "ToDo (todo)" },
      { value: "ready", label: "ToDo (ready)" },
      { value: "running", label: "Doing" },
      { value: "blocked", label: "Waiting (blocked)" },
      { value: "review", label: "Waiting (review)" },
      { value: "scheduled", label: "Waiting (scheduled)" },
      { value: "done", label: "Done" }
    ];
    function CardView(props) {
      const t = props.task;
      const prio = typeof t.priority === "number" ? t.priority : 0;
      const prioColor = prio > 0 ? "#ef4444" : prio < 0 ? "#64748b" : "#22c55e";
      const assignedToMe = !!t.assignee && t.assignee === props.assignLabel;
      return h(
        "div",
        {
          className: "kt-card",
          draggable: true,
          onDragStart: (e) => props.onDragStart(e),
          "data-task-id": t.id,
          onClick: (e) => {
            e.stopPropagation();
            props.onClick(t);
          }
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
              onClick: (e) => {
                e.stopPropagation();
                props.onToggleNotify(t);
              }
            },
            props.notifyOn ? "\u{1F514}" : "\u{1F515}"
          )
        ),
        h(
          "div",
          { className: "kt-card-meta" },
          t.assignee ? h("span", { className: "kt-assignee" + (assignedToMe ? " me" : "") }, "@" + t.assignee) : h(
            "button",
            {
              className: "kt-assign-btn",
              title: "Assign to " + props.assignLabel,
              onClick: (e) => {
                e.stopPropagation();
                props.onToggleAssign(t);
              }
            },
            "\uFF0B assign " + props.assignLabel
          ),
          t.comment_count ? h("span", { className: "kt-meta" }, "\u{1F4AC} " + t.comment_count) : null,
          t.progress && t.progress.total ? h("span", { className: "kt-meta" }, `\u25A6 ${t.progress.done}/${t.progress.total}`) : null,
          t.warnings && t.warnings.count ? h("span", { className: "kt-warn" }, "\u26A0 " + t.warnings.count) : null
        )
      );
    }
    function LaneView(props) {
      return h(
        "div",
        {
          className: "kt-lane" + (props.dragOver === props.lane.id ? " drag-over" : ""),
          onDragOver: (e) => {
            e.preventDefault();
            props.setDragOver(props.lane.id);
          },
          onDragLeave: () => props.setDragOver(null),
          onDrop: (e) => {
            e.preventDefault();
            props.setDragOver(null);
            const id = e.dataTransfer.getData("text/task-id");
            if (id) props.onDropTask(id, props.lane.id);
          },
          style: { borderTopColor: props.lane.accent }
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
          props.tasks.map(
            (t) => h(CardView, {
              key: t.id,
              task: t,
              onDragStart: (e) => props.onDragStart(e, t.id),
              onToggleNotify: props.onToggleNotify,
              notifyOn: !!props.notifyMap[t.id],
              onToggleAssign: props.onToggleAssign,
              assignLabel: props.assignLabel,
              onClick: props.onClickCard
            })
          ),
          props.tasks.length === 0 ? h("div", { className: "kt-empty" }, "\u2014") : null
        )
      );
    }
    function TaskDrawer(props) {
      const t = props.task || {};
      const [title, setTitle] = useState(t.title || "");
      const [body, setBody] = useState(t.body || "");
      const [priority, setPriority] = useState(typeof t.priority === "number" ? t.priority : 0);
      const [assignee, setAssignee] = useState(t.assignee || "");
      const [status, setStatus] = useState(t.status || "triage");
      const [saving, setSaving] = useState(false);
      const save = () => {
        setSaving(true);
        const patch = {
          title,
          body,
          priority: Number(priority) || 0,
          assignee: assignee || null,
          status
        };
        updateTask(t.id, patch, props.board).then(() => {
          setSaving(false);
          props.onSaved();
        }).catch((e) => {
          setSaving(false);
          props.onError(String(e.message || e));
        });
      };
      return h(
        "div",
        {
          className: "kt-drawer-backdrop",
          onClick: (e) => {
            if (e.target === e.currentTarget) props.onClose();
          }
        },
        h(
          "div",
          { className: "kt-drawer" },
          h(
            "div",
            { className: "kt-drawer-head" },
            h("span", { className: "kt-drawer-id" }, t.id || "new"),
            h("button", { className: "kt-drawer-x", onClick: props.onClose }, "\u2715")
          ),
          h(
            "label",
            { className: "kt-field" },
            h("span", null, "Title"),
            h("input", { className: "kt-input", value: title, onChange: (e) => setTitle(e.target.value) })
          ),
          h(
            "label",
            { className: "kt-field" },
            h("span", null, "Body / notes"),
            h("textarea", { className: "kt-textarea", value: body, rows: 5, onChange: (e) => setBody(e.target.value) })
          ),
          h(
            "div",
            { className: "kt-row" },
            h(
              "label",
              { className: "kt-field" },
              h("span", null, "Priority"),
              h("input", { className: "kt-input kt-num", type: "number", value: priority, onChange: (e) => setPriority(e.target.value) })
            ),
            h(
              "label",
              { className: "kt-field" },
              h("span", null, "Assignee"),
              h("input", { className: "kt-input", value: assignee, placeholder: "(unassigned = you)", onChange: (e) => setAssignee(e.target.value) })
            )
          ),
          h(
            "label",
            { className: "kt-field" },
            h("span", null, "Status"),
            h(
              "select",
              { className: "kt-select", value: status, onChange: (e) => setStatus(e.target.value) },
              STATUS_OPTIONS.map((o) => h("option", { key: o.value, value: o.value }, o.label))
            )
          ),
          h(
            "div",
            { className: "kt-drawer-foot" },
            h("button", { className: "kt-btn ghost", onClick: props.onClose }, "Cancel"),
            h("button", { className: "kt-btn", onClick: save, disabled: saving }, saving ? "Saving\u2026" : "Save")
          )
        )
      );
    }
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
      const [openTask, setOpenTask] = useState(null);
      useEffect(() => {
        fetchJSON2(`${API}/config`).then((cfg) => {
          const da = cfg && (cfg.default_assignee || cfg.kanban && cfg.kanban.default_assignee) || "";
          if (da) setAssignLabel(String(da));
        }).catch(() => {
        });
      }, []);
      const load = useCallback(() => {
        setLoading(true);
        fetchJSON2(withBoard2(`${API}/board`, board)).then((data) => {
          const all = [];
          (data.columns || []).forEach((c) => {
            if (c.name === "archived") return;
            (c.tasks || []).forEach((t) => all.push(t));
          });
          setTasks(all);
          setLoading(false);
          setError(null);
          const slice = all.slice(0, 12);
          Promise.all(
            slice.map(
              (t) => fetchJSON2(withBoard2(`${API}/tasks/${encodeURIComponent(t.id)}/home-channels`, board)).then((hc) => ({ id: t.id, tg: (hc.channels || []).some((c) => c.platform === "telegram" && c.subscribed) })).catch(() => ({ id: t.id, tg: false }))
            )
          ).then((res) => {
            const m = {};
            res.forEach((r) => m[r.id] = r.tg);
            setNotifyMap(m);
          });
        }).catch((e) => {
          setError(String(e.message || e));
          setLoading(false);
        });
      }, [board]);
      useEffect(() => {
        fetchJSON2(`${API}/boards`).then((d) => setBoards(d.boards || [])).catch(() => setBoards([]));
      }, []);
      useEffect(() => {
        load();
        let ws = null;
        let closed = false;
        try {
          ws = new WebSocket(buildWsUrl(board, 0));
          ws.onmessage = () => {
            if (!closed) load();
          };
          ws.onerror = () => {
          };
        } catch (_) {
        }
        return () => {
          closed = true;
          if (ws) ws.close();
        };
      }, [load]);
      const onDragStart = useCallback((e, taskId) => {
        dragTask.current = taskId;
        e.dataTransfer.setData("text/task-id", taskId);
        e.dataTransfer.effectAllowed = "move";
      }, []);
      const onDropTask = useCallback(
        (taskId, laneId) => {
          const lane = LANES.find((l) => l.id === laneId);
          if (!lane) return;
          const target = lane.dropStatus;
          const task = tasks.find((t) => t.id === taskId);
          if (task && task.status === target) return;
          fetchJSON2(withBoard2(`${API}/tasks/${encodeURIComponent(taskId)}`, board), {
            method: "PATCH",
            body: JSON.stringify({ status: target, block_reason: target === "blocked" ? "waiting" : void 0 })
          }).then(() => {
            if (target === "ready") fetchJSON2(withBoard2(`${API}/dispatch?max=2`, board), { method: "POST" }).catch(() => {
            });
            load();
          }).catch((e) => setError(String(e.message || e)));
        },
        [tasks, board, load]
      );
      const onToggleNotify = useCallback(
        (task) => {
          const on = !!notifyMap[task.id];
          const url = withBoard2(`${API}/tasks/${encodeURIComponent(task.id)}/home-subscribe/telegram`, board);
          fetchJSON2(url, { method: on ? "DELETE" : "POST" }).then(() => {
            setNotifyMap((m) => ({ ...m, [task.id]: !on }));
          }).catch((e) => setError(String(e.message || e)));
        },
        [notifyMap, board]
      );
      const onToggleAssign = useCallback(
        (task) => {
          const target = task.assignee ? "" : assignLabel;
          reassignTask(task.id, target, board).then(() => load()).catch((e) => setError(String(e.message || e)));
        },
        [assignLabel, board, load]
      );
      const onClickCard = useCallback(
        (task) => {
          getTask(task.id, board).then((d) => setOpenTask(d.task)).catch((e) => setError(String(e.message || e)));
        },
        [board]
      );
      const onNewTask = useCallback(() => {
        const title = newTitle.trim();
        if (!title) return;
        fetchJSON2(withBoard2(`${API}/tasks`, board), {
          method: "POST",
          body: JSON.stringify({ title, triage: true })
        }).then(() => {
          setNewTitle("");
          load();
        }).catch((e) => setError(String(e.message || e)));
      }, [newTitle, board, load]);
      const byLane = useMemo(() => {
        const map = {};
        LANES.forEach((l) => map[l.id] = []);
        tasks.forEach((t) => {
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
          boards.length > 1 ? h(
            "select",
            { className: "kt-select", value: board || "", onChange: (e) => setBoard(e.target.value || null) },
            h("option", { value: "" }, "default"),
            boards.filter((b) => b.slug !== "default").map((b) => h("option", { key: b.slug, value: b.slug }, b.name || b.slug))
          ) : null,
          h("input", {
            className: "kt-input",
            placeholder: "New card \u2192 Backlog\u2026",
            value: newTitle,
            onChange: (e) => setNewTitle(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") onNewTask();
            }
          }),
          h("button", { className: "kt-btn", onClick: onNewTask }, "+ Add"),
          h("button", { className: "kt-btn ghost", onClick: load }, "\u21BB Refresh")
        ),
        error ? h("div", { className: "kt-error" }, error) : null,
        loading && tasks.length === 0 ? h("div", { className: "kt-loading" }, "Loading board\u2026") : null,
        h(
          "div",
          { className: "kt-board" },
          LANES.map(
            (lane) => h(LaneView, {
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
              onClickCard
            })
          )
        ),
        h("div", { className: "kt-foot" }, "Trello skin over Hermes kanban \xB7 Backlog never auto-runs \xB7 drag to ToDo to start \xB7 \uFF0Bassign me / \u{1F514} Telegram \xB7 click a card to edit"),
        openTask ? h(TaskDrawer, {
          task: openTask,
          board,
          onClose: () => setOpenTask(null),
          onSaved: () => {
            setOpenTask(null);
            load();
          },
          onError: (msg) => setError(msg)
        }) : null
      );
    }
    if (window.__HERMES_PLUGINS__ && typeof window.__HERMES_PLUGINS__.register === "function") {
      window.__HERMES_PLUGINS__.register("kanban-trello", KanbanTrelloPage);
    }
  })();
})();
