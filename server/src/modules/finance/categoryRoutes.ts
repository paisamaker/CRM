import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  FinanceCategory,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
} from '../../models/FinanceCategory.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';

const router = Router();
router.use(authenticate);

// Seed defaults; also upsert any newly added defaults (e.g. Salary)
async function ensureDefaultCategories() {
  const defaults = [
    ...DEFAULT_INCOME_CATEGORIES.map((name) => ({
      name,
      type: 'income' as const,
      isDefault: true,
      isActive: true,
    })),
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
      name,
      type: 'expense' as const,
      isDefault: true,
      isActive: true,
    })),
  ];

  await Promise.all(
    defaults.map((cat) =>
      FinanceCategory.updateOne(
        { type: cat.type, name: cat.name },
        { $setOnInsert: cat },
        { upsert: true }
      ).catch(() => null)
    )
  );
}

// GET /api/v1/finance/categories
router.get(
  '/',
  authorize('transactions', 'read'),
  asyncHandler(async (req, res) => {
    await ensureDefaultCategories();
    const filter: Record<string, unknown> = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.active !== undefined) filter.isActive = req.query.active === 'true';

    const categories = await FinanceCategory.find(filter)
      .sort({ isDefault: -1, name: 1 })
      .lean();

    const income = categories
      .filter((c) => c.type === 'income' && c.isActive)
      .map((c) => c.name);
    const expense = categories
      .filter((c) => c.type === 'expense' && c.isActive)
      .map((c) => c.name);

    res.json({
      success: true,
      data: {
        items: categories,
        income: Array.from(new Set([...DEFAULT_INCOME_CATEGORIES, ...income])),
        expense: Array.from(new Set([...DEFAULT_EXPENSE_CATEGORIES, ...expense])),
      },
    });
  })
);

// POST /api/v1/finance/categories (CEO / Finance)
router.post(
  '/',
  authorize('transactions', 'create'),
  asyncHandler(async (req, res) => {
    if (!['ceo', 'finance'].includes(req.user!.role)) {
      throw new ForbiddenError('Only CEO and Finance can create custom categories');
    }

    const body = z
      .object({
        name: z.string().min(2).max(60).trim(),
        type: z.enum(['income', 'expense']),
      })
      .parse(req.body);

    const existing = await FinanceCategory.findOne({
      name: { $regex: new RegExp(`^${body.name.trim()}$`, 'i') },
      type: body.type,
    });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        await existing.save();
        return res.json({ success: true, data: existing });
      }
      throw new AppError('A category with this name already exists', 400);
    }

    const category = await FinanceCategory.create({
      name: body.name.trim(),
      type: body.type,
      isDefault: false,
      isActive: true,
      createdBy: req.user!.id,
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'FinanceCategory',
      entityId: category._id.toString(),
      after: category,
      req,
    });

    res.status(201).json({ success: true, data: category });
  })
);

// PATCH /api/v1/finance/categories/:id
router.patch(
  '/:id',
  authorize('transactions', 'update'),
  asyncHandler(async (req, res) => {
    if (!['ceo', 'finance'].includes(req.user!.role)) {
      throw new ForbiddenError('Only CEO and Finance can update categories');
    }

    const body = z
      .object({
        name: z.string().min(2).max(60).trim().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);

    const category = await FinanceCategory.findById(req.params.id);
    if (!category) throw new NotFoundError('Category not found');

    if (body.name && body.name !== category.name) {
      category.name = body.name;
    }
    if (body.isActive !== undefined) {
      category.isActive = body.isActive;
    }

    await category.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'FinanceCategory',
      entityId: category._id.toString(),
      after: category,
      req,
    });

    res.json({ success: true, data: category });
  })
);

// DELETE /api/v1/finance/categories/:id
router.delete(
  '/:id',
  authorize('transactions', 'delete'),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ceo') {
      throw new ForbiddenError('Only CEO can delete categories');
    }

    const category = await FinanceCategory.findById(req.params.id);
    if (!category) throw new NotFoundError('Category not found');

    if (category.isDefault) {
      // Soft-disable default categories instead of deleting
      category.isActive = false;
      await category.save();
      return res.json({ success: true, message: 'Default category archived', data: category });
    }

    await FinanceCategory.findByIdAndDelete(req.params.id);

    await writeAudit({
      actor: req.user!.id,
      action: 'delete',
      entity: 'FinanceCategory',
      entityId: req.params.id,
      before: category,
      req,
    });

    res.json({ success: true, data: { ok: true } });
  })
);

export default router;
