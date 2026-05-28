import { motion } from "framer-motion";
import { PALETTES } from "../constants";
import { isPoint, topicWidth } from "../mindmapUtils";

export default function AnimatedEdge({ edge, index, drawn, activeMap, palette, showMode, selectedId }) {
  const a = drawn.positions[edge.from];
  const b = drawn.positions[edge.to];

  if (!isPoint(a) || !isPoint(b)) return null;

  const startX = a.x + topicWidth(activeMap.nodes[edge.from]) + 18;
  const endX = b.x - 20;
  const dx = Math.max(80, endX - startX);
  const c1x = startX + dx * 0.5;
  const c2x = endX - dx * 0.5;
  const activePalette = palette || PALETTES.default;
  const colorKey = edge.color === "pink" ? "rose" : edge.color;
  const color = activePalette.stroke[colorKey] || activePalette.stroke.slate;
  const edgeFocus = !showMode || edge.to === selectedId || edge.from === selectedId;
  const baseOpacity = edge.visible === false ? 0 : showMode ? (edgeFocus ? 1 : 0.15) : 1;
  const edgeOpacity = baseOpacity * (activePalette.edgeOpacity ?? 1);
  const d = `M ${startX} ${a.y} C ${c1x} ${a.y}, ${c2x} ${b.y}, ${endX} ${b.y}`;

  return (
    <motion.path
      key={`${edge.from}_${edge.to}_${index}`}
      pointerEvents="none"
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={activePalette.edgeWidth || 4}
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
