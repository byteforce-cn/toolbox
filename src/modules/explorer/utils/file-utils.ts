/**
 * File path and tree utilities for the Explorer module.
 */

import type { FileNode } from '../store/types';

/** Get the basename of a path. */
export function basename(path: string): string {
    return path.split('/').pop() ?? path;
}

/** Get the directory portion of a path. */
export function dirname(path: string): string {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '/';
}

/** Join path segments. */
export function joinPath(...segments: string[]): string {
    return segments
        .map((s) => s.replace(/\/+$/, ''))
        .filter(Boolean)
        .join('/');
}

/** Sort file nodes: directories first, then alphabetically. */
export function sortNodes(nodes: FileNode[]): FileNode[] {
    return [...nodes].sort((a, b) => {
        if (a.kind === 'dir' && b.kind === 'file') return -1;
        if (a.kind === 'file' && b.kind === 'dir') return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

/** Find a node in the tree by path (recursive). */
export function findNode(nodes: FileNode[], path: string): FileNode | null {
    for (const node of nodes) {
        if (node.path === path) return node;
        if (node.children) {
            const found = findNode(node.children, path);
            if (found) return found;
        }
    }
    return null;
}

/** Update a node in the tree by path (returns new tree). */
export function updateNode(
    nodes: FileNode[],
    path: string,
    updater: (node: FileNode) => FileNode,
): FileNode[] {
    return nodes.map((node) => {
        if (node.path === path) {
            return updater(node);
        }
        if (node.children) {
            return { ...node, children: updateNode(node.children, path, updater) };
        }
        return node;
    });
}

/** Flatten tree to an ordered array of visible nodes (for keyboard nav). */
export function flattenVisible(nodes: FileNode[], expandedPaths: Set<string>): FileNode[] {
    const result: FileNode[] = [];
    for (const node of nodes) {
        result.push(node);
        if (node.kind === 'dir' && expandedPaths.has(node.path) && node.children) {
            result.push(...flattenVisible(node.children, expandedPaths));
        }
    }
    return result;
}
