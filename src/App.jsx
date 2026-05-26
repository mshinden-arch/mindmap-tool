import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STORAGE_KEY = "mindmap_explain_tool_v7";
const NEWLINE = String.fromCharCode(10);
const COLORS = ["blue", "green", "orange", "pink", "purple", "teal", "gray"];

const GRADIENT = {
  root: "bg-slate-900 text-white border-slate-900 shadow-slate-300/70",
  blue: "bg-gradient-to-r from-sky-500 to-blue-600 text-white border-sky-300 shadow-sky-200/80",
  green: "bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-emerald-300 shadow-emerald-200/80",
  orange: "bg-gradient-to-r from-amber-400 to-orange-500 text-white border-amber-300 shadow-amber-200/80",
  pink: "bg-gradient-to-r from-rose-400 to-pink-600 text-white border-rose-300 shadow-rose-200/80",
  purple: "bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white border-violet-300 shadow-violet-200/80",
  teal: "bg-gradient-to-r from-cyan-500 to-teal-600 text-white border-cyan-300 shadow-cyan-200/80",
  gray: "bg-gradient-to-r from-slate-500 to-slate-700 text-white border-slate-300 shadow-slate-200/80",
};

const SOFT = {
  blue: "bg-sky-50 text-sky-950 border-sky-200 shadow-sky-100/70",
  green: "bg-emerald-50 text-emerald-950 border-emerald-200 shadow-emerald-100/70",
  orange: "bg-amber-50 text-amber-950 border-amber-200 shadow-amber-100/70",
  pink: "bg-rose-50 text-rose-950 border-rose-200 shadow-rose-100/70",
  purple: "bg-violet-50 text-violet-950 border-violet-200 shadow-violet-100/70",
  teal: "bg-teal-50 text-teal-950 border-teal-200 shadow-teal-100/70",
  gray: "bg-white text-slate-900 border-slate-200 shadow-slate-100/70",
};

const STROKE = {
  root: "#0f172a",
  blue: "#38bdf8",
  green: "#34d399",
  orange: "#f59e0b",
  pink: "#fb7185",
  purple: "#a78bfa",
  teal: "#2dd4bf",
  gray: "#94a3b8",
};

function createId() {
  return "n_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function isPoint(value) {
  return Boolean(value && Number.isFinite(value.x) && Number.isFinite(value.y));
}

function starter() {
  return {
    rootId: "root",
    nodes: {
      root: { id: "root", parentId: null, text: "説明したいテーマ", order: 0, collapsed: false, color: "root" },
      a: { id: "a", parentId: "root", text: "背景", order: 0, collapsed: false, color: "blue" },
      b: { id: "b", parentId: "root", text: "論点", order: 1, collapsed: false, color: "green" },
      c: { id: "c", parentId: "root", text: "打ち手", order: 2, collapsed: false, color: "orange" },
    },
  };
}

function normalize(input) {
  if (!input || !input.rootId || !input.nodes || !input.nodes[input.rootId]) return starter();

  const nodes = {};
  Object.values(input.nodes).forEach((raw, index) => {
    if (!raw || !raw.id) return;
    nodes[raw.id] = {
      id: String(raw.id),
      parentId: raw.parentId == null ? null : String(raw.parentId),
      text: String(raw.text || "無題"),
      order: Number.isFinite(raw.order) ? raw.order : index,
      collapsed: Boolean(raw.collapsed),
      color: raw.color || (raw.parentId ? COLORS[index % COLORS.length] : "root"),
    };
  });

  if (!nodes[input.rootId]) return starter();
  return { rootId: String(input.rootId), nodes };
}

