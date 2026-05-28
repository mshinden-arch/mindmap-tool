import { PALETTES } from "../constants";
import { isPoint } from "../mindmapUtils";

export default function Topic({
  node,
  count,
  pos,
  selected,
  hidden,
  readOnly,
  isMajor,
  focusMode,
  focused,
  palette,
  draggable,
  dragging,
  draggingSubtree,
  onSelect,
  onEdit,
  onBeginDrag,
  onToggle,
}) {
  if (!node || !isPoint(pos)) return null;

  const isRoot = !node.parentId;
  const activePalette = palette || PALETTES.default;
  const topicChrome = activePalette.topic || PALETTES.default.topic;
  const colorKey = node.color === "pink" ? "rose" : node.color;
  const cls = isRoot
    ? activePalette.major.root
    : isMajor
      ? activePalette.major[colorKey] || activePalette.major.slate
      : activePalette.minor[colorKey] || activePalette.minor.slate;

  const focusRing = activePalette.ring[colorKey] || activePalette.ring.slate;

  const size = isRoot ? "px-10 py-5 text-xl" : isMajor ? "px-9 py-4 text-lg" : "px-8 py-3.5 text-base";
  const nodeOpacity = hidden ? 0 : focusMode ? (focused ? 1 : 0.25) : 1;
  const nodeScale = hidden ? "scale(0.95)" : focusMode && !focused ? "scale(0.98)" : "scale(1)";
  const dragCursor = dragging ? "cursor-grabbing " : draggable ? "cursor-grab " : "";
  const wrapperMotion = draggingSubtree ? "transition-none " : "transition-all duration-500 ease-out ";
  const emphasis = dragging
    ? `ring-4 ${focusRing} scale-[1.06] `
    : (selected && !readOnly) || (focused && readOnly)
      ? `ring-4 ${focusRing} scale-[1.03] `
      : "";
  const liftClass = dragging ? "shadow-2xl " : draggingSubtree ? "shadow-xl " : "";
  const dropShadow = dragging
    ? "drop-shadow(0 26px 32px rgba(15, 23, 42, 0.24))"
    : draggingSubtree
      ? "drop-shadow(0 16px 20px rgba(15, 23, 42, 0.14))"
      : undefined;

  return (
    <div
      className={(hidden ? "pointer-events-none " : "") + "absolute " + wrapperMotion}
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px) ${nodeScale}`,
        opacity: dragging ? Math.min(nodeOpacity, 0.92) : draggingSubtree ? Math.min(nodeOpacity, 0.84) : nodeOpacity,
        zIndex: dragging ? 50 : draggingSubtree ? 40 : "auto",
        filter: dropShadow,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(node.id);
        onBeginDrag?.(e, node.id);
      }}
    >
      <div
        className={
          emphasis +
          cls +
          ` group relative -translate-y-1/2 whitespace-nowrap border ${topicChrome.shape} ${topicChrome.weight} ${topicChrome.shadow} ${topicChrome.hoverShadow} transition-all duration-500 ease-out ` +
          liftClass +
          dragCursor +
          size
        }
      >
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
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute -right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold leading-none text-slate-600 shadow"
          >
            {node.collapsed ? "+" : "−"}
          </button>
        ) : null}

      </div>
    </div>
  );
}
