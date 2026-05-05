import type { FileBuffer } from '../../../store/file-buffer-store';
import {
    isChangesetAwaitingReview,
    isChangesetFileAwaitingReview,
    type Changeset,
} from '../../../store/changeset-store';
import type { FileNode } from '../store/types';
import { sortNodes } from './file-utils';

export interface VirtualExplorerPath {
    path: string;
    source: Extract<FileNode['virtualSource'], 'review-file' | 'draft-file' | 'draft-dir'>;
}

function isUnderRoot(rootPath: string, targetPath: string): boolean {
    return targetPath === rootPath || targetPath.startsWith(`${rootPath}/`);
}

function collectNodePaths(nodes: FileNode[], paths = new Set<string>()): Set<string> {
    for (const node of nodes) {
        paths.add(node.path);
        if (node.children) {
            collectNodePaths(node.children, paths);
        }
    }
    return paths;
}

function toVirtualDirectorySource(
    source: VirtualExplorerPath['source'],
): Extract<FileNode['virtualSource'], 'review-dir' | 'draft-dir'> {
    return source === 'review-file' ? 'review-dir' : 'draft-dir';
}

function isDirectoryVirtualSource(source: VirtualExplorerPath['source']): boolean {
    return source === 'draft-dir';
}

function insertVirtualPath(
    nodes: FileNode[],
    parentPath: string,
    segments: string[],
    source: VirtualExplorerPath['source'],
): FileNode[] {
    if (segments.length === 0) {
        return nodes;
    }

    const [segment, ...rest] = segments;
    const childPath = `${parentPath}/${segment}`;
    const existingIndex = nodes.findIndex((node) => node.path === childPath);
    const isLeaf = rest.length === 0;

    if (existingIndex >= 0) {
        const existingNode = nodes[existingIndex];
        if (isLeaf || existingNode.kind !== 'dir') {
            return nodes;
        }

        const nextChildren = insertVirtualPath(existingNode.children ?? [], childPath, rest, source);
        const nextNodes = [...nodes];
        nextNodes[existingIndex] = {
            ...existingNode,
            children: nextChildren,
        };
        return nextNodes;
    }

    const nextNode: FileNode = isLeaf
        ? isDirectoryVirtualSource(source)
            ? {
                path: childPath,
                name: segment,
                kind: 'dir',
                virtualSource: 'draft-dir',
                children: [],
            }
            : {
                path: childPath,
                name: segment,
                kind: 'file',
                virtualSource: source,
            }
        : {
            path: childPath,
            name: segment,
            kind: 'dir',
            virtualSource: toVirtualDirectorySource(source),
            children: insertVirtualPath([], childPath, rest, source),
        };

    return sortNodes([...nodes, nextNode]);
}

export function collectPendingReviewCreatePaths(
    rootPath: string,
    proposalChangesets: Changeset[],
    approvalChangesets: Changeset[],
): string[] {
    return Array.from(new Set(
        [...proposalChangesets, ...approvalChangesets]
            .filter((changeset) => isChangesetAwaitingReview(changeset.status))
            .flatMap((changeset) => changeset.files)
            .filter((file) => file.changeType === 'create' && isChangesetFileAwaitingReview(file))
            .map((file) => file.filePath)
            .filter((filePath) => isUnderRoot(rootPath, filePath)),
    ));
}

export function collectPendingDraftBufferPaths(
    rootPath: string,
    buffers: Record<string, FileBuffer>,
): string[] {
    return Array.from(new Set(
        Object.values(buffers)
            .filter((buffer) => !buffer.existsOnDisk)
            .map((buffer) => buffer.filePath)
            .filter((filePath) => isUnderRoot(rootPath, filePath)),
    ));
}

export function collectPendingDraftDirectoryPaths(
    rootPath: string,
    draftDirectoryPaths: string[],
): string[] {
    return Array.from(new Set(
        draftDirectoryPaths.filter((path) => isUnderRoot(rootPath, path)),
    )).sort((left, right) => left.localeCompare(right));
}

export function projectExplorerTreeWithVirtualNodes(
    tree: FileNode[],
    rootPath: string,
    virtualPaths: VirtualExplorerPath[],
): FileNode[] {
    const existingPaths = collectNodePaths(tree);
    let projectedTree = tree;

    for (const virtualPath of virtualPaths) {
        const filePath = virtualPath.path;

        if (!isUnderRoot(rootPath, filePath) || existingPaths.has(filePath)) {
            continue;
        }

        const relativePath = filePath.slice(rootPath.length).replace(/^\//, '');
        const segments = relativePath.split('/').filter(Boolean);
        if (segments.length === 0) {
            continue;
        }

        projectedTree = insertVirtualPath(projectedTree, rootPath, segments, virtualPath.source);
        existingPaths.add(filePath);
    }

    return projectedTree;
}

export function projectExplorerTreeWithVirtualReviewNodes(
    tree: FileNode[],
    rootPath: string,
    virtualReviewPaths: string[],
): FileNode[] {
    return projectExplorerTreeWithVirtualNodes(
        tree,
        rootPath,
        virtualReviewPaths.map((path) => ({ path, source: 'review-file' })),
    );
}