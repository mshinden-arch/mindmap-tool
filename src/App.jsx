import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import AnimatedEdge from "./components/AnimatedEdge";
import Button from "./components/Button";
import Topic from "./components/Topic";
import { COLORS, STORAGE_KEY } from "./constants";
import { download } from "./fileUtils";
import { runSelfTests } from "./mindmapSelfTests";
import {
  childCount,
  children,
  createId,
  descendants,
  isPoint,
  layoutMap,
  majorColorFor,
  makeTree,
  markdown,
  normalize,
  outline,
  prepareShowMap,
  starter,
} from "./mindmapUtils";

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
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";

    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
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
      if (saved) {
        const parsed = normalize(JSON.parse(saved));
        setMap(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
      // ignore
    }
  }, [map]);

  const activeMap = showMode && showMap ? showMap : map;
  const tree = useMemo(() => makeTree(activeMap.nodes, activeMap.rootId), [activeMap]);
  const drawn = useMemo(() => layoutMap(tree), [tree]);
  const rows = useMemo(() => outline(map.nodes, map.rootId), [map]);

  const selected = activeMap.nodes[selectedId] || activeMap.nodes[activeMap.rootId] || map.nodes[map.rootId];
  const rawSelectedPos = drawn.positions[selectedId] || drawn.positions[activeMap.rootId];
  const selectedPos = isPoint(rawSelectedPos) ? rawSelectedPos : { x: 0, y: 0 };

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const nextPosition = drawn.positions[anchor.nodeId];
    if (!isPoint(nextPosition) || !isPoint(anchor.position)) {
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
    commit(
      (current) => ({
        ...current,
        nodes: {
          ...current.nodes,
          [nodeId]: { ...current.nodes[nodeId], ...patch },
        },
      }),
      nodeId
    );
  }

  function updateShowNode(nodeId, patch) {
    const currentPosition = drawn.positions[nodeId];
    anchorRef.current = currentPosition ? { nodeId, position: currentPosition } : null;

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

  function nextOrder(nodes, parentId) {
    const list = children(nodes, parentId);
    if (!list.length) return 0;
    return Math.max(...list.map((node) => (Number.isFinite(node.order) ? node.order : 0))) + 1;
  }

  function normalizeSiblingOrders(nodes, parentId) {
    const list = children(nodes, parentId);
    const nextNodes = { ...nodes };

    list.forEach((node, index) => {
      nextNodes[node.id] = { ...nextNodes[node.id], order: index };
    });

    return nextNodes;
  }

  function addChild(parentId) {
    const newId = createId();

    commit(
      (current) => {
        const color =
          parentId === current.rootId
            ? COLORS[childCount(current.nodes, current.rootId) % COLORS.length]
            : majorColorFor(current, parentId);

        const normalizedNodes = normalizeSiblingOrders(current.nodes, parentId);

        return {
          ...current,
          nodes: {
            ...normalizedNodes,
            [parentId]: { ...normalizedNodes[parentId], collapsed: false },
            [newId]: {
              id: newId,
              parentId,
              text: "新しいトピック",
              order: nextOrder(normalizedNodes, parentId),
              collapsed: false,
              color,
            },
          },
        };
      },
      newId
    );
  }

  function addSibling(nodeId) {
    const base = map.nodes[nodeId];
    if (!base || !base.parentId) return;

    const currentPosition = drawn.positions[nodeId];
    anchorRef.current = currentPosition ? { nodeId, position: currentPosition } : null;

    const newId = createId();

    commit(
      (current) => {
        const currentBase = current.nodes[nodeId];
        if (!currentBase || !currentBase.parentId) return current;

        const parentId = currentBase.parentId;
        const normalizedNodes = normalizeSiblingOrders(current.nodes, parentId);

        const color =
          parentId === current.rootId
            ? COLORS[childCount(normalizedNodes, current.rootId) % COLORS.length]
            : majorColorFor({ ...current, nodes: normalizedNodes }, nodeId);

        return {
          ...current,
          nodes: {
            ...normalizedNodes,
            [newId]: {
              id: newId,
              parentId,
              text: "新しいトピック",
              order: nextOrder(normalizedNodes, parentId),
              collapsed: false,
              color,
            },
          },
        };
      },
      nodeId
    );
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

    setViewport((v) => ({
      ...v,
      zoom: Math.max(0.35, Math.min(1.8, v.zoom + delta)),
    }));
  }

  function startPan(e) {
    setToolbarOpen(false);
    setPanning(true);
    panRef.current = { x: viewport.x, y: viewport.y, mx: e.clientX, my: e.clientY };
  }

  function movePan(e) {
    if (!panning || !panRef.current) return;

    const pan = panRef.current;

    setViewport((v) => ({
      ...v,
      x: pan.x + e.clientX - pan.mx,
      y: pan.y + e.clientY - pan.my,
    }));
  }

  function stopPan() {
    setPanning(false);
    panRef.current = null;
  }

  useEffect(() => {
    function key(e) {
      const target = e.target;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === "Escape" && showMode) {
        exitShowMode();
        return;
      }

      if (typing || showMode) return;

      if (e.key === "Tab") {
        e.preventDefault();
        addChild(selectedId);
      }

      if (e.key === "Enter") {
        e.preventDefault();
        selected?.parentId ? addSibling(selectedId) : addChild(selectedId);
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        removeNode(selectedId);
      }

      if (e.key === "F2") {
        e.preventDefault();
        beginEdit(selectedId);
      }
    }

    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [map, selectedId, showMode, history, activeMap]);

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
    <div className="h-screen w-full overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50 text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#dbeafe_1px,transparent_0)] [background-size:28px_28px] opacity-80" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sky-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-violet-100/60 blur-3xl" />

      {!showMode ? (
        <header className="absolute left-5 right-5 top-5 z-30 flex items-start justify-between gap-4">
          <div className="rounded-[28px] border border-white/70 bg-white/85 p-3 shadow-xl shadow-slate-200/70 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-3 px-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 font-black text-white shadow-lg">
                M
              </div>
              <div>
                <div className="text-sm font-black tracking-tight">MindMap</div>
                <div className="text-xs text-slate-500">説明用：マップだけで見せられるシンプル設計</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => addChild(selectedId)}>＋ トピック</Button>
              <Button active={outlineOpen} onClick={() => setOutlineOpen((v) => !v)}>
                アウトライン
              </Button>
              <Button disabled={!history.past.length} onClick={undo}>
                戻す
              </Button>
              <Button disabled={!history.future.length} onClick={redo}>
                進む
              </Button>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white/85 p-3 shadow-xl shadow-slate-200/70 backdrop-blur-xl">
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={startShowMode}>見せる</Button>
              <Button onClick={() => setViewport({ x: 250, y: 390, zoom: 1 })}>位置リセット</Button>
              <Button onClick={() => download("mindmap.json", JSON.stringify(map, null, 2), "application/json")}>
                保存
              </Button>
              <Button onClick={() => download("mindmap.md", markdown(map.nodes, map.rootId), "text/markdown")}>
                文章出力
              </Button>
              <Button onClick={() => fileRef.current?.click()}>開く</Button>
              <Button onClick={() => commit(starter(), "root")}>新しく作る</Button>
            </div>

            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importJson} />
          </div>
        </header>
      ) : (
        <button
          type="button"
          onClick={exitShowMode}
          className="absolute right-5 top-5 z-40 rounded-full border border-white/70 bg-white/85 px-4 py-2 text-sm font-black text-slate-700 shadow-xl backdrop-blur-xl transition hover:bg-white"
        >
          編集に戻る Esc
        </button>
      )}

      {!showMode && outlineOpen ? (
        <aside className="absolute bottom-5 left-5 top-36 z-30 w-80 overflow-hidden rounded-[28px] border border-white/70 bg-white/88 shadow-xl shadow-slate-200/70 backdrop-blur-xl">
          <div className="border-b border-slate-100 p-4">
            <div className="text-sm font-black">アウトライン</div>
            <div className="text-xs text-slate-500">説明順を文章で確認</div>
          </div>

          <div className="h-full overflow-auto p-3 pb-24">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={
                  (selectedId === row.id ? "bg-slate-900 text-white shadow " : "hover:bg-slate-100 ") +
                  "mb-1 block w-full rounded-2xl px-3 py-2 text-left text-xs transition"
                }
                style={{ paddingLeft: 10 + row.depth * 16 }}
              >
                {row.collapsed ? "＋ " : ""}
                {row.text}
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      {!showMode && toolbarOpen && selected ? (
        <div
          className="absolute z-40 flex items-center gap-1 rounded-full border border-white/70 bg-white/92 p-2 shadow-xl shadow-slate-200/80 backdrop-blur-xl"
          style={{
            left: viewport.x + selectedPos.x * viewport.zoom,
            top: viewport.y + selectedPos.y * viewport.zoom - 72,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-black text-white shadow" onClick={() => addChild(selectedId)}>
            ＋ 子
          </button>
          <button
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black disabled:opacity-40"
            disabled={!selected.parentId}
            onClick={() => addSibling(selectedId)}
          >
            兄弟
          </button>
          <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black" onClick={() => beginEdit(selectedId)}>
            編集
          </button>
          <button
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-red-600 disabled:opacity-40"
            disabled={!selected.parentId}
            onClick={() => removeNode(selectedId)}
          >
            削除
          </button>
        </div>
      ) : null}

      {editingId ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/20 backdrop-blur-sm">
          <div className="w-[520px] rounded-[28px] bg-white p-5 shadow-2xl">
            <div className="mb-3 text-sm font-black">見出しを編集</div>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishEdit();
                if (e.key === "Escape") setEditingId(null);
              }}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:ring-4 focus:ring-sky-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setEditingId(null)}>キャンセル</Button>
              <Button onClick={finishEdit}>反映</Button>
            </div>
          </div>
        </div>
      ) : null}

      <main
        className={(panning ? "cursor-grabbing" : "cursor-grab") + " relative z-10 h-full w-full"}
        onMouseDown={startPan}
        onMouseMove={movePan}
        onMouseUp={stopPan}
        onMouseLeave={stopPan}
        onWheel={onWheel}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          }}
        >
          <svg className="pointer-events-none absolute overflow-visible" width="1" height="1">
            <AnimatePresence initial={false}>
              {drawn.edges.map((edge, index) => (
                <AnimatedEdge
                  key={`${edge.from}_${edge.to}_${index}`}
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
                onToggle={(x) =>
                  showMode
                    ? updateShowNode(x, { collapsed: !activeMap.nodes[x].collapsed })
                    : updateNode(x, { collapsed: !map.nodes[x].collapsed })
                }
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}
