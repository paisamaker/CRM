import mongoose from 'mongoose';
import { DocumentFile, type FileShareLevel, type IDocument } from '../models/Document.js';
import { Project } from '../models/Project.js';
import type { Role } from '../config/permissions.js';
import { ForbiddenError, NotFoundError } from '../utils/AppError.js';

export type FileAction =
  | 'view'
  | 'download'
  | 'upload'
  | 'rename'
  | 'move'
  | 'delete'
  | 'share'
  | 'manage';

const LEVEL_RANK: Record<FileShareLevel, number> = {
  viewer: 1,
  contributor: 2,
  editor: 3,
  manager: 4,
};

/** Resolve ObjectId, populated ref, or string to a stable id string */
function idOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const v = value as { _id?: unknown; id?: unknown };
    if (v._id != null) return String(v._id);
    if (typeof v.id === 'string' || typeof v.id === 'number') return String(v.id);
  }
  return String(value);
}

function levelAllows(level: FileShareLevel, action: FileAction): boolean {
  const rank = LEVEL_RANK[level];
  switch (action) {
    case 'view':
    case 'download':
      return rank >= 1;
    case 'upload':
      return rank >= 2;
    case 'rename':
    case 'move':
      return rank >= 3;
    case 'share':
    case 'manage':
    case 'delete':
      return rank >= 4;
    default:
      return false;
  }
}

export function isFileAdmin(role: Role): boolean {
  return role === 'ceo';
}

/** Managers/finance can help organize non-private org files but not elevate to admin share/delete globally */
export function isOrgFileManager(role: Role): boolean {
  return role === 'ceo' || role === 'manager' || role === 'finance';
}

async function isProjectMember(projectId: string | undefined, userId: string): Promise<boolean> {
  if (!projectId || !mongoose.isValidObjectId(projectId)) return false;
  const project = await Project.findById(projectId).select('owner members').lean();
  if (!project) return false;
  if (String(project.owner) === userId) return true;
  return (project.members || []).some((m) => String(m) === userId);
}

async function collectAncestorShares(doc: IDocument, userId: string): Promise<FileShareLevel | null> {
  let best: FileShareLevel | null = null;
  let currentParent = doc.parentId ? String(doc.parentId) : null;
  const seen = new Set<string>();
  while (currentParent && !seen.has(currentParent)) {
    seen.add(currentParent);
    const parent = await DocumentFile.findById(currentParent)
      .select('shares visibility project parentId trashedAt')
      .lean();
    if (!parent || parent.trashedAt) break;
    const share = (parent.shares || []).find((s) => idOf(s.user) === userId);
    if (share) {
      if (!best || LEVEL_RANK[share.level] > LEVEL_RANK[best]) best = share.level;
    }
    if (parent.visibility === 'project' && parent.project) {
      if (await isProjectMember(idOf(parent.project), userId)) {
        if (!best || LEVEL_RANK.contributor > LEVEL_RANK[best]) best = 'contributor';
      }
    }
    currentParent = parent.parentId ? idOf(parent.parentId) : null;
  }
  return best;
}

export async function getEffectiveAccess(
  doc: IDocument,
  userId: string,
  role: Role
): Promise<{ allowed: boolean; level: FileShareLevel | 'admin' | 'owner' | null }> {
  const ownerId = idOf(doc.owner) || idOf(doc.uploadedBy);
  const uploaderId = idOf(doc.uploadedBy);
  const projectId = idOf(doc.project);

  if (doc.trashedAt && !isFileAdmin(role) && ownerId !== userId && uploaderId !== userId) {
    return { allowed: false, level: null };
  }
  if (isFileAdmin(role)) return { allowed: true, level: 'admin' };
  if (ownerId === userId || uploaderId === userId) {
    return { allowed: true, level: 'owner' };
  }

  // Missing visibility on legacy rows: treat as private unless linked to a project
  const visibility = doc.visibility || (projectId ? 'project' : 'private');

  // Explicit org-wide share: all authenticated staff can view; managers can edit
  if (visibility === 'company') {
    return { allowed: true, level: isOrgFileManager(role) ? 'editor' : 'viewer' };
  }

  if (visibility === 'project' || (projectId && visibility === 'shared')) {
    if (await isProjectMember(projectId || undefined, userId)) {
      return { allowed: true, level: 'contributor' };
    }
  }

  const direct = (doc.shares || []).find((s) => idOf(s.user) === userId);
  if (direct) return { allowed: true, level: direct.level };

  const inherited = await collectAncestorShares(doc, userId);
  if (inherited) return { allowed: true, level: inherited };

  return { allowed: false, level: null };
}

export async function assertFileAccess(
  doc: IDocument | null | undefined,
  userId: string,
  role: Role,
  action: FileAction
): Promise<IDocument> {
  if (!doc) throw new NotFoundError('File not found');
  const access = await getEffectiveAccess(doc, userId, role);
  if (!access.allowed || !access.level) throw new ForbiddenError('You do not have access to this file');

  if (access.level === 'admin' || access.level === 'owner') {
    if (action === 'share' && access.level === 'owner' && !isFileAdmin(role) && !isOrgFileManager(role)) {
      // Owners can share their own files at viewer/contributor
      if (action === 'share') return doc;
    }
    return doc;
  }

  if (!levelAllows(access.level, action)) {
    throw new ForbiddenError(`Permission "${access.level}" cannot perform "${action}"`);
  }
  return doc;
}

export async function buildAccessibleFilesFilter(
  userId: string,
  role: Role,
  opts: { trash?: boolean; starred?: boolean; sharedWithMe?: boolean; myFiles?: boolean } = {}
): Promise<Record<string, unknown>> {
  const trashClause = opts.trash
    ? { trashedAt: { $exists: true, $ne: null } }
    : { $or: [{ trashedAt: null }, { trashedAt: { $exists: false } }] };

  if (isFileAdmin(role) && !opts.myFiles && !opts.sharedWithMe) {
    const filter: Record<string, unknown> = { ...trashClause };
    if (opts.starred) filter.starredBy = userId;
    return filter;
  }

  const projectIds = await Project.find({
    $or: [{ owner: userId }, { members: userId }],
  })
    .select('_id')
    .lean();
  const pids = projectIds.map((p) => p._id);

  const or: Record<string, unknown>[] = [
    { owner: userId },
    { uploadedBy: userId },
    { 'shares.user': userId },
    { visibility: 'company' },
    { visibility: 'project', project: { $in: pids } },
    { project: { $in: pids }, visibility: { $in: ['project', 'shared'] } },
    // Project folders (auto-created) are always project-scoped
    { kind: 'folder', folderType: { $in: ['project_root', 'project_sub'] }, project: { $in: pids } },
  ];

  if (opts.myFiles) {
    return { $and: [trashClause, { $or: [{ owner: userId }, { uploadedBy: userId }] }] };
  }
  if (opts.sharedWithMe) {
    return { $and: [trashClause, { 'shares.user': userId }, { owner: { $ne: userId } }] };
  }

  const filter: Record<string, unknown> = { $and: [trashClause, { $or: or }] };
  if (opts.starred) {
    (filter.$and as Record<string, unknown>[]).push({ starredBy: userId });
  }
  return filter;
}

export async function loadDocument(id: string): Promise<IDocument | null> {
  if (!mongoose.isValidObjectId(id)) return null;
  return DocumentFile.findById(id);
}
