import { childCount, isPoint, layoutMap, makeTree, topicWidth } from "./mindmapUtils";

const EXPORT_SCALE = 2;
const MAX_CANVAS_EDGE = 8192;
const MAX_CANVAS_PIXELS = 32_000_000;
const PADDING = 72;

const defaultMajor = {
  root: { fill: ["#0f172a"], border: "#0f172a", text: "#ffffff" },
  blue: { fill: ["#0284c7", "#1d4ed8"], border: "#7dd3fc", text: "#ffffff" },
  green: { fill: ["#059669", "#0f766e"], border: "#6ee7b7", text: "#ffffff" },
  orange: { fill: ["#f97316", "#c2410c"], border: "#fdba74", text: "#ffffff" },
  rose: { fill: ["#f43f5e", "#be123c"], border: "#fda4af", text: "#ffffff" },
  purple: { fill: ["#7c3aed", "#7e22ce"], border: "#c4b5fd", text: "#ffffff" },
  teal: { fill: ["#0891b2", "#0f766e"], border: "#67e8f9", text: "#ffffff" },
  indigo: { fill: ["#4f46e5", "#1e40af"], border: "#a5b4fc", text: "#ffffff" },
  lime: { fill: ["#65a30d", "#15803d"], border: "#bef264", text: "#ffffff" },
  amber: { fill: ["#f59e0b", "#a16207"], border: "#fcd34d", text: "#ffffff" },
  slate: { fill: ["#475569", "#1e293b"], border: "#cbd5e1", text: "#ffffff" },
};

const defaultMinor = {
  blue: { fill: ["#f0f9ff"], border: "#bae6fd", text: "#0c4a6e" },
  green: { fill: ["#ecfdf5"], border: "#a7f3d0", text: "#064e3b" },
  orange: { fill: ["#fff7ed"], border: "#fed7aa", text: "#7c2d12" },
  rose: { fill: ["#fff1f2"], border: "#fecdd3", text: "#881337" },
  purple: { fill: ["#f5f3ff"], border: "#ddd6fe", text: "#4c1d95" },
  teal: { fill: ["#ecfeff"], border: "#a5f3fc", text: "#134e4a" },
  indigo: { fill: ["#eef2ff"], border: "#c7d2fe", text: "#312e81" },
  lime: { fill: ["#f7fee7"], border: "#d9f99d", text: "#365314" },
  amber: { fill: ["#fffbeb"], border: "#fde68a", text: "#78350f" },
  slate: { fill: ["#ffffff"], border: "#e2e8f0", text: "#0f172a" },
};

const businessMajor = {
  root: { fill: ["#020617", "#0f172a"], border: "#334155", text: "#ffffff" },
  blue: { fill: ["#020617", "#172554"], border: "#1e3a8a", text: "#ffffff" },
  green: { fill: ["#020617", "#042f2e"], border: "#134e4a", text: "#ffffff" },
  orange: { fill: ["#020617", "#292524"], border: "#44403c", text: "#ffffff" },
  rose: { fill: ["#020617", "#4c0519"], border: "#881337", text: "#ffffff" },
  purple: { fill: ["#020617", "#1e1b4b"], border: "#312e81", text: "#ffffff" },
  teal: { fill: ["#020617", "#083344"], border: "#164e63", text: "#ffffff" },
  indigo: { fill: ["#020617", "#1e1b4b"], border: "#312e81", text: "#ffffff" },
  lime: { fill: ["#020617", "#022c22"], border: "#14532d", text: "#ffffff" },
  amber: { fill: ["#020617", "#451a03"], border: "#78350f", text: "#ffffff" },
  slate: { fill: ["#0f172a", "#1e293b"], border: "#334155", text: "#ffffff" },
};

const businessMinor = {
  blue: { fill: ["#f8fafc"], border: "#bfdbfe", text: "#020617" },
  green: { fill: ["#f8fafc"], border: "#99f6e4", text: "#020617" },
  orange: { fill: ["#fafaf9"], border: "#d6d3d1", text: "#020617" },
  rose: { fill: ["#fafaf9"], border: "#fecdd3", text: "#020617" },
  purple: { fill: ["#f8fafc"], border: "#c7d2fe", text: "#020617" },
  teal: { fill: ["#f8fafc"], border: "#a5f3fc", text: "#020617" },
  indigo: { fill: ["#f8fafc"], border: "#c7d2fe", text: "#020617" },
  lime: { fill: ["#fafaf9"], border: "#a7f3d0", text: "#020617" },
  amber: { fill: ["#fafaf9"], border: "#fde68a", text: "#020617" },
  slate: { fill: ["#f8fafc"], border: "#cbd5e1", text: "#020617" },
};

