import { GRADIENT, SOFT } from "../constants";
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
  onSelect,
  onEdit,
  onToggle,
}) {
  if (!node || !isPoint(pos)) return null;

  const isRoot = !node.parentId;
  const cls = isRoot
    ? GRADIENT.root
    : isMajor
      ? GRADIENT[node.color] || GRADIENT.gray
      : SOFT[node.color] || SOFT.gray;

  const focusRing =
    node.color === "root"
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

  const size = isRoot ? "px-10 py-5 text-xl" : isMajor ? "px-9 py-4 text-lg" : "px-8 py-3.5 text-base";
  const nodeOpacity = hidden ? 0 : focusMode ? (focused ? 1 : 0.25) : 1;
  const nodeScale = hidden ? "scale(0.95)" : focusMode && !focused ? "scale(0.98)" : "scale(1)";

  return (
    <div
      className={(hidden ? "pointer-events-none " : "") + "absolute transition-all duration-500 ease-out"}
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px) ${nodeScale}`,
        opacity: nodeOpacity,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      <div
        className={
          ((selected && !readOnly) || (focused && readOnly) ? `ring-4 ${focusRing} scale-[1.03] ` : "") +
          cls +
          " group relative -translate-y-1/2 whitespace-nowrap rounded-full border font-black shadow-lg transition-all duration-500 ease-out hover:shadow-xl " +
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
            className="absolute -right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold leading-none text-slate-600 shadow"
          >
            {node.collapsed ? "+" : "−"}
          </button>
        ) : null}

      </div>
    </div>
  );
}
