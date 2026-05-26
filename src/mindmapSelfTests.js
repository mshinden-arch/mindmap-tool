import { isPoint, layoutMap, makeTree, prepareShowMap, starter } from "./mindmapUtils";

export function runSelfTests() {
  const testMap = starter();
  const tree = makeTree(testMap.nodes, testMap.rootId);
  const laidOut = layoutMap(tree);

  console.assert(Boolean(laidOut.positions.root), "root should have a layout position");
  console.assert(
    Object.values(laidOut.positions).every((pos) => isPoint(pos)),
    "all positions should be finite"
  );

  const show = prepareShowMap(testMap);
  console.assert(show.nodes.root.collapsed === true, "show mode should start with root collapsed");
  console.assert(show.nodes.a.collapsed === true, "show mode should start with root children collapsed");
}