function children(nodes, parentId) {
  if (!nodes || !parentId) return [];
  return Object.values(nodes)
    .filter((node) => node && node.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

function childCount(nodes, parentId) {
  return children(nodes, parentId).length;
}

function descendants(nodes, nodeId) {
  const out = [];
  const stack = [nodeId];
  while (stack.length) {
    const current = stack.pop();
    children(nodes, current).forEach((child) => {
      out.push(child.id);
      stack.push(child.id);
    });
  }
  return out;
}

function majorColorFor(map, nodeId) {
  let cursor = map.nodes[nodeId];
  if (!cursor) return "blue";
  while (cursor.parentId && cursor.parentId !== map.rootId) {
    cursor = map.nodes[cursor.parentId];
    if (!cursor) return "blue";
  }
  if (cursor && cursor.parentId === map.rootId) return cursor.color;
  return COLORS[childCount(map.nodes, map.rootId) % COLORS.length];
}

function makeTree(nodes, rootId) {
  function walk(nodeId, depth) {
    const node = nodes[nodeId];
    if (!node) return null;
    const kids = children(nodes, nodeId)
      .map((child) => walk(child.id, depth + 1))
      .filter(Boolean);
    return { ...node, depth, children: kids };
  }
  return walk(rootId, 0);
}

function topicWidth(node) {
  if (!node) return 160;
  const text = String(node.text || "");
  const hasWideChars = /[\u3000-\u9fff\u3040-\u30ff]/.test(text);
  const charWidth = hasWideChars ? 15 : 9;
  const padding = node.parentId ? 48 : 64;
  return Math.max(node.parentId ? 132 : 180, text.length * charWidth + padding);
}

function layoutMap(tree) {
  const positions = {};
  const visibility = {};
  const edges = [];
  if (!tree) return { positions, visibility, edges };

  const xGap = 120;
  const yGap = 84;

  function visibleChildren(node) {
    return node && !node.collapsed ? node.children || [] : [];
  }

  function subtreeHeight(node) {
    const kids = visibleChildren(node);
    if (!kids.length) return yGap;
    return Math.max(
      yGap,
      kids.reduce((sum, child) => sum + subtreeHeight(child), 0)
    );
  }

  function placeHidden(node, y, x, parentId = null) {
    if (!node) return;
    positions[node.id] = { x, y };
    visibility[node.id] = false;

    if (parentId) {
      edges.push({ from: parentId, to: node.id, color: node.color, visible: false });
    }

    const hiddenChildren = node.children || [];
    hiddenChildren.forEach((child, index) => {
      placeHidden(
        child,
        y + (index - (hiddenChildren.length - 1) / 2) * 18,
        x + topicWidth(node) + xGap,
        node.id
      );
    });
  }

  function place(node, x, y) {
    if (!node) return;
    positions[node.id] = { x, y };
    visibility[node.id] = true;

    const kids = visibleChildren(node);
    if (kids.length) {
      const totalHeight = kids.reduce((sum, child) => sum + subtreeHeight(child), 0);
      let cursorY = y - totalHeight / 2;

      kids.forEach((child) => {
        const childHeight = subtreeHeight(child);
        const childCenterY = cursorY + childHeight / 2;
        const childX = x + topicWidth(node) + xGap;
        edges.push({ from: node.id, to: child.id, color: child.color, visible: true });
        place(child, childX, childCenterY);
        cursorY += childHeight;
      });
    }

    if (node.collapsed && (node.children || []).length) {
      const allChildren = node.children || [];
      allChildren.forEach((child, index) => {
        placeHidden(
          child,
          y + (index - (allChildren.length - 1) / 2) * 18,
          x + topicWidth(node) + xGap,
          node.id
        );
      });
    }
  }

  place(tree, 0, 0);
  return { positions, visibility, edges };
}

function outline(nodes, rootId) {
  const rows = [];
  function walk(nodeId, depth) {
    const node = nodes[nodeId];
    if (!node) return;
    rows.push({ id: nodeId, depth, text: node.text, collapsed: node.collapsed });
    children(nodes, nodeId).forEach((child) => walk(child.id, depth + 1));
  }
  walk(rootId, 0);
  return rows;
}

function prepareShowMap(inputMap) {
  const normalized = normalize(inputMap);
  const nextNodes = {};
  Object.values(normalized.nodes).forEach((node) => {
    const isRoot = node.id === normalized.rootId;
    const isRootChild = node.parentId === normalized.rootId;
    nextNodes[node.id] = {
      ...node,
      collapsed: isRoot || isRootChild ? true : node.collapsed,
    };
  });
  return { ...normalized, nodes: nextNodes };
}

function markdown(nodes, rootId) {
  const lines = [];
  function walk(nodeId, depth) {
    const node = nodes[nodeId];
    if (!node) return;
    if (depth === 0) lines.push("# " + node.text);
    if (depth > 0) lines.push("  ".repeat(depth - 1) + "- " + node.text);
    children(nodes, nodeId).forEach((child) => walk(child.id, depth + 1));
  }
  walk(rootId, 0);
  return lines.join(NEWLINE);
}

function download(name, body, type) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function runSelfTests() {
  const testMap = starter();
  const tree = makeTree(testMap.nodes, testMap.rootId);
  const laidOut = layoutMap(tree);
  console.assert(Boolean(laidOut.positions.root), "root should have a layout position");
  console.assert(
    Object.values(laidOut.positions).every((pos) => isPoint(pos)),
    "all positions should be finite points"
  );
  const show = prepareShowMap(testMap);
  console.assert(show.nodes.root.collapsed === true, "show mode should start with root collapsed");
  console.assert(show.nodes.a.collapsed === true, "show mode should start with root children collapsed");
  console.assert(!Object.prototype.hasOwnProperty.call(show.nodes.root, "note"), "note should not exist on nodes");

  const brokenTreeResult = layoutMap(null);
  console.assert(Object.keys(brokenTreeResult.positions).length === 0, "null tree should return empty positions");
}

function Button({ children, onClick, disabled, active }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={(active ? "bg-slate-900 text-white border-slate-900" : "bg-white/90 text-slate-700 border-slate-200 hover:bg-white") + " rounded-full border px-4 py-2 text-sm font-bold shadow-sm transition active:scale-95 disabled:opacity-40"}
    >
      {children}
    </button>
  );
}

function AnimatedEdge({ edge, index, drawn, activeMap, showMode, selectedId }) {
  const a = drawn.positions[edge.from];
  const b = drawn.positions[edge.to];

  if (!isPoint(a) || !isPoint(b)) return null;

  const startX = a.x + topicWidth(activeMap.nodes[edge.from]) + 18;
  const endX = b.x - 20;
  const dx = Math.max(80, endX - startX);
  const c1x = startX + dx * 0.5;
  const c2x = endX - dx * 0.5;
  const color = STROKE[edge.color] || "#94a3b8";
  const edgeFocus = !showMode || edge.to === selectedId || edge.from === selectedId;
  const edgeOpacity = edge.visible === false ? 0 : showMode ? (edgeFocus ? 1 : 0.15) : 1;
  const d = `M ${startX} ${a.y} C ${c1x} ${a.y}, ${c2x} ${b.y}, ${endX} ${b.y}`;

  return (
    <motion.path
      key={`${edge.from}_${edge.to}_${index}`}
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeLinecap="round"
      initial={false}
      animate={{
        d,
        opacity: edgeOpacity,
      }}
      transition={{
        d: { duration: 0.35, ease: "easeInOut" },
        opacity: { duration: 0.35, ease: "easeInOut" },
      }}
    />
  );
}

function Topic({ node, count, pos, selected, hidden, readOnly, isMajor, focusMode, focused, onSelect, onEdit, onAdd, onSibling, onDelete, onToggle }) {
  if (!node || !isPoint(pos)) return null;

  const isRoot = !node.parentId;
  const cls = isRoot ? GRADIENT.root : isMajor ? (GRADIENT[node.color] || GRADIENT.gray) : (SOFT[node.color] || SOFT.gray);
  const focusRing = node.color === "root"
    ? "ring-slate-300"
    : node.color === "blue"
      ? "ring-sky-300"
      : node.color === "green"
        ? "ring-emerald-300"
        : node.color === "orange"
          ? "ring-amber-300"
          : node.color === "pink"
            ? "ring-rose-300"
            : node.color === "purple"
              ? "ring-violet-300"
              : node.color === "teal"
                ? "ring-cyan-300"
                : "ring-slate-300";
  const size = isRoot ? "px-7 py-3.5 text-base" : isMajor ? "px-6 py-3 text-sm" : "px-5 py-2.5 text-sm";
  const focusClass = hidden ? "" : focusMode ? (focused ? "opacity-100 scale-100 " : "opacity-25 scale-[0.98] ") : "";

  return (
    <div
      className={(focusClass || (hidden ? "" : "opacity-100 scale-100 ")) + (hidden ? " pointer-events-none !opacity-0 scale-95 " : " ") + "absolute transition-all duration-500 ease-out"}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      <div className={((selected && !readOnly) || (focused && readOnly) ? `ring-4 ${focusRing} scale-[1.03] ` : "") + cls + " group relative -translate-y-1/2 whitespace-nowrap rounded-full border font-black shadow-lg transition-all duration-500 ease-out hover:shadow-xl " + size}>
        <button type="button" className="block whitespace-nowrap" onDoubleClick={() => !readOnly && onEdit(node.id)}>
          {node.text}
        </button>

        {count > 0 ? (
          <button
            type="button"
            aria-label={node.collapsed ? "開く" : "閉じる"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border border-slate-200 bg-white shadow"
          >
            <span className="absolute left-1/2 top-1/2 h-[2px] w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-600" />
            {node.collapsed ? <span className="absolute left-1/2 top-1/2 h-2.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-600" /> : null}
          </button>
        ) : null}

        {!readOnly ? (
          <div className="absolute -right-3 -top-4 hidden gap-1 group-hover:flex">
            <button className="rounded-full bg-slate-900 px-2 py-1 text-xs text-white shadow" onClick={() => onAdd(node.id)}>＋</button>
            {node.parentId ? <button className="rounded-full bg-white px-2 py-1 text-xs text-slate-700 shadow" onClick={() => onSibling(node.id)}>↵</button> : null}
            {node.parentId ? <button className="rounded-full bg-white px-2 py-1 text-xs text-red-600 shadow" onClick={() => onDelete(node.id)}>×</button> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function MindMapTool() {
  const fileRef = useRef(null);
  const panRef = useRef(null);
  const anchorRef = useRef(null);
  const didRunTestsRef = useRef(false);
  const [map, setMap] = useState(starter);
  const [selectedId, setSelectedId] = useState("root");
  const [viewport, setViewport] = useState({ x: 250, y: 390, zoom: 1 });
  const [panning, setPanning] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState({ past: [], future: [] });
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [showMode, setShowMode] = useState(false);
  const [showMap, setShowMap] = useState(null);
  const [toolbarOpen, setToolbarOpen] = useState(true);

  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    if (!didRunTestsRef.current) {
      didRunTestsRef.current = true;
      runSelfTests();
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMap(normalize(JSON.parse(saved)));
    } catch {
      setMap(starter());
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }, [map]);

  const activeMap = showMode && showMap ? showMap : map;
  const tree = useMemo(() => makeTree(activeMap.nodes, activeMap.rootId), [activeMap]);
  const drawn = useMemo(() => layoutMap(tree), [tree]);
  const rows = useMemo(() => outline(map.nodes, map.rootId), [map]);
  const selected = activeMap.nodes[selectedId] || activeMap.nodes[activeMap.rootId] || map.nodes[map.rootId];
  const selectedPos = drawn.positions[selectedId] || drawn.positions[activeMap.rootId] || { x: 0, y: 0 };

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !isPoint(anchor.position)) return;
    const nextPosition = drawn.positions[anchor.nodeId];
    if (!isPoint(nextPosition)) {
      anchorRef.current = null;
      return;
    }
    anchorRef.current = null;
    setViewport((current) => ({
      ...current,
      x: current.x + (anchor.position.x - nextPosition.x) * current.zoom,
      y: current.y + (anchor.position.y - nextPosition.y) * current.zoom,
    }));
  }, [drawn]);

  function commit(updater, nextSelected = selectedId) {
    setMap((current) => {
      const next = normalize(typeof updater === "function" ? updater(current) : updater);
      setHistory((h) => ({ past: [...h.past.slice(-50), current], future: [] }));
      return next;
    });
    setSelectedId(nextSelected);
  }

  function selectNode(nodeId) {
    setSelectedId(nodeId);
    setToolbarOpen(!showMode);
  }

  function updateNode(nodeId, patch) {
    commit((current) => ({ ...current, nodes: { ...current.nodes, [nodeId]: { ...current.nodes[nodeId], ...patch } } }), nodeId);
  }

  function updateShowNode(nodeId, patch) {
    const currentPosition = drawn.positions[nodeId];
    anchorRef.current = isPoint(currentPosition) ? { nodeId, position: currentPosition } : null;
    setShowMap((current) => {
      if (!current || !current.nodes[nodeId]) return current;
      return {
        ...current,
        nodes: {
          ...current.nodes,
          [nodeId]: { ...current.nodes[nodeId], ...patch },
        },
      };
    });
    setSelectedId(nodeId);
  }

  function addChild(parentId) {
    const newId = createId();
    commit((current) => {
      const color = parentId === current.rootId ? COLORS[childCount(current.nodes, current.rootId) % COLORS.length] : majorColorFor(current, parentId);
      return {
        ...current,
        nodes: {
          ...current.nodes,
          [parentId]: { ...current.nodes[parentId], collapsed: false },
          [newId]: { id: newId, parentId, text: "新しいトピック", order: childCount(current.nodes, parentId), collapsed: false, color },
        },
      };
    }, newId);
  }

  function addSibling(nodeId) {
    const base = map.nodes[nodeId];
    if (!base || !base.parentId) return;
    const newId = createId();
    commit((current) => {
      const currentBase = current.nodes[nodeId];
      const color = currentBase.parentId === current.rootId ? COLORS[childCount(current.nodes, current.rootId) % COLORS.length] : majorColorFor(current, nodeId);
      return {
        ...current,
        nodes: {
          ...current.nodes,
          [newId]: { id: newId, parentId: currentBase.parentId, text: "新しいトピック", order: childCount(current.nodes, currentBase.parentId), collapsed: false, color },
        },
      };
    }, newId);
  }

  function removeNode(nodeId) {
    if (nodeId === map.rootId) return;
    const parentId = map.nodes[nodeId]?.parentId || map.rootId;
    const remove = new Set([nodeId, ...descendants(map.nodes, nodeId)]);
    commit((current) => {
      const nextNodes = { ...current.nodes };
      remove.forEach((x) => delete nextNodes[x]);
      return { ...current, nodes: nextNodes };
    }, parentId);
  }

  function beginEdit(nodeId) {
    const node = map.nodes[nodeId];
    if (!node) return;
    setSelectedId(nodeId);
    setToolbarOpen(false);
    setEditingId(nodeId);
    setDraft(node.text);
  }

  function finishEdit() {
    if (!editingId) return;
    updateNode(editingId, { text: draft.trim() || "無題" });
    setEditingId(null);
    setDraft("");
  }

  function undo() {
    setHistory((h) => {
      const prev = h.past[h.past.length - 1];
      if (!prev) return h;
      setMap(prev);
      setSelectedId(prev.rootId);
      return { past: h.past.slice(0, -1), future: [map, ...h.future] };
    });
  }

  function redo() {
    setHistory((h) => {
      const next = h.future[0];
      if (!next) return h;
      setMap(next);
      setSelectedId(next.rootId);
      return { past: [...h.past, map], future: h.future.slice(1) };
    });
  }

  function startShowMode() {
    const prepared = prepareShowMap(map);
    setShowMap(prepared);
    setSelectedId(prepared.rootId);
    setShowMode(true);
    setToolbarOpen(false);
    setViewport({ x: 250, y: window.innerHeight * 0.48, zoom: 0.95 });
  }

  function exitShowMode() {
    setShowMode(false);
    setShowMap(null);
  }

  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.07 : 0.07;
    setViewport((v) => ({ ...v, zoom: Math.max(0.35, Math.min(1.8, v.zoom + delta)) }));
  }

  function startPan(e) {
    setToolbarOpen(false);
    setPanning(true);
    panRef.current = { x: viewport.x, y: viewport.y, mx: e.clientX, my: e.clientY };
  }

  function movePan(e) {
    if (!panning || !panRef.current) return;
    setViewport((v) => ({ ...v, x: panRef.current.x + e.clientX - panRef.current.mx, y: panRef.current.y + e.clientY - panRef.current.my }));
  }

  function stopPan() {
    setPanning(false);
    panRef.current = null;
  }

  useEffect(() => {
    function key(e) {
      const target = e.target;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (e.key === "Escape" && showMode) { exitShowMode(); return; }
      if (typing || showMode) return;
      if (e.key === "Tab") { e.preventDefault(); addChild(selectedId); }
      if (e.key === "Enter") { e.preventDefault(); selected.parentId ? addSibling(selectedId) : addChild(selectedId); }
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); removeNode(selectedId); }
      if (e.key === "F2") { e.preventDefault(); beginEdit(selectedId); }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [map, selectedId, showMode, history, selected]);

  async function importJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const next = normalize(JSON.parse(await file.text()));
      commit(next, next.rootId);
    } catch {
      alert("JSONを読み込めませんでした");
    }
    e.target.value = "";
  }

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50 text-slate-950 overscroll-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#dbeafe_1px,transparent_0)] [background-size:28px_28px] opacity-80" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sky-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-violet-100/60 blur-3xl" />

      {!showMode ? (
        <header className="absolute left-5 right-5 top-5 z-30 flex items-start justify-between gap-4">
          <div className="rounded-[28px] border border-white/70 bg-white/85 p-3 shadow-xl shadow-slate-200/70 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-3 px-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 font-black text-white shadow-lg">M</div>
              <div>
                <div className="text-sm font-black tracking-tight">MindMap</div>
                <div className="text-xs text-slate-500">説明用：マップだけで見せられるシンプル設計</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => addChild(selectedId)}>＋ トピック</Button>
              <Button active={outlineOpen} onClick={() => setOutlineOpen((v) => !v)}>アウトライン</Button>
              <Button disabled={!history.past.length} onClick={undo}>戻す</Button>
              <Button disabled={!history.future.length} onClick={redo}>進む</Button>
            </div>
          </div>
          <div className="rounded-[28px] border border-white/70 bg-white/85 p-3 shadow-xl shadow-slate-200/70 backdrop-blur-xl">
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={startShowMode}>見せる</Button>
              <Button onClick={() => setViewport({ x: 250, y: 390, zoom: 1 })}>位置リセット</Button>
              <Button onClick={() => download("mindmap.json", JSON.stringify(map, null, 2), "application/json")}>保存</Button>
              <Button onClick={() => download("mindmap.md", markdown(map.nodes, map.rootId), "text/markdown")}>文章出力</Button>
              <Button onClick={() => fileRef.current?.click()}>開く</Button>
              <Button onClick={() => commit(starter(), "root")}>新しく作る</Button>
            </div>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importJson} />
          </div>
        </header>
      ) : (
        <button type="button" onClick={exitShowMode} className="absolute right-5 top-5 z-40 rounded-full border border-white/70 bg-white/85 px-4 py-2 text-sm font-black text-slate-700 shadow-xl backdrop-blur-xl transition hover:bg-white">編集に戻る Esc</button>
      )}

      {!showMode && outlineOpen ? (
        <aside className="absolute bottom-5 left-5 top-36 z-30 w-80 overflow-hidden rounded-[28px] border border-white/70 bg-white/88 shadow-xl shadow-slate-200/70 backdrop-blur-xl">
          <div className="border-b border-slate-100 p-4"><div className="text-sm font-black">アウトライン</div><div className="text-xs text-slate-500">説明順を文章で確認</div></div>
          <div className="h-full overflow-auto p-3 pb-24 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {rows.map((row) => (
              <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className={(selectedId === row.id ? "bg-slate-900 text-white shadow " : "hover:bg-slate-100 ") + "mb-1 block w-full rounded-2xl px-3 py-2 text-left text-xs transition"} style={{ paddingLeft: 10 + row.depth * 16 }}>
                {row.collapsed ? "＋ " : ""}{row.text}
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      {!showMode && toolbarOpen && selected && isPoint(selectedPos) ? (
        <div className="absolute z-40 flex items-center gap-1 rounded-full border border-white/70 bg-white/92 p-2 shadow-xl shadow-slate-200/80 backdrop-blur-xl" style={{ left: viewport.x + selectedPos.x * viewport.zoom, top: viewport.y + selectedPos.y * viewport.zoom - 72 }} onMouseDown={(e) => e.stopPropagation()}>
          <button className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-black text-white shadow" onClick={() => addChild(selectedId)}>＋ 子</button>
          <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black disabled:opacity-40" disabled={!selected.parentId} onClick={() => addSibling(selectedId)}>兄弟</button>
          <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black" onClick={() => beginEdit(selectedId)}>編集</button>
          <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-red-600 disabled:opacity-40" disabled={!selected.parentId} onClick={() => removeNode(selectedId)}>削除</button>
        </div>
      ) : null}

      {editingId ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/20 backdrop-blur-sm">
          <div className="w-[520px] rounded-[28px] bg-white p-5 shadow-2xl">
            <div className="mb-3 text-sm font-black">見出しを編集</div>
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") finishEdit(); if (e.key === "Escape") setEditingId(null); }} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-4 focus:ring-sky-100" />
            <div className="mt-4 flex justify-end gap-2"><Button onClick={() => setEditingId(null)}>キャンセル</Button><Button onClick={finishEdit}>反映</Button></div>
          </div>
        </div>
      ) : null}

      <main className={(panning ? "cursor-grabbing" : "cursor-grab") + " relative z-10 h-full w-full overflow-hidden overscroll-none touch-none"} onMouseDown={startPan} onMouseMove={movePan} onMouseUp={stopPan} onMouseLeave={stopPan} onWheel={onWheel}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
          <svg className="absolute overflow-visible" width="1" height="1">
            <AnimatePresence initial={false}>
              {drawn.edges.map((edge, index) => (
                <AnimatedEdge
                  key={`${edge.from}_${edge.to}`}
                  edge={edge}
                  index={index}
                  drawn={drawn}
                  activeMap={activeMap}
                  showMode={showMode}
                  selectedId={selectedId}
                />
              ))}
            </AnimatePresence>
          </svg>

          {Object.keys(drawn.positions).map((nodeId) => {
            const node = activeMap.nodes[nodeId];
            const pos = drawn.positions[nodeId];
            if (!node || !isPoint(pos)) return null;
            return (
              <Topic
                key={nodeId}
                node={node}
                count={childCount(activeMap.nodes, nodeId)}
                pos={pos}
                selected={selectedId === nodeId}
                hidden={drawn.visibility && drawn.visibility[nodeId] === false}
                readOnly={showMode}
                isMajor={node.parentId === activeMap.rootId}
                focusMode={showMode}
                focused={selectedId === nodeId}
                onSelect={selectNode}
                onEdit={beginEdit}
                onAdd={addChild}
                onSibling={addSibling}
                onDelete={removeNode}
                onToggle={(x) => showMode ? updateShowNode(x, { collapsed: !activeMap.nodes[x].collapsed }) : updateNode(x, { collapsed: !map.nodes[x].collapsed })}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}
