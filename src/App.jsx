import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import AnimatedEdge from "./components/AnimatedEdge";
import Button from "./components/Button";
import Topic from "./components/Topic";
import { COLORS, PALETTE_OPTIONS, PALETTE_STORAGE_KEY, PALETTES, STORAGE_KEY } from "./constants";
import { download } from "./fileUtils";
import { copyMindMapImage, saveMindMapImage } from "./imageExport";
import { runSelfTests } from "./mindmapSelfTests";
import {
  cloneSharedMap,
  copyTextToClipboard,
  createShareUrl,
  hasSharePayload,
  readShareUrl,
} from "./shareLink";
import {
  childCount,
  children,
  createExpandedMap,
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

const ANNOUNCEMENTS = [
  {
    title: "共有機能追加",
    body: "マインドマップをURLひとつで共有できるようになりました。共有画面は閲覧専用で、アカウント登録やデータベースは不要です。",
  },
  {
    title: "画像共有機能追加",
    body: "現在の見え方をそのままコピーする機能と、マップ全体を資料用PNGとして保存する機能を追加しました。",
  },
  {
    title: "ノード並び替え",
    body: "同じ親を持つノードをドラッグで並び替えられるようになりました。枝ごと持ち上げるように動きます。",
  },
  {
    title: "アウトラインモード強化",
    body: "アウトライン上で文字編集、Enterで追加、Tabで階層変更ができます。マップと同じデータを編集します。",
  },
  {
    title: "カラーパレット切替",
    body: "Default、Business、Minimalから見た目を選べます。用途に合わせて雰囲気を切り替えられます。",
  },
  {
    title: "UI/UX整理",
    body: "ドラッグ中の見え方、線の追従、選択中の表示などを調整して、操作感を分かりやすくしました。",
  },
];

const ANNOUNCEMENT_META = [
  { date: "2026.06.15", release: "2026.06.15-share-link", releaseOrder: 3 },
  { date: "2026.05.28", release: "2026.05.28-image-sharing", releaseOrder: 2 },
  { date: "2026.05.28", release: "2026.05.28-initial", releaseOrder: 1 },
  { date: "2026.05.28", release: "2026.05.28-initial", releaseOrder: 1 },
  { date: "2026.05.28", release: "2026.05.28-initial", releaseOrder: 1 },
  { date: "2026.05.28", release: "2026.05.28-initial", releaseOrder: 1 },
];

const ANNOUNCEMENT_DETAILS = [
  "主な機能\n・共有リンクをワンクリックで生成\n・URLを開くだけで閲覧可能\n・データベースやアカウント登録不要\n・ノードの開閉操作に対応\n・アウトライン表示に対応\n・共有リンクを再コピー可能\n・パン・ズーム・位置リセット対応\n\n共有画面は閲覧専用となっており、編集や削除などの操作はできません。\n\nまた、閲覧者が行ったノードの開閉状態は保存されず、リロードすると作成者が共有した初期状態に戻ります。\n\n技術的には、ローカルデータを変更せず、共有用の閲覧モデルを利用することで、通常編集と共有閲覧を安全に分離しています。",
  "📋 画像コピー\n現在表示しているマインドマップを、そのまま画像としてクリップボードへコピーできます。\n・折りたたみ状態を維持\n・透過背景\n・Teams、LINE、Slack、PowerPointなどへそのまま貼り付け可能\n\n📷 全展開保存\nマップ全体を一時的に展開した状態でPNG画像として保存できます。\n・実データは変更しない\n・折りたたみ状態は保存後も維持\n・透過背景\n・資料作成や議事録用途を想定",
  "ドラッグで変更されるのは兄弟ノードの順番だけです。位置情報は保存せず、自動レイアウトのまま使えます。",
  "アウトラインで編集した内容は、そのままマップにも反映されます。別データではなく同じノードを編集しています。",
  "色のキーはそのままに、表示だけを切り替えます。資料向けやノート向けなど、使う場面に合わせられます。",
  "ノードをつかんだ時の浮き上がり、枝の追従、パレットごとの雰囲気などを整えました。",
];

const latestAnnouncement = ANNOUNCEMENT_META.reduce(
  (latest, item) => (item.releaseOrder > (latest?.releaseOrder ?? -1) ? item : latest),
  null
);
const latestAnnouncementRelease = latestAnnouncement?.release || "";
const ANNOUNCEMENT_SEEN_KEY = "mindmap_announcements_seen_date_v1";

export default function MindMapTool() {
  const fileRef = useRef(null);
  const panRef = useRef(null);
  const dragRef = useRef(null);
  const outlineInputRefs = useRef({});
  const anchorRef = useRef(null);
  const didRunTestsRef = useRef(false);
  const [shareState, setShareState] = useState(() =>
    hasSharePayload()
      ? { status: "loading", sourceUrl: window.location.href }
      : { status: "none" }
  );

  const [map, setMap] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalize(JSON.parse(saved)) : starter();
    } catch {
      return starter();
    }
  });
  const [paletteId, setPaletteId] = useState(() => {
    try {
      const saved = localStorage.getItem(PALETTE_STORAGE_KEY);
      return PALETTE_OPTIONS.includes(saved) ? saved : "default";
    } catch {
      return "default";
    }
  });
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
  const [announcementsOpen, setAnnouncementsOpen] = useState(() => {
    if (hasSharePayload()) return false;

    try {
      return (
        latestAnnouncementRelease &&
        localStorage.getItem(ANNOUNCEMENT_SEEN_KEY) !== latestAnnouncementRelease
      );
    } catch {
      return false;
    }
  });
  const [expandedAnnouncements, setExpandedAnnouncements] = useState({});
  const [dragState, setDragState] = useState(null);
  const [imageExporting, setImageExporting] = useState(null);
  const [linkExporting, setLinkExporting] = useState(false);
  const [shareNotice, setShareNotice] = useState(null);

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
    if (shareState.status !== "loading") return undefined;

    let cancelled = false;

    readShareUrl(shareState.sourceUrl)
      .then((shared) => {
        if (cancelled) return;

        setShareState({
          status: "ready",
          sourceUrl: shareState.sourceUrl,
          shareVersion: shared.shareVersion,
          initialMap: shared.map,
          viewMap: cloneSharedMap(shared.map),
          paletteId: shared.paletteId,
        });
        setSelectedId(shared.map.rootId);
        setOutlineOpen(false);
        setToolbarOpen(false);
        setViewport({ x: 220, y: window.innerHeight * 0.5, zoom: 0.9 });
      })
      .catch((error) => {
        if (cancelled) return;
        setShareState({
          status: "error",
          sourceUrl: shareState.sourceUrl,
          message: error.message || "共有リンクを読み込めませんでした。",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [shareState.sourceUrl, shareState.status]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
      // ignore
    }
  }, [map]);

  useEffect(() => {
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, paletteId);
    } catch {
      // ignore
    }
  }, [paletteId]);

  useEffect(() => {
    if (!shareNotice) return undefined;

    const timer = window.setTimeout(() => setShareNotice(null), shareNotice.type === "error" ? 6000 : 3500);
    return () => window.clearTimeout(timer);
  }, [shareNotice]);

  const isSharedView = shareState.status === "ready";
  const isShareRoute = shareState.status !== "none";
  const activeMap = isSharedView ? shareState.viewMap : showMode && showMap ? showMap : map;
  const activePaletteId = isSharedView ? shareState.paletteId : paletteId;
  const activePalette = PALETTES[activePaletteId] || PALETTES.default;
  const tree = useMemo(() => makeTree(activeMap.nodes, activeMap.rootId), [activeMap]);
  const drawn = useMemo(() => layoutMap(tree), [tree]);
  const rows = useMemo(() => outline(activeMap.nodes, activeMap.rootId), [activeMap]);

  const selected = activeMap.nodes[selectedId] || activeMap.nodes[activeMap.rootId] || map.nodes[map.rootId];
  const rawSelectedPos = drawn.positions[selectedId] || drawn.positions[activeMap.rootId];
  const selectedPos = isPoint(rawSelectedPos) ? rawSelectedPos : { x: 0, y: 0 };
  const dragVisual = useMemo(() => {
    if (!dragState?.active || showMode || isSharedView) {
      return { nodeIds: new Set(), dx: 0, dy: 0 };
    }

    const node = map.nodes[dragState.nodeId];
    if (!node) return { nodeIds: new Set(), dx: 0, dy: 0 };

    return {
      nodeIds: new Set([node.id, ...descendants(map.nodes, node.id)]),
      dx: (dragState.currentClientX - dragState.startClientX) / viewport.zoom,
      dy: (dragState.currentClientY - dragState.startClientY) / viewport.zoom,
    };
  }, [dragState, isSharedView, map.nodes, showMode, viewport.zoom]);
  const visualDrawn = useMemo(() => {
    if (!dragState?.active || !dragVisual.nodeIds.size) return drawn;

    const positions = { ...drawn.positions };
    dragVisual.nodeIds.forEach((nodeId) => {
      const pos = positions[nodeId];
      if (!isPoint(pos)) return;
      positions[nodeId] = {
        x: pos.x + dragVisual.dx,
        y: pos.y + dragVisual.dy,
      };
    });

    return { ...drawn, positions };
  }, [dragState, dragVisual, drawn]);
  const dragIndicator = useMemo(() => {
    if (!dragState?.active || showMode || isSharedView) return null;

    const node = map.nodes[dragState.nodeId];
    if (!node || !node.parentId) return null;

    const nodePos = drawn.positions[node.id];
    if (!isPoint(nodePos)) return null;

    const siblings = children(map.nodes, node.parentId).filter((sibling) => sibling.id !== node.id);
    const before = siblings[dragState.targetIndex];
    const after = siblings[dragState.targetIndex - 1];
    const beforePos = before ? drawn.positions[before.id] : null;
    const afterPos = after ? drawn.positions[after.id] : null;

    let y = nodePos.y;
    if (isPoint(beforePos) && isPoint(afterPos)) y = (beforePos.y + afterPos.y) / 2;
    else if (isPoint(beforePos)) y = beforePos.y - 54;
    else if (isPoint(afterPos)) y = afterPos.y + 54;

    return { x: nodePos.x - 12, y };
  }, [dragState, drawn.positions, isSharedView, map.nodes, showMode]);
  const hasNodeDrag = dragState !== null;

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

  const commit = useCallback((updater, nextSelected = selectedId) => {
    setMap((current) => {
      const next = normalize(typeof updater === "function" ? updater(current) : updater);
      setHistory((h) => ({ past: [...h.past.slice(-50), current], future: [] }));
      return next;
    });

    setSelectedId(nextSelected);
  }, [selectedId]);

  function selectNode(nodeId) {
    setSelectedId(nodeId);
    setToolbarOpen(!showMode && !isSharedView);
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

  function updateSharedNode(nodeId, patch) {
    const currentPosition = drawn.positions[nodeId];
    anchorRef.current = currentPosition ? { nodeId, position: currentPosition } : null;

    setShareState((current) => {
      if (current.status !== "ready" || !current.viewMap.nodes[nodeId]) return current;

      return {
        ...current,
        viewMap: {
          ...current.viewMap,
          nodes: {
            ...current.viewMap.nodes,
            [nodeId]: { ...current.viewMap.nodes[nodeId], ...patch },
          },
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

  function focusOutlineInput(nodeId, select = false) {
    window.setTimeout(() => {
      const input = outlineInputRefs.current[nodeId];
      if (!input) return;

      input.focus();
      if (select) {
        input.select();
        return;
      }

      const end = input.value.length;
      input.setSelectionRange(end, end);
    }, 0);
  }

  function updateOutlineText(nodeId, text) {
    setMap((current) => {
      const node = current.nodes[nodeId];
      if (!node) return current;

      return {
        ...current,
        nodes: {
          ...current.nodes,
          [nodeId]: { ...node, text },
        },
      };
    });

    setSelectedId(nodeId);
  }

  function finishOutlineText(nodeId) {
    const text = map.nodes[nodeId]?.text;
    if (text == null || text.trim()) return;
    updateOutlineText(nodeId, "Untitled");
  }

  function addOutlineSiblingAfter(nodeId) {
    const newId = createId();

    commit(
      (current) => {
        const base = current.nodes[nodeId];
        if (!base) return current;

        const parentId = base.parentId || current.rootId;
        const normalizedNodes = normalizeSiblingOrders(current.nodes, parentId);
        const siblings = children(normalizedNodes, parentId);
        const baseIndex = base.parentId ? siblings.findIndex((node) => node.id === nodeId) : siblings.length - 1;
        const insertIndex = Math.max(0, baseIndex + 1);
        const color =
          parentId === current.rootId
            ? COLORS[childCount(normalizedNodes, current.rootId) % COLORS.length]
            : majorColorFor({ ...current, nodes: normalizedNodes }, parentId);
        const newNode = {
          id: newId,
          parentId,
          text: "Untitled",
          order: insertIndex,
          collapsed: false,
          color,
        };
        const orderedIds = [
          ...siblings.slice(0, insertIndex).map((node) => node.id),
          newId,
          ...siblings.slice(insertIndex).map((node) => node.id),
        ];
        const nextNodes = {
          ...normalizedNodes,
          [parentId]: { ...normalizedNodes[parentId], collapsed: false },
          [newId]: newNode,
        };

        orderedIds.forEach((id, index) => {
          nextNodes[id] = { ...nextNodes[id], order: index };
        });

        return { ...current, nodes: nextNodes };
      },
      newId
    );

    focusOutlineInput(newId, true);
  }

  function indentOutlineNode(nodeId) {
    const node = map.nodes[nodeId];
    if (!node || !node.parentId) return;

    commit(
      (current) => {
        const currentNode = current.nodes[nodeId];
        if (!currentNode || !currentNode.parentId) return current;

        const oldParentId = currentNode.parentId;
        const siblings = children(current.nodes, oldParentId);
        const currentIndex = siblings.findIndex((sibling) => sibling.id === nodeId);
        const newParent = siblings[currentIndex - 1];
        if (!newParent) return current;

        const nextNodes = {
          ...current.nodes,
          [newParent.id]: { ...current.nodes[newParent.id], collapsed: false },
          [nodeId]: {
            ...currentNode,
            parentId: newParent.id,
            order: nextOrder(current.nodes, newParent.id),
          },
        };

        return {
          ...current,
          nodes: normalizeSiblingOrders(normalizeSiblingOrders(nextNodes, oldParentId), newParent.id),
        };
      },
      nodeId
    );

    focusOutlineInput(nodeId);
  }

  function outdentOutlineNode(nodeId) {
    const node = map.nodes[nodeId];
    const parent = node?.parentId ? map.nodes[node.parentId] : null;
    if (!node || !parent?.parentId) return;

    commit(
      (current) => {
        const currentNode = current.nodes[nodeId];
        const currentParent = currentNode?.parentId ? current.nodes[currentNode.parentId] : null;
        if (!currentNode || !currentParent?.parentId) return current;

        const oldParentId = currentParent.id;
        const newParentId = currentParent.parentId;
        let nextNodes = {
          ...current.nodes,
          [nodeId]: { ...currentNode, parentId: newParentId },
        };

        nextNodes = normalizeSiblingOrders(nextNodes, oldParentId);

        const siblings = children(nextNodes, newParentId).filter((sibling) => sibling.id !== nodeId);
        const parentIndex = siblings.findIndex((sibling) => sibling.id === oldParentId);
        const insertIndex = parentIndex < 0 ? siblings.length : parentIndex + 1;
        const orderedIds = [
          ...siblings.slice(0, insertIndex).map((sibling) => sibling.id),
          nodeId,
          ...siblings.slice(insertIndex).map((sibling) => sibling.id),
        ];

        orderedIds.forEach((id, index) => {
          nextNodes[id] = { ...nextNodes[id], order: index };
        });

        return { ...current, nodes: nextNodes };
      },
      nodeId
    );

    focusOutlineInput(nodeId);
  }

  function handleOutlineKeyDown(e, nodeId) {
    if ((e.nativeEvent?.isComposing || e.isComposing) && e.key === "Enter") return;

    if (e.key === "Enter") {
      e.preventDefault();
      addOutlineSiblingAfter(nodeId);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) outdentOutlineNode(nodeId);
      else indentOutlineNode(nodeId);
    }
  }

  const siblingDropIndex = useCallback((nodes, parentId, nodeId, clientY) => {
    const mapY = (clientY - viewport.y) / viewport.zoom;
    const siblings = children(nodes, parentId).filter((node) => node.id !== nodeId);

    for (let index = 0; index < siblings.length; index += 1) {
      const pos = drawn.positions[siblings[index].id];
      if (isPoint(pos) && mapY < pos.y) return index;
    }

    return siblings.length;
  }, [drawn.positions, viewport.y, viewport.zoom]);

  const siblingOrderIds = useCallback((nodes, parentId, nodeId, targetIndex) => {
    const list = children(nodes, parentId);
    const moving = list.find((node) => node.id === nodeId);
    if (!moving) return list.map((node) => node.id);

    const withoutMoving = list.filter((node) => node.id !== nodeId);
    const safeIndex = Number.isFinite(targetIndex)
      ? Math.max(0, Math.min(targetIndex, withoutMoving.length))
      : list.findIndex((node) => node.id === nodeId);

    return [
      ...withoutMoving.slice(0, safeIndex).map((node) => node.id),
      moving.id,
      ...withoutMoving.slice(safeIndex).map((node) => node.id),
    ];
  }, []);

  const sameOrder = useCallback((a, b) => {
    return a.length === b.length && a.every((id, index) => id === b[index]);
  }, []);

  const reorderSibling = useCallback((nodeId, parentId, targetIndex) => {
    const node = map.nodes[nodeId];
    if (!node || node.parentId !== parentId) return;

    const currentIds = children(map.nodes, parentId).map((sibling) => sibling.id);
    const nextIds = siblingOrderIds(map.nodes, parentId, nodeId, targetIndex);
    if (sameOrder(currentIds, nextIds)) return;

    commit(
      (current) => {
        const currentNode = current.nodes[nodeId];
        if (!currentNode || currentNode.parentId !== parentId) return current;

        const orderedIds = siblingOrderIds(current.nodes, parentId, nodeId, targetIndex);
        const nextNodes = { ...current.nodes };

        orderedIds.forEach((id, index) => {
          nextNodes[id] = { ...nextNodes[id], order: index };
        });

        return { ...current, nodes: nextNodes };
      },
      nodeId
    );
  }, [commit, map.nodes, sameOrder, siblingOrderIds]);

  function beginNodeDrag(e, nodeId) {
    if (showMode || isSharedView || e.button !== 0) return;

    const node = map.nodes[nodeId];
    if (!node || !node.parentId) return;

    const siblings = children(map.nodes, node.parentId);
    if (siblings.length < 2) return;

    e.preventDefault();
    setPanning(false);
    panRef.current = null;

    const sourceIndex = siblings.findIndex((sibling) => sibling.id === nodeId);
    const nextDrag = {
      nodeId,
      parentId: node.parentId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      currentClientX: e.clientX,
      currentClientY: e.clientY,
      sourceIndex,
      targetIndex: sourceIndex,
      active: false,
    };

    dragRef.current = nextDrag;
    setDragState(nextDrag);
  }

  useEffect(() => {
    if (!hasNodeDrag) return undefined;

    function moveNodeDrag(e) {
      const current = dragRef.current;
      if (!current) return;

      const dx = e.clientX - current.startClientX;
      const dy = e.clientY - current.startClientY;
      const active = current.active || Math.abs(dx) > 5 || Math.abs(dy) > 5;
      const targetIndex = active
        ? siblingDropIndex(map.nodes, current.parentId, current.nodeId, e.clientY)
        : current.targetIndex;

      if (active) {
        e.preventDefault();
        setToolbarOpen(false);
      }

      const nextDrag = {
        ...current,
        currentClientX: e.clientX,
        currentClientY: e.clientY,
        targetIndex,
        active,
      };

      dragRef.current = nextDrag;
      setDragState(nextDrag);
    }

    function stopNodeDrag() {
      const current = dragRef.current;
      dragRef.current = null;
      setDragState(null);

      if (current?.active) {
        reorderSibling(current.nodeId, current.parentId, current.targetIndex);
      }
    }

    window.addEventListener("mousemove", moveNodeDrag);
    window.addEventListener("mouseup", stopNodeDrag);

    return () => {
      window.removeEventListener("mousemove", moveNodeDrag);
      window.removeEventListener("mouseup", stopNodeDrag);
    };
  }, [hasNodeDrag, map.nodes, reorderSibling, siblingDropIndex]);

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

  function closeAnnouncements() {
    setAnnouncementsOpen(false);

    try {
      if (latestAnnouncementRelease) {
        localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, latestAnnouncementRelease);
      }
    } catch {
      // ignore
    }
  }

  function toggleAnnouncement(index) {
    setExpandedAnnouncements((current) => ({
      ...current,
      [index]: !current[index],
    }));
  }

  useEffect(() => {
    function key(e) {
      const target = e.target;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (e.key === "Escape" && announcementsOpen) {
        closeAnnouncements();
        return;
      }

      if (isSharedView) return;

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
  }, [map, selectedId, showMode, history, activeMap, announcementsOpen, isSharedView]);

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

  async function copyCurrentImage() {
    setImageExporting("copy");
    setShareNotice(null);

    try {
      await copyMindMapImage(map, paletteId);
      setShareNotice({ type: "success", message: "現在見えているマップを画像としてコピーしました。" });
    } catch (error) {
      setShareNotice({ type: "error", message: error.message || "画像をコピーできませんでした。" });
    } finally {
      setImageExporting(null);
    }
  }

  async function saveExpandedImage() {
    setImageExporting("save");
    setShareNotice(null);

    try {
      const expandedViewMap = createExpandedMap(map);
      await saveMindMapImage(expandedViewMap, paletteId);
      setShareNotice({
        type: "success",
        message: "全体を展開したPNGを保存しました。元の折りたたみ状態は維持されています。",
      });
    } catch (error) {
      setShareNotice({ type: "error", message: error.message || "画像を保存できませんでした。" });
    } finally {
      setImageExporting(null);
    }
  }

  async function copyShareLink() {
    setLinkExporting(true);
    setShareNotice(null);

    try {
      const url = await createShareUrl(map, paletteId);
      await copyTextToClipboard(url);
      setShareNotice({ type: "success", message: "閲覧専用の共有リンクをコピーしました。" });
    } catch (error) {
      setShareNotice({ type: "error", message: error.message || "共有リンクを作成できませんでした。" });
    } finally {
      setLinkExporting(false);
    }
  }

  async function recopyShareLink() {
    setLinkExporting(true);
    setShareNotice(null);

    try {
      await copyTextToClipboard(shareState.sourceUrl);
      setShareNotice({ type: "success", message: "現在の共有リンクをコピーしました。" });
    } catch (error) {
      setShareNotice({ type: "error", message: error.message || "共有リンクをコピーできませんでした。" });
    } finally {
      setLinkExporting(false);
    }
  }

  function resetSharedViewport() {
    setViewport({ x: 220, y: window.innerHeight * 0.5, zoom: 0.9 });
  }

  return (
    <div className="h-screen w-full overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50 text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#dbeafe_1px,transparent_0)] [background-size:28px_28px] opacity-80" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sky-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-violet-100/60 blur-3xl" />

      {shareState.status === "loading" ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-5">
          <div className="rounded-[28px] border border-white/80 bg-white/90 px-8 py-6 text-center shadow-2xl backdrop-blur-xl">
            <div className="text-sm font-black text-slate-900">共有マップを読み込んでいます</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">少しだけお待ちください。</div>
          </div>
        </div>
      ) : null}

      {shareState.status === "error" ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-5">
          <div className="w-full max-w-md rounded-[28px] border border-rose-100 bg-white/95 p-6 text-center shadow-2xl backdrop-blur-xl">
            <div className="text-base font-black text-slate-950">共有リンクを開けませんでした</div>
            <div className="mt-2 text-sm font-medium leading-6 text-slate-600">{shareState.message}</div>
            <a
              href={shareState.sourceUrl.split("#")[0]}
              className="mt-5 inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-black text-white shadow transition hover:bg-slate-800"
            >
              編集画面を開く
            </a>
          </div>
        </div>
      ) : null}

      {isSharedView ? (
        <header className="absolute left-5 right-5 top-5 z-30 flex items-start justify-between gap-4">
          <div className="rounded-[28px] border border-white/70 bg-white/88 p-3 shadow-xl shadow-slate-200/70 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 font-black text-white shadow-lg">
                M
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-black tracking-tight">MindMap</div>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-700">
                    閲覧専用
                  </span>
                </div>
                <div className="max-w-[420px] truncate text-xs font-semibold text-slate-500">
                  {activeMap.nodes[activeMap.rootId]?.text}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white/88 p-3 shadow-xl shadow-slate-200/70 backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between gap-4 px-1">
              <div>
                <div className="text-xs font-black text-slate-700">共有マップ</div>
                <div className="text-[10px] font-bold text-slate-400">
                  {PALETTES[activePaletteId]?.label || PALETTES.default.label} パレット
                </div>
              </div>
              <div className="text-[10px] font-bold text-slate-400">開閉状態は保存されません</div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button active={outlineOpen} onClick={() => setOutlineOpen((value) => !value)}>
                アウトライン
              </Button>
              <Button disabled={linkExporting} onClick={recopyShareLink}>
                {linkExporting ? "コピー中..." : "🔗 共有リンクをコピー"}
              </Button>
              <Button onClick={resetSharedViewport}>位置リセット</Button>
            </div>
          </div>
        </header>
      ) : !isShareRoute && !showMode ? (
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
            <div className="mb-3 flex justify-end">
              <div className="flex rounded-full border border-slate-200 bg-slate-100/80 p-1">
                {PALETTE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPaletteId(option)}
                    className={
                      (paletteId === option ? "bg-slate-900 text-white shadow-sm " : "text-slate-600 hover:bg-white/70 ") +
                      "rounded-full px-3 py-1 text-xs font-black transition"
                    }
                  >
                    {PALETTES[option].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 pb-3">
              <div className="mr-auto min-w-28 text-right">
                <div className="text-xs font-black text-slate-700">共有</div>
                <div className="text-[10px] font-bold text-slate-400">見えている状態 / 全体資料</div>
              </div>
              <Button disabled={Boolean(imageExporting)} onClick={copyCurrentImage}>
                {imageExporting === "copy" ? "作成中..." : "📋 画像コピー"}
              </Button>
              <Button disabled={Boolean(imageExporting)} onClick={saveExpandedImage}>
                {imageExporting === "save" ? "作成中..." : "📷 全展開保存"}
              </Button>
              <Button disabled={linkExporting} onClick={copyShareLink}>
                {linkExporting ? "作成中..." : "🔗 共有リンク"}
              </Button>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setAnnouncementsOpen(true)}>お知らせ</Button>
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
      ) : !isShareRoute ? (
        <button
          type="button"
          onClick={exitShowMode}
          className="absolute right-5 top-5 z-40 rounded-full border border-white/70 bg-white/85 px-4 py-2 text-sm font-black text-slate-700 shadow-xl backdrop-blur-xl transition hover:bg-white"
        >
          編集に戻る Esc
        </button>
      ) : null}

      {!showMode && outlineOpen && (isSharedView || !isShareRoute) ? (
        <aside className="absolute bottom-5 left-5 top-36 z-30 w-80 overflow-hidden rounded-[28px] border border-white/70 bg-white/88 shadow-xl shadow-slate-200/70 backdrop-blur-xl">
          <div className="border-b border-slate-100 p-4">
            <div className="text-sm font-black">アウトライン</div>
            <div className="text-xs text-slate-500">
              {isSharedView ? "閲覧専用で全体構成を確認" : "説明順を文章で確認"}
            </div>
          </div>

          <div className="h-full overflow-auto p-3 pb-24">
            {rows.map((row) => (
              <div
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className={
                  (selectedId === row.id ? "bg-slate-900 text-white shadow " : "hover:bg-slate-100 ") +
                  "mb-1 flex w-full items-center gap-2 rounded-2xl py-1.5 pr-2 text-left text-xs transition"
                }
                style={{ paddingLeft: 10 + row.depth * 16 }}
              >
                <span className="w-3 shrink-0 text-center text-[10px] font-black opacity-60">{row.collapsed ? "+" : ""}</span>
                {isSharedView ? (
                  <span className="min-w-0 flex-1 truncate py-1 font-bold">{row.text}</span>
                ) : (
                  <input
                    ref={(input) => {
                      if (input) outlineInputRefs.current[row.id] = input;
                      else delete outlineInputRefs.current[row.id];
                    }}
                    value={map.nodes[row.id]?.text ?? row.text}
                    onChange={(e) => updateOutlineText(row.id, e.target.value)}
                    onFocus={() => setSelectedId(row.id)}
                    onBlur={() => finishOutlineText(row.id)}
                    onKeyDown={(e) => handleOutlineKeyDown(e, row.id)}
                    className={
                      (selectedId === row.id
                        ? "text-white placeholder:text-slate-300 "
                        : "text-slate-800 placeholder:text-slate-400 ") +
                      "min-w-0 flex-1 bg-transparent py-1 font-bold outline-none"
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      {!showMode && !isSharedView && !isShareRoute && toolbarOpen && selected ? (
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

      {editingId && !isShareRoute ? (
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

      {announcementsOpen ? (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-5 backdrop-blur-sm"
          onMouseDown={closeAnnouncements}
        >
          <div
            className="max-h-[calc(100vh-40px)] w-full max-w-[640px] overflow-y-auto rounded-[28px] border border-white/80 bg-white p-5 shadow-2xl shadow-slate-400/30"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-black text-slate-950">更新情報</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">最近追加された機能のお知らせです。</div>
              </div>
              <button
                type="button"
                onClick={closeAnnouncements}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                閉じる
              </button>
            </div>

            <div className="grid gap-3">
              {ANNOUNCEMENTS.map((item, index) => {
                const meta = ANNOUNCEMENT_META[index] || {};
                const isNew = meta.release === latestAnnouncementRelease;
                const isExpanded = Boolean(expandedAnnouncements[index]);
                const detail = ANNOUNCEMENT_DETAILS[index];

                return (
                  <button
                    key={item.title}
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleAnnouncement(index)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition duration-150 hover:border-slate-300 hover:bg-white hover:shadow-sm"
                  >
                    <div className="mb-1 flex items-start gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-black text-slate-900">{item.title}</div>
                          <span className="mt-0.5 text-xs font-black text-slate-400">{isExpanded ? "−" : "+"}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">
                          <span>{meta.date}</span>
                          {isNew ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-black leading-none text-sky-700">
                              NEW
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="pl-8 text-sm font-medium leading-6 text-slate-600">{item.body}</div>
                    <div
                      className={
                        (isExpanded ? "mt-3 max-h-[520px] opacity-100 " : "max-h-0 opacity-0 ") +
                        "whitespace-pre-line overflow-hidden pl-8 text-sm font-medium leading-6 text-slate-500 transition-all duration-200"
                      }
                    >
                      {detail}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {shareNotice ? (
        <div
          role="status"
          aria-live="polite"
          className={
            (shareNotice.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800 "
              : "border-emerald-200 bg-emerald-50 text-emerald-800 ") +
            "absolute bottom-5 right-5 z-[60] max-w-md rounded-2xl border px-4 py-3 text-sm font-bold shadow-xl"
          }
        >
          {shareNotice.message}
        </div>
      ) : null}

      {shareState.status === "none" || isSharedView ? (
        <main
          className={(panning || dragState?.active ? "cursor-grabbing" : "cursor-grab") + " relative z-10 h-full w-full"}
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
                {visualDrawn.edges.map((edge, index) => (
                  <AnimatedEdge
                    key={`${edge.from}_${edge.to}_${index}`}
                    edge={edge}
                    index={index}
                    drawn={visualDrawn}
                    activeMap={activeMap}
                    palette={activePalette}
                    showMode={showMode}
                    selectedId={selectedId}
                  />
                ))}
              </AnimatePresence>
            </svg>

            {dragIndicator ? (
              <div
                className="pointer-events-none absolute z-20 h-1 w-44 -translate-y-1/2 rounded-full bg-slate-900/45 shadow-sm ring-2 ring-white/80"
                style={{ left: dragIndicator.x, top: dragIndicator.y }}
              />
            ) : null}

            {Object.keys(visualDrawn.positions).map((nodeId) => {
              const node = activeMap.nodes[nodeId];
              const pos = visualDrawn.positions[nodeId];

              if (!node || !isPoint(pos)) return null;

              const canDragNode =
                !showMode &&
                !isSharedView &&
                Boolean(node.parentId) &&
                children(activeMap.nodes, node.parentId).length > 1;
              const isDraggingNode = dragState?.active && dragState.nodeId === nodeId;
              const isDraggingSubtree = dragVisual.nodeIds.has(nodeId);

              return (
                <Topic
                  key={nodeId}
                  node={node}
                  count={childCount(activeMap.nodes, nodeId)}
                  pos={pos}
                  selected={selectedId === nodeId}
                  hidden={drawn.visibility && drawn.visibility[nodeId] === false}
                  readOnly={showMode || isSharedView}
                  isMajor={node.parentId === activeMap.rootId}
                  focusMode={showMode}
                  focused={selectedId === nodeId}
                  palette={activePalette}
                  draggable={canDragNode}
                  dragging={isDraggingNode}
                  draggingSubtree={isDraggingSubtree}
                  onSelect={selectNode}
                  onEdit={beginEdit}
                  onBeginDrag={beginNodeDrag}
                  onAdd={addChild}
                  onSibling={addSibling}
                  onDelete={removeNode}
                  onToggle={(x) =>
                    isSharedView
                      ? updateSharedNode(x, { collapsed: !activeMap.nodes[x].collapsed })
                      : showMode
                        ? updateShowNode(x, { collapsed: !activeMap.nodes[x].collapsed })
                        : updateNode(x, { collapsed: !map.nodes[x].collapsed })
                  }
                />
              );
            })}
          </div>
        </main>
      ) : null}
    </div>
  );
}
