import type { ChangesetFile } from '../../../../store/changeset-store';

export type ProposalInboxFilter = 'all' | 'pending' | 'reviewing' | 'accepted' | 'rejected';

interface ProposalFileStatusSummary {
  total: number;
  pending: number;
  reviewing: number;
  accepted: number;
  rejected: number;
}

function normalizeProposalFileStatus(status: ChangesetFile['status']): NonNullable<ChangesetFile['status']> {
  return status ?? 'pending';
}

export function filterProposalFiles(
  files: ChangesetFile[],
  filter: ProposalInboxFilter,
): ChangesetFile[] {
  if (filter === 'all') {
    return files;
  }

  return files.filter((file) => normalizeProposalFileStatus(file.status) === filter);
}

export function getSelectablePendingRecordIds(files: ChangesetFile[]): string[] {
  const pendingRecordIds = new Set<string>();

  for (const file of files) {
    if (normalizeProposalFileStatus(file.status) === 'pending' && file.proposalRecordId) {
      pendingRecordIds.add(file.proposalRecordId);
    }
  }

  return [...pendingRecordIds];
}

export function pruneSelectedProposalRecordIds(
  files: ChangesetFile[],
  selectedRecordIds: string[],
): string[] {
  const selectableIds = new Set(getSelectablePendingRecordIds(files));
  return selectedRecordIds.filter((recordId) => selectableIds.has(recordId));
}

export function getProposalFileStatusSummary(files: ChangesetFile[]): ProposalFileStatusSummary {
  return files.reduce<ProposalFileStatusSummary>((summary, file) => {
    const status = normalizeProposalFileStatus(file.status);
    summary.total += 1;
    summary[status] += 1;
    return summary;
  }, {
    total: 0,
    pending: 0,
    reviewing: 0,
    accepted: 0,
    rejected: 0,
  });
}