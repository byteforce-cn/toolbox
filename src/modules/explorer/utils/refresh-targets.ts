import type { FileNode } from '../store/types';
import { dirname, findNode } from './file-utils';

interface BatchRefreshOptions {
    maxTargets?: number;
    siblingFoldThreshold?: number;
    structural?: boolean;
}

function isSameOrDescendantPath(path: string, candidate: string): boolean {
    return path === candidate || path.startsWith(`${candidate}/`);
}

function getPathDepth(path: string): number {
    return path.split('/').filter(Boolean).length;
}

function resolveRefreshTarget(path: string, rootPath: string, tree: FileNode[]): string {
    if (path === rootPath) {
        return rootPath;
    }

    const node = findNode(tree, path);
    if (node?.kind === 'dir') {
        return path;
    }

    let currentPath = dirname(path);
    while (isSameOrDescendantPath(currentPath, rootPath)) {
        if (currentPath === rootPath) {
            return rootPath;
        }

        const currentNode = findNode(tree, currentPath);
        if (currentNode?.kind === 'dir') {
            return currentPath;
        }

        currentPath = dirname(currentPath);
    }

    return rootPath;
}

function collapseDescendantTargets(targets: string[], rootPath: string): string[] {
    if (targets.includes(rootPath)) {
        return [rootPath];
    }

    const collapsedTargets = Array.from(new Set(targets))
        .sort((left, right) => left.length - right.length || left.localeCompare(right))
        .filter((target, index, allTargets) => !allTargets.slice(0, index).some((candidate) => isSameOrDescendantPath(target, candidate)));

    return collapsedTargets.sort((left, right) => left.localeCompare(right));
}

function elevateStructuralTargets(targets: string[], rootPath: string): string[] {
    return targets.map((target) => (target === rootPath ? rootPath : dirname(target)));
}

function foldSiblingTargets(
    targets: string[],
    rootPath: string,
    siblingFoldThreshold: number,
): string[] {
    let nextTargets = collapseDescendantTargets(targets, rootPath);

    while (true) {
        const groups = new Map<string, string[]>();
        for (const target of nextTargets) {
            const parentPath = dirname(target);
            if (!isSameOrDescendantPath(parentPath, rootPath)) {
                continue;
            }

            const siblings = groups.get(parentPath) ?? [];
            siblings.push(target);
            groups.set(parentPath, siblings);
        }

        const promotedParents = new Set<string>();
        const consumedTargets = new Set<string>();

        for (const [parentPath, siblings] of groups) {
            if (siblings.length < siblingFoldThreshold) {
                continue;
            }

            promotedParents.add(parentPath);
            for (const sibling of siblings) {
                consumedTargets.add(sibling);
            }
        }

        if (promotedParents.size === 0) {
            return nextTargets;
        }

        nextTargets = collapseDescendantTargets(
            [
                ...nextTargets.filter((target) => !consumedTargets.has(target)),
                ...promotedParents,
            ],
            rootPath,
        );
    }
}

function capRefreshTargets(targets: string[], rootPath: string, maxTargets: number): string[] {
    let nextTargets = collapseDescendantTargets(targets, rootPath);

    while (nextTargets.length > maxTargets) {
        const deepestTarget = [...nextTargets]
            .sort((left, right) => getPathDepth(right) - getPathDepth(left) || right.length - left.length)[0];

        if (!deepestTarget || deepestTarget === rootPath) {
            return [rootPath];
        }

        const promotedTarget = dirname(deepestTarget);
        nextTargets = foldSiblingTargets(
            [
                ...nextTargets.filter((target) => target !== deepestTarget),
                isSameOrDescendantPath(promotedTarget, rootPath) ? promotedTarget : rootPath,
            ],
            rootPath,
            2,
        );

        if (nextTargets.includes(rootPath)) {
            return [rootPath];
        }
    }

    return nextTargets;
}

export function batchRefreshTargets(
    paths: string[],
    rootPath: string,
    tree: FileNode[],
    options?: BatchRefreshOptions,
): string[] {
    const structural = options?.structural ?? false;
    const maxTargets = options?.maxTargets ?? (structural ? 3 : 4);
    const siblingFoldThreshold = options?.siblingFoldThreshold ?? 2;

    const resolvedTargets = paths.map((path) => resolveRefreshTarget(path, rootPath, tree));
    const normalizedTargets = structural ? elevateStructuralTargets(resolvedTargets, rootPath) : resolvedTargets;
    const foldedTargets = foldSiblingTargets(normalizedTargets, rootPath, siblingFoldThreshold);
    return capRefreshTargets(foldedTargets, rootPath, maxTargets);
}