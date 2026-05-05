export interface ExplorerGitDecorationCounts {
    gitModifiedCount: number;
    gitUntrackedCount: number;
    gitDeletedCount: number;
    gitRenamedCount: number;
    gitConflictedCount: number;
    gitStagedCount: number;
    gitUnstagedCount: number;
}

export interface ExplorerDecorationBadge {
    key: string;
    label: string;
    title: string;
    className: string;
}

function buildStatusBadge(
    key: string,
    prefix: string,
    count: number,
    singleTitle: string,
    pluralTitle: string,
    className: string,
): ExplorerDecorationBadge | null {
    if (count <= 0) {
        return null;
    }

    return {
        key,
        label: count > 1 ? `${prefix}${count}` : prefix,
        title: count > 1 ? `${count} ${pluralTitle}` : singleTitle,
        className,
    };
}

function buildScopeBadge(counts: ExplorerGitDecorationCounts): ExplorerDecorationBadge | null {
    const { gitStagedCount, gitUnstagedCount } = counts;

    if (gitStagedCount > 0 && gitUnstagedCount > 0) {
        return {
            key: 'git-scope-mixed',
            label: 'S/W',
            title: `存在已暂存与未暂存 Git 变更（已暂存 ${gitStagedCount}，未暂存 ${gitUnstagedCount}）`,
            className: 'border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-300',
        };
    }

    if (gitStagedCount > 0) {
        return {
            key: 'git-scope-staged',
            label: gitStagedCount > 1 ? `S${gitStagedCount}` : 'S',
            title: gitStagedCount > 1 ? `${gitStagedCount} 个文件存在已暂存变更` : '存在已暂存变更',
            className: 'border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-300',
        };
    }

    if (gitUnstagedCount > 0) {
        return {
            key: 'git-scope-unstaged',
            label: gitUnstagedCount > 1 ? `W${gitUnstagedCount}` : 'W',
            title: gitUnstagedCount > 1 ? `${gitUnstagedCount} 个文件存在未暂存 Git 变更` : '存在未暂存 Git 变更',
            className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
        };
    }

    return null;
}

export function buildGitDecorationBadges(counts: ExplorerGitDecorationCounts): ExplorerDecorationBadge[] {
    const primaryStatusBadge =
        buildStatusBadge(
            'git-conflicted',
            '!',
            counts.gitConflictedCount,
            '存在 Git 冲突',
            '个文件存在 Git 冲突',
            'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
        )
        ?? buildStatusBadge(
            'git-deleted',
            'D',
            counts.gitDeletedCount,
            '文件已删除',
            '个文件已删除',
            'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
        )
        ?? buildStatusBadge(
            'git-untracked',
            'U',
            counts.gitUntrackedCount,
            '未跟踪文件',
            '个未跟踪文件',
            'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        )
        ?? buildStatusBadge(
            'git-renamed',
            'R',
            counts.gitRenamedCount,
            '文件被重命名',
            '个文件被重命名',
            'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
        )
        ?? buildStatusBadge(
            'git-modified',
            'M',
            counts.gitModifiedCount,
            '文件已修改',
            '个文件已修改',
            'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
        );

    const scopeBadge = buildScopeBadge(counts);

    return [primaryStatusBadge, scopeBadge].filter((badge): badge is ExplorerDecorationBadge => badge !== null);
}