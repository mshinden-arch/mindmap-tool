import { COLORS, NEWLINE } from "./constants";

export function createId() {
  return "n_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export function isPoint(pos) {
  return pos && Number.isFinite(pos.x) && Number.isFinite(pos.y);
}

export function starter() {
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

export function children(nodes, parentId) {
  if (!nodes || !parentId) return [];
  return Object.values(nodes)
    .filter((node) => node && node.parentId === parentId)
    .sort((a, b) => {
      const ao = Number.isFinite(a.order) ? a.order : 0;
      const bo = Number.isFinite(b.order) ? b.order : 0;
      if (ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id));
    });
}

export function childCount(nodes, parentId) {
  return children(nodes, parentId).length;
}

export function normalize(input) {
  if (!input || !input.rootId || !input.nodes || !input.nodes[input.rootId]) return starter();

  const nodes = {};
  Object.values(input.nodes).forEach((raw, index) => {
    if (!raw || !raw.id) return;
    nodes[raw.id] = {
      id: raw.id,
      parentId: raw.parentId == null ? null : raw.parentId,
      text: String(raw.text || "無題"),
      order: Number.isFinite(raw.order) ? raw.order : index,
      collapsed: Boolean(raw.collapsed),
      color: raw.color || (raw.parentId ? COLORS[index % COLORS.length] : "root"),
    };
  });

  if (!nodes[input.rootId]) return starter();
  return { rootId: input.rootId, nodes };
}

export function descendants(nodes, nodeId) {
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

export function majorColorFor(map, nodeId) {
  let cursor = map.nodes[nodeId];
  if (!cursor) return "blue";

  while (cursor.parentId && cursor.parentId !== map.rootId) {
    cursor = map.nodes[cursor.parentId];
    if (!cursor) return "blue";
  }

  if (cursor && cursor.parentId === map.rootId) return cursor.color;
  return COLORS[childCount(map.nodes, map.rootId) % COLORS.length];
}

export function makeTree(nodes, rootId) {
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

export function topicWidth(node) {
  if (!node) return 160;

  const text = String(node.text || "");
  const hasWideChars = /[\u3000-\u9fff\u3040-\u30ff]/.test(text);
  const charWidth = hasWideChars ? 21 : 13;
  const padding = node.parentId ? 70 : 90;

  return Math.max(node.parentId ? 190 : 260, text.length * charWidth + padding);
}

export function layoutMap(tree) {
  const positions = {};
  const visibility = {};
  const edges = [];

  if (!tree) return { positions, visibility, edges };

  const xGap = 160;
  const yGap = 120;

  function visibleChildren(node) {
    if (!node || node.collapsed) return [];
    return [...(node.children || [])].sort((a, b) => {
      const ao = Number.isFinite(a.order) ? a.order : 0;
      const bo = Number.isFinite(b.order) ? b.order : 0;
      if (ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  function subtreeHeight(node) {
    const kids = visibleChildren(node);
    if (!kids.length) return yGap;
    return Math.max(yGap, kids.reduce((sum, child) => sum + subtreeHeight(child), 0));
  }

  function placeHidden(node, x, y, parentId = null) {
    if (!node || !node.id) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    positions[node.id] = { x, y };
    visibility[node.id] = false;

    if (parentId) {
      edges.push({ from: parentId, to: node.id, color: node.color, visible: false });
    }

    const hiddenChildren = [...(node.children || [])].sort((a, b) => {
      const ao = Number.isFinite(a.order) ? a.order : 0;
      const bo = Number.isFinite(b.order) ? b.order : 0;
      if (ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id));
    });

    hiddenChildren.forEach((child, index) => {
      placeHidden(
        child,
        x + topicWidth(node) + xGap,
        y + (index - (hiddenChildren.length - 1) / 2) * 18,
        node.id
      );
    });
  }

  function place(node, x, y) {
    if (!node || !node.id) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

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
      const allChildren = [...(node.children || [])].sort((a, b) => {
        const ao = Number.isFinite(a.order) ? a.order : 0;
        const bo = Number.isFinite(b.order) ? b.order : 0;
        if (ao !== bo) return ao - bo;
        return String(a.id).localeCompare(String(b.id));
      });

      allChildren.forEach((child, index) => {
        placeHidden(
          child,
          x + topicWidth(node) + xGap,
          y + (index - (allChildren.length - 1) / 2) * 18,
          node.id
        );
      });
    }
  }

  place(tree, 0, 0);

  return { positions, visibility, edges };
}

export function outline(nodes, rootId) {
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

export function prepareShowMap(inputMap) {
  const nextNodes = {};

  Object.values(inputMap.nodes).forEach((node) => {
    const isRoot = node.id === inputMap.rootId;
    const isRootChild = node.parentId === inputMap.rootId;
    nextNodes[node.id] = {
      ...node,
      collapsed: isRoot || isRootChild ? true : node.collapsed,
    };
  });

  return { ...inputMap, nodes: nextNodes };
}

export function createExpandedMap(inputMap) {
  const nextNodes = {};

  Object.values(inputMap.nodes).forEach((node) => {
    nextNodes[node.id] = {
      ...node,
      collapsed: false,
    };
  });

  return { ...inputMap, nodes: nextNodes };
}

export function markdown(nodes, rootId) {
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
