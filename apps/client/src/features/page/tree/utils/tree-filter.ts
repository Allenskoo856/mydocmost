import { SpaceTreeNode } from '../types';

/**
 * Get all descendant IDs of a node (including the node itself)
 * Uses DFS to traverse the tree
 */
export function getDescendantIds(
  nodeId: string,
  treeData: SpaceTreeNode[]
): Set<string> {
  const descendantIds = new Set<string>();

  const traverse = (nodes: SpaceTreeNode[]) => {
    for (const node of nodes) {
      if (node.id === nodeId) {
        // Found the target node, collect all descendants
        collectDescendants(node);
        return true;
      }
      if (node.children && node.children.length > 0) {
        if (traverse(node.children)) {
          return true;
        }
      }
    }
    return false;
  };

  const collectDescendants = (node: SpaceTreeNode) => {
    descendantIds.add(node.id);
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        collectDescendants(child);
      }
    }
  };

  traverse(treeData);
  return descendantIds;
}

/**
 * Filter tree nodes, excluding specified node IDs
 * Maintains tree structure
 */
export function filterTreeNodes(
  treeData: SpaceTreeNode[],
  excludeIds: Set<string>
): SpaceTreeNode[] {
  return treeData
    .filter((node) => !excludeIds.has(node.id))
    .map((node) => ({
      ...node,
      children: node.children
        ? filterTreeNodes(node.children, excludeIds)
        : [],
    }));
}
