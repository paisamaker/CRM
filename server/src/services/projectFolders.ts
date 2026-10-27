import mongoose from 'mongoose';
import { DocumentFile, PROJECT_SUBFOLDERS } from '../models/Document.js';
import { Project } from '../models/Project.js';
import { logger } from '../utils/logger.js';

/**
 * Idempotently ensure a project has a root folder and standard subfolders.
 * Linked by projectFolderKey so renames never create duplicates.
 */
export async function ensureProjectFolders(
  projectId: string,
  projectName: string,
  actorId: string
): Promise<{ rootId: string; created: boolean }> {
  if (!mongoose.isValidObjectId(projectId)) {
    throw new Error('Invalid project id for folder creation');
  }

  const rootKey = `${projectId}:root`;
  let root = await DocumentFile.findOne({ projectFolderKey: rootKey });
  let created = false;

  if (!root) {
    try {
      root = await DocumentFile.create({
        name: projectName || 'Untitled Project',
        kind: 'folder',
        url: '',
        mime: 'inode/directory',
        size: 0,
        folder: 'projects',
        folderType: 'project_root',
        projectFolderKey: rootKey,
        project: projectId,
        linkedModel: 'Project',
        linkedId: projectId,
        owner: actorId,
        uploadedBy: actorId,
        visibility: 'project',
      });
      created = true;
    } catch (err: unknown) {
      // Race: another request created it
      root = await DocumentFile.findOne({ projectFolderKey: rootKey });
      if (!root) {
        logger.error({ err, projectId }, 'Failed to create project root folder');
        throw err;
      }
    }
  } else if (root.name !== projectName && projectName) {
    // Keep association; update display name when project renamed
    root.name = projectName;
    await root.save();
  }

  for (const sub of PROJECT_SUBFOLDERS) {
    const subKey = `${projectId}:sub:${sub}`;
    const existing = await DocumentFile.findOne({ projectFolderKey: subKey }).select('_id');
    if (existing) continue;
    try {
      await DocumentFile.create({
        name: sub,
        kind: 'folder',
        url: '',
        mime: 'inode/directory',
        size: 0,
        folder: 'projects',
        folderType: 'project_sub',
        projectFolderKey: subKey,
        parentId: root._id,
        project: projectId,
        linkedModel: 'Project',
        linkedId: projectId,
        owner: actorId,
        uploadedBy: actorId,
        visibility: 'project',
      });
    } catch (err) {
      logger.warn({ err, projectId, sub }, 'Project subfolder create skipped/failed');
    }
  }

  return { rootId: String(root._id), created };
}

/**
 * Reconcile folders for projects missing a root or standard subfolders.
 * Idempotent — safe to call on boot or via admin action. Does not delete data.
 */
export async function reconcileMissingProjectFolders(limit = 50): Promise<number> {
  const projects = await Project.find({}).select('_id name owner').limit(200).lean();
  let fixed = 0;
  for (const p of projects.slice(0, limit)) {
    const rootKey = `${p._id}:root`;
    const rootExists = await DocumentFile.exists({ projectFolderKey: rootKey });
    const result = await ensureProjectFolders(String(p._id), p.name, String(p.owner));
    if (!rootExists || result.created) fixed += 1;
    else {
      // Still ensure any missing subfolders (ensureProjectFolders is idempotent)
      const expected = PROJECT_SUBFOLDERS.length;
      const subCount = await DocumentFile.countDocuments({
        project: p._id,
        folderType: 'project_sub',
      });
      if (subCount < expected) fixed += 1;
    }
  }
  return fixed;
}
