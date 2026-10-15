import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Team } from '../../models/Team.js';
import { Project } from '../../models/Project.js';
import { User } from '../../models/User.js';
import { Task } from '../../models/Task.js';
import { AppError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';

const router = Router();
router.use(authenticate);

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const teamSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional(),
  lead: z.string().optional(),
  memberIds: z.array(z.string()).min(1, 'Please select at least one employee'),
  projectId: z.string().optional().nullable(),
  department: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

/** List all working teams */
router.get(
  '/',
  authorize('teams', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) {
      filter.status = req.query.status;
    } else {
      filter.status = 'active';
    }
    if (req.query.project) {
      filter.project = req.query.project;
    }
    if (req.query.search) {
      filter.name = new RegExp(String(req.query.search).trim(), 'i');
    }

    const teams = await Team.find(filter)
      .populate('lead', 'name email avatar role department designation')
      .populate('members', 'name email avatar role department designation')
      .populate('project', 'name status progress budget client')
      .sort({ updatedAt: -1 })
      .lean();

    // Attach active task count for each team's assigned project
    const enriched = await Promise.all(
      teams.map(async (t) => {
        let taskCount = 0;
        let completedTaskCount = 0;
        if (t.project?._id) {
          taskCount = await Task.countDocuments({ project: t.project._id });
          completedTaskCount = await Task.countDocuments({
            project: t.project._id,
            status: 'done',
          });
        }
        return {
          ...t,
          taskStats: {
            total: taskCount,
            completed: completedTaskCount,
          },
        };
      })
    );

    res.json({ success: true, data: enriched });
  })
);

/** Get single team detail */
router.get(
  '/:id',
  authorize('teams', 'read'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    if (!mongoose.isValidObjectId(id)) throw new NotFoundError('Team not found');

    const team = await Team.findById(id)
      .populate('lead', 'name email avatar role department designation')
      .populate('members', 'name email avatar role department designation')
      .populate('project', 'name status progress budget client startDate endDate')
      .lean();

    if (!team) throw new NotFoundError('Team not found');

    let tasks: any[] = [];
    if (team.project?._id) {
      tasks = await Task.find({ project: team.project._id })
        .populate('assignees', 'name email avatar')
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean();
    }

    res.json({ success: true, data: { ...team, tasks } });
  })
);

/** Create a new working team */
router.post(
  '/',
  authorize('teams', 'create'),
  asyncHandler(async (req, res) => {
    const body = teamSchema.parse(req.body);

    // Validate members
    const uniqueMemberIds = [...new Set(body.memberIds)].filter((id) =>
      mongoose.isValidObjectId(id)
    );
    if (uniqueMemberIds.length === 0) {
      throw new AppError('At least one valid employee is required', 400);
    }

    const memberObjectIds = uniqueMemberIds.map((id) => new mongoose.Types.ObjectId(id));

    // Validate lead if passed
    let leadId: mongoose.Types.ObjectId | undefined;
    if (body.lead && mongoose.isValidObjectId(body.lead)) {
      leadId = new mongoose.Types.ObjectId(body.lead);
      if (!uniqueMemberIds.includes(body.lead)) {
        memberObjectIds.push(leadId);
      }
    }

    // Validate project if passed
    let projectId: mongoose.Types.ObjectId | undefined;
    if (body.projectId && mongoose.isValidObjectId(body.projectId)) {
      projectId = new mongoose.Types.ObjectId(body.projectId);
      const proj = await Project.findById(projectId);
      if (!proj) throw new AppError('Assigned project not found', 400);

      // Sync members to project
      const existingMembers = proj.members.map((m) => String(m));
      const combined = [...new Set([...existingMembers, ...uniqueMemberIds])].map(
        (id) => new mongoose.Types.ObjectId(id)
      );
      proj.members = combined;
      await proj.save();
    }

    const team = await Team.create({
      name: body.name,
      description: body.description,
      lead: leadId,
      members: memberObjectIds,
      project: projectId,
      department: body.department,
      status: body.status || 'active',
      createdBy: req.user!.id,
    });

    const populated = await Team.findById(team._id)
      .populate('lead', 'name email avatar role department designation')
      .populate('members', 'name email avatar role department designation')
      .populate('project', 'name status progress budget client')
      .lean();

    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'Team',
      entityId: team._id.toString(),
      after: populated,
      req,
    });

    res.status(201).json({ success: true, data: populated });
  })
);

/** Update a working team */
router.patch(
  '/:id',
  authorize('teams', 'update'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    if (!mongoose.isValidObjectId(id)) throw new NotFoundError('Team not found');

    const body = teamSchema.partial().parse(req.body);

    const team = await Team.findById(id);
    if (!team) throw new NotFoundError('Team not found');

    const before = team.toObject();

    if (body.name) team.name = body.name;
    if (body.description !== undefined) team.description = body.description;
    if (body.department !== undefined) team.department = body.department;
    if (body.status) team.status = body.status;

    if (body.lead !== undefined) {
      team.lead = body.lead && mongoose.isValidObjectId(body.lead)
        ? new mongoose.Types.ObjectId(body.lead)
        : undefined;
    }

    if (body.memberIds) {
      const unique = [...new Set(body.memberIds)].filter((mId) =>
        mongoose.isValidObjectId(mId)
      );
      team.members = unique.map((mId) => new mongoose.Types.ObjectId(mId));
    }

    if (body.projectId !== undefined) {
      const pId = body.projectId && mongoose.isValidObjectId(body.projectId)
        ? new mongoose.Types.ObjectId(body.projectId)
        : undefined;
      team.project = pId;

      if (pId) {
        // Sync members to project
        const proj = await Project.findById(pId);
        if (proj) {
          const existing = proj.members.map((m) => String(m));
          const currentTeamMembers = team.members.map((m) => String(m));
          proj.members = [...new Set([...existing, ...currentTeamMembers])].map(
            (m) => new mongoose.Types.ObjectId(m)
          );
          await proj.save();
        }
      }
    }

    await team.save();

    const populated = await Team.findById(team._id)
      .populate('lead', 'name email avatar role department designation')
      .populate('members', 'name email avatar role department designation')
      .populate('project', 'name status progress budget client')
      .lean();

    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'Team',
      entityId: team._id.toString(),
      before,
      after: populated,
      req,
    });

    res.json({ success: true, data: populated });
  })
);

/** Delete or archive team */
router.delete(
  '/:id',
  requireRoles('ceo', 'manager'),
  asyncHandler(async (req, res) => {
    const id = paramId(req.params.id);
    if (!mongoose.isValidObjectId(id)) throw new NotFoundError('Team not found');

    const team = await Team.findById(id);
    if (!team) throw new NotFoundError('Team not found');

    const before = team.toObject();
    await Team.findByIdAndDelete(id);

    await writeAudit({
      actor: req.user!.id,
      action: 'delete',
      entity: 'Team',
      entityId: id,
      before,
      req,
    });

    res.json({ success: true, message: 'Team deleted successfully' });
  })
);

export default router;