const minimalMajor = Object.fromEntries(
  Object.keys(defaultMajor).map((key) => [
    key,
    {
      fill: ["#ffffff"],
      border: key === "root" || key === "slate" ? "#e2e8f0" : defaultMinor[key]?.border || "#e2e8f0",
      text: "#0f172a",
    },
  ])
);

const minimalMinor = Object.fromEntries(
  Object.keys(defaultMinor).map((key) => [
    key,
    { fill: ["#ffffff"], border: "#e2e8f0", text: "#334155" },
  ])
);

const exportThemes = {
  default: {
    major: defaultMajor,
    minor: defaultMinor,
    radius: 999,
    weight: 900,
    edgeWidth: 4,
    edgeOpacity: 1,
    shadow: { color: "rgba(15, 23, 42, 0.14)", blur: 18, y: 8 },
  },
  vivid: {
    major: defaultMajor,
    minor: defaultMinor,
    radius: 999,
    weight: 900,
    edgeWidth: 4,
    edgeOpacity: 1,
    shadow: { color: "rgba(15, 23, 42, 0.16)", blur: 20, y: 8 },
  },
  business: {
    major: businessMajor,
    minor: businessMinor,
    radius: 16,
    weight: 800,
    edgeWidth: 3,
    edgeOpacity: 0.82,
    shadow: { color: "rgba(15, 23, 42, 0.12)", blur: 13, y: 6 },
  },
  minimal: {
    major: minimalMajor,
    minor: minimalMinor,
    radius: 16,
    weight: 600,
    edgeWidth: 2,
    edgeOpacity: 0.58,
    shadow: { color: "rgba(15, 23, 42, 0.08)", blur: 7, y: 3 },
  },
};

const strokes = {
  default: {
    root: "#0f172a",
    blue: "#0284c7",
    green: "#059669",
    orange: "#ea580c",
    rose: "#e11d48",
    purple: "#7c3aed",
    teal: "#0891b2",
    indigo: "#4f46e5",
    lime: "#65a30d",
    amber: "#d97706",
    slate: "#64748b",
  },
  business: {
    root: "#020617",
    blue: "#334155",
    green: "#315b63",
    orange: "#6b5f4f",
    rose: "#654657",
    purple: "#3f4668",
    teal: "#2f6268",
    indigo: "#394668",
    lime: "#52614a",
    amber: "#6b5d3d",
    slate: "#475569",
  },
  minimal: {
    root: "#cbd5e1",
    blue: "#bfdbfe",
    green: "#bbf7d0",
    orange: "#fed7aa",
    rose: "#fecdd3",
    purple: "#ddd6fe",
    teal: "#99f6e4",
    indigo: "#c7d2fe",
    lime: "#d9f99d",
    amber: "#fde68a",
    slate: "#e2e8f0",
  },
};

strokes.vivid = strokes.default;

function colorKey(color) {
  return color === "pink" ? "rose" : color || "slate";
}

function nodeMetrics(node, isMajor) {
  const isRoot = !node.parentId;
  return {
    width: topicWidth(node),
    height: isRoot ? 68 : isMajor ? 60 : 52,
    fontSize: isRoot ? 20 : isMajor ? 18 : 16,
  };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, safeRadius);
}

function nodeStyle(theme, node, isMajor) {
  const key = colorKey(node.color);
  if (!node.parentId) return theme.major.root;
  if (isMajor) return theme.major[key] || theme.major.slate;
  return theme.minor[key] || theme.minor.slate;
}

function paintEdge(ctx, edge, drawn, map, theme, paletteId) {
  const from = drawn.positions[edge.from];
  const to = drawn.positions[edge.to];
  if (!isPoint(from) || !isPoint(to) || edge.visible === false) return;

  const startX = from.x + topicWidth(map.nodes[edge.from]) + 18;
  const endX = to.x - 20;
  const dx = Math.max(80, endX - startX);
  const key = colorKey(edge.color);
  const paletteStrokes = strokes[paletteId] || strokes.default;

  ctx.save();
  ctx.globalAlpha = theme.edgeOpacity;
  ctx.strokeStyle = paletteStrokes[key] || paletteStrokes.slate;
  ctx.lineWidth = theme.edgeWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(startX, from.y);
  ctx.bezierCurveTo(startX + dx * 0.5, from.y, endX - dx * 0.5, to.y, endX, to.y);
  ctx.stroke();
  ctx.restore();
}

function paintNode(ctx, node, pos, map, theme) {
  const isMajor = node.parentId === map.rootId;
  const metrics = nodeMetrics(node, isMajor);
  const style = nodeStyle(theme, node, isMajor);
  const top = pos.y - metrics.height / 2;

  ctx.save();
  ctx.shadowColor = theme.shadow.color;
  ctx.shadowBlur = theme.shadow.blur;
  ctx.shadowOffsetY = theme.shadow.y;

  roundedRect(ctx, pos.x, top, metrics.width, metrics.height, theme.radius);
  if (style.fill.length > 1) {
    const gradient = ctx.createLinearGradient(pos.x, 0, pos.x + metrics.width, 0);
    gradient.addColorStop(0, style.fill[0]);
    gradient.addColorStop(1, style.fill[1]);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = style.fill[0];
  }
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1;
  ctx.strokeStyle = style.border;
  ctx.stroke();

  const text = String(node.text || "無題").replace(/\s+/g, " ");
  let fontSize = metrics.fontSize;
  const horizontalPadding = !node.parentId ? 80 : isMajor ? 72 : 64;
  const maxTextWidth = metrics.width - horizontalPadding;

  ctx.fillStyle = style.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  do {
    ctx.font = `${theme.weight} ${fontSize}px "Yu Gothic", "Hiragino Sans", Meiryo, sans-serif`;
    if (ctx.measureText(text).width <= maxTextWidth || fontSize <= 11) break;
    fontSize -= 1;
  } while (fontSize > 10);
  ctx.fillText(text, pos.x + metrics.width / 2, pos.y);
  ctx.restore();

  if (childCount(map.nodes, node.id) > 0) {
    const toggleX = pos.x + metrics.width;
    const toggleY = pos.y;

    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.12)";
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(toggleX, toggleY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#475569";
    ctx.font = '700 14px "Yu Gothic", "Hiragino Sans", Meiryo, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.collapsed ? "+" : "−", toggleX, toggleY - 0.5);
    ctx.restore();
  }
}

function canvasScale(width, height) {
  return Math.min(
    EXPORT_SCALE,
    MAX_CANVAS_EDGE / width,
    MAX_CANVAS_EDGE / height,
    Math.sqrt(MAX_CANVAS_PIXELS / (width * height))
  );
}

export function renderMindMapToCanvas(map, paletteId = "default") {
  const tree = makeTree(map.nodes, map.rootId);
  const drawn = layoutMap(tree);
  const visibleNodeIds = Object.keys(drawn.positions).filter(
    (nodeId) => drawn.visibility[nodeId] !== false && map.nodes[nodeId]
  );

  if (!visibleNodeIds.length) {
    throw new Error("画像にできるマインドマップがありません。");
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  visibleNodeIds.forEach((nodeId) => {
    const node = map.nodes[nodeId];
    const pos = drawn.positions[nodeId];
    const metrics = nodeMetrics(node, node.parentId === map.rootId);
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y - metrics.height / 2);
    maxX = Math.max(maxX, pos.x + metrics.width + 18);
    maxY = Math.max(maxY, pos.y + metrics.height / 2);
  });

  const width = Math.max(1, Math.ceil(maxX - minX + PADDING * 2));
  const height = Math.max(1, Math.ceil(maxY - minY + PADDING * 2));
  const scale = canvasScale(width, height);

  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("マインドマップが大きすぎて画像を作成できませんでした。");
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("このブラウザでは画像を作成できません。");
  }

  ctx.scale(scale, scale);
  ctx.translate(PADDING - minX, PADDING - minY);

  const theme = exportThemes[paletteId] || exportThemes.default;
  drawn.edges.forEach((edge) => paintEdge(ctx, edge, drawn, map, theme, paletteId));
  visibleNodeIds.forEach((nodeId) => paintNode(ctx, map.nodes[nodeId], drawn.positions[nodeId], map, theme));

  return canvas;
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG画像を作成できませんでした。"));
    }, "image/png");
  });
}

export async function copyMindMapImage(map, paletteId) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("このブラウザは画像のクリップボードコピーに対応していません。");
  }

  const canvas = renderMindMapToCanvas(map, paletteId);
  const blobPromise = canvasToPngBlob(canvas);

  try {
    const item = new ClipboardItem({ "image/png": blobPromise });
    await navigator.clipboard.write([item]);
  } catch (error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      throw new Error(
        "クリップボードへのアクセスが許可されませんでした。ブラウザの権限をご確認ください。",
        { cause: error }
      );
    }
    throw new Error("画像をコピーできませんでした。別の対応ブラウザでもお試しください。", {
      cause: error,
    });
  }
}

function imageFileName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `mindmap-full-${date}-${time}.png`;
}

export async function saveMindMapImage(map, paletteId) {
  const canvas = renderMindMapToCanvas(map, paletteId);
  const blob = await canvasToPngBlob(canvas);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = imageFileName();
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
