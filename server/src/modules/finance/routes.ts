import { Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify/sync';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  Transaction,
  EXPENSE_CATEGORIES,
  REVENUE_CATEGORIES,
  MANAGER_EXPENSE_BILL_TYPES,
} from '../../models/Transaction.js';
import { Invoice } from '../../models/Invoice.js';
import { Vendor } from '../../models/Vendor.js';
import { Contract } from '../../models/Contract.js';
import { BankAccount } from '../../models/BankAccount.js';
import { Payroll } from '../../models/Payroll.js';
import { Budget } from '../../models/Budget.js';
import { Approval } from '../../models/Approval.js';
import { getSettings } from '../../models/Settings.js';
import { User } from '../../models/User.js';
import { Attendance } from '../../models/Attendance.js';
import { Task } from '../../models/Task.js';
import { Project } from '../../models/Project.js';
import { paginate } from '../../utils/pagination.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { sendEmail } from '../../utils/mailer.js';
import { Client } from '../../models/Client.js';
import { Bill } from '../../models/Bill.js';
import { FinanceCategory, DEFAULT_INCOME_CATEGORIES, DEFAULT_EXPENSE_CATEGORIES } from '../../models/FinanceCategory.js';
import categoryRoutes from './categoryRoutes.js';
import billRoutes from './billRoutes.js';
import salaryRoutes from './salaryRoutes.js';
import documentRoutes from './documentRoutes.js';
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
  addDays,
  format,
} from 'date-fns';
import { roundMoney, addMoney, subMoney } from '../../utils/money.js';
import { adjustBankBalance, directionForTxType } from '../../utils/bankLedger.js';
import { memoryCache } from '../../utils/cache.js';

const router = Router();
router.use(authenticate);

// Mount modular finance sub-routers
router.use('/categories', categoryRoutes);
router.use('/bills', billRoutes);
router.use('/salaries', salaryRoutes);
router.use('/documents', documentRoutes);

export function parseFlexibleDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const month = parseInt(dmy[2], 10) - 1;
      const year = parseInt(dmy[3], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export const flexibleDateSchema = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  const d = parseFlexibleDate(val);
  return d || val;
}, z.date());

export const flexibleDateSchemaOptional = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  const d = parseFlexibleDate(val);
  return d || undefined;
}, z.date().optional().nullable());

function parseRange(from?: string, to?: string) {
  const end = to ? endOfDay(new Date(to)) : endOfDay(new Date());
  const start = from ? startOfDay(new Date(from)) : startOfMonth(subMonths(end, 11));
  return { start, end };
}

function getFinancePeriodRange(period?: string, from?: string, to?: string) {
  const now = new Date();
  if (from || to) {
    const end = to ? endOfDay(new Date(to)) : endOfDay(now);
    const start = from ? startOfDay(new Date(from)) : startOfDay(subMonths(end, 1));
    return { start, end };
  }
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'this_week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'this_month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'this_year':
      return { start: startOfYear(now), end: endOfYear(now) };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

// ── Transactions Export (CSV) ─────────────────────────
router.get(
  '/transactions/export',
  authorize('transactions', 'export'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.type) {
      const t = String(req.query.type).toLowerCase();
      filter.type = t === 'income' ? 'revenue' : t;
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;
    if (req.user!.role === 'employee' || req.user!.role === 'manager') filter.createdBy = req.user!.id;
    if (req.query.from || req.query.to) {
      const { start, end } = parseRange(String(req.query.from || ''), String(req.query.to || ''));
      filter.date = { $gte: start, $lte: end };
    }

    const txs = await Transaction.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .populate('client', 'name company')
      .populate('vendor', 'name')
      .populate('employee', 'name email')
      .populate('createdBy', 'name email')
      .lean();

    const rows = txs.map((t) => ({
      Date: format(new Date(t.date), 'yyyy-MM-dd'),
      Type: t.type === 'revenue' ? 'Income' : 'Expense',
      Category: t.category,
      Title: t.title || '—',
      Amount: t.amount,
      Currency: t.currency || 'INR',
      Status: t.status,
      PaymentMethod: t.paymentMethod || '—',
      Party:
        (t.client as { name?: string; company?: string })?.company ||
        (t.client as { name?: string })?.name ||
        (t.vendor as { name?: string })?.name ||
        (t.employee as { name?: string })?.name ||
        '—',
      CreatedBy: (t.createdBy as { name?: string })?.name || '—',
      Notes: t.notes || '',
    }));

    const csv = stringify(rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transactions_${format(new Date(), 'yyyyMMdd_HHmm')}.csv"`
    );
    res.send(csv);
  })
);

// ── Transactions Listing ────────────────────────────
router.get(
  '/transactions',
  authorize('transactions', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.type) {
      const t = String(req.query.type).toLowerCase();
      filter.type = t === 'income' ? 'revenue' : t;
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;
    if (req.query.client) filter.client = req.query.client;
    if (req.user!.role === 'employee' || req.user!.role === 'manager') filter.createdBy = req.user!.id;

    if (req.query.search) {
      const q = String(req.query.search).trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { notes: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
        { paymentMethod: { $regex: q, $options: 'i' } },
      ];
    }

    const fromDate = (req.query.from || req.query.startDate) as string | undefined;
    const toDate = (req.query.to || req.query.endDate) as string | undefined;
    if (fromDate || toDate) {
      const dateFilterObj: Record<string, Date> = {};
      if (fromDate) dateFilterObj.$gte = startOfDay(new Date(fromDate));
      if (toDate) dateFilterObj.$lte = endOfDay(new Date(toDate));
      filter.date = dateFilterObj;
    }

    const data = await paginate(Transaction, filter, req, [
      'client',
      'vendor',
      'employee',
      'project',
      'bill',
      'bankAccount',
      'createdBy',
    ]);

    // Fetch dynamic categories from DB
    const dbCategories = await FinanceCategory.find({ isActive: true }).select('name type').lean();
    const dynamicIncome = dbCategories.filter((c) => c.type === 'income').map((c) => c.name);
    const dynamicExpense = dbCategories.filter((c) => c.type === 'expense').map((c) => c.name);

    res.json({
      success: true,
      data: {
        ...data,
        categories: {
          expense: Array.from(new Set([...DEFAULT_EXPENSE_CATEGORIES, ...dynamicExpense, ...EXPENSE_CATEGORIES])),
          revenue: Array.from(new Set([...DEFAULT_INCOME_CATEGORIES, ...dynamicIncome, ...REVENUE_CATEGORIES])),
        },
        billTypes: MANAGER_EXPENSE_BILL_TYPES,
      },
    });
  })
);

async function notifyCeosOfExpenseBill(opts: {
  requesterEmail: string;
  title: string;
  amount: number;
  category: string;
}) {
  const { notifyCeos } = await import('../../utils/notify.js');
  await notifyCeos({
    type: 'approval',
    title: 'Expense bill approval requested',
    message: `${opts.requesterEmail} submitted ${opts.category} — ${opts.title} for ₹${opts.amount}`,
    link: '/approvals',
  });
}

router.post(
  '/transactions',
  asyncHandler(async (req, res) => {
    const canCreate = ['ceo', 'finance'].includes(req.user!.role);
    const canSubmit = req.user!.role === 'employee' || canCreate || req.user!.role === 'manager';
    if (!canSubmit) throw new ForbiddenError();

    const body = z
      .object({
        type: z.enum(['revenue', 'expense']),
        category: z.string().trim(),
        amount: z.coerce.number().positive(),
        taxAmount: z.coerce.number().min(0).optional().nullable(),
        currency: z.string().optional().nullable(),
        date: flexibleDateSchema,
        client: z.string().optional().nullable(),
        vendor: z.string().optional().nullable(),
        employee: z.string().optional().nullable(),
        project: z.string().optional().nullable(),
        paymentMethod: z.string().optional().nullable(),
        bankAccountId: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        title: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        invoiceNumber: z.string().optional().nullable(),
        documentHash: z.string().optional().nullable(),
        scannedDocument: z.string().optional().nullable(),
        documentMetadata: z.record(z.unknown()).optional().nullable(),
        receipt: z.object({ name: z.string(), url: z.string() }).optional().nullable(),
        attachment: z
          .object({
            name: z.string(),
            url: z.string(),
            mime: z.string().optional().nullable(),
            size: z.number().optional().nullable(),
            hash: z.string().optional().nullable(),
          })
          .optional()
          .nullable(),
        submitForApproval: z.boolean().optional().nullable(),
      })
      .parse(req.body);

    if (body.type === 'revenue' && !canCreate) throw new ForbiddenError('Only finance/CEO can log revenue');

    // Check if category is valid (defaults or custom in DB)
    if (body.type === 'expense') {
      const isKnown =
        (EXPENSE_CATEGORIES as readonly string[]).includes(body.category) ||
        (DEFAULT_EXPENSE_CATEGORIES as readonly string[]).includes(body.category as (typeof DEFAULT_EXPENSE_CATEGORIES)[number]);
      if (!isKnown) {
        const found = await FinanceCategory.findOne({ name: body.category, type: 'expense', isActive: true });
        if (!found && ['ceo', 'finance'].includes(req.user!.role)) {
          await FinanceCategory.create({ name: body.category, type: 'expense', isActive: true, createdBy: req.user!.id }).catch(() => null);
        }
      }
    } else if (body.type === 'revenue') {
      const isKnown =
        (REVENUE_CATEGORIES as readonly string[]).includes(body.category) ||
        (DEFAULT_INCOME_CATEGORIES as readonly string[]).includes(body.category as (typeof DEFAULT_INCOME_CATEGORIES)[number]);
      if (!isKnown) {
        const found = await FinanceCategory.findOne({ name: body.category, type: 'income', isActive: true });
        if (!found && ['ceo', 'finance'].includes(req.user!.role)) {
          await FinanceCategory.create({ name: body.category, type: 'income', isActive: true, createdBy: req.user!.id }).catch(() => null);
        }
      }
    }

    if (body.category === 'Custom Bill' && !body.title?.trim() && !body.notes?.trim()) {
      throw new AppError('Custom bills need a title or description', 400);
    }

    const settings = await getSettings();
    const isStaffBill = req.user!.role === 'manager' || req.user!.role === 'employee';
    let status: 'draft' | 'pending' | 'approved' = 'approved';

    if (body.type === 'expense') {
      if (req.user!.role === 'ceo') {
        // CEO directly creates and approves transactions without self-approvals
        status = 'approved';
      } else if (isStaffBill) {
        // Managers/employees: draft or always send to CEO (no auto-approve shortcut)
        status = body.submitForApproval === false ? 'draft' : 'pending';
      } else {
        status =
          body.amount >= settings.approvalRules.alwaysCeoAbove || body.submitForApproval !== false
            ? 'pending'
            : 'approved';
        if (body.amount < settings.approvalRules.autoApproveUnder) status = 'approved';
      }
    }

    const billTitle =
      body.title?.trim() ||
      (body.category === 'Custom Bill' ? body.notes?.trim() : undefined) ||
      `${body.category} bill`;

    const notes = [body.title?.trim() && body.title.trim() !== body.notes?.trim() ? `Title: ${body.title.trim()}` : null, body.notes?.trim()]
      .filter(Boolean)
      .join('\n') || undefined;

    const { title: _title, submitForApproval: _submit, bankAccountId, ...txFields } = body;
    const cleanBank = (bankAccountId && typeof bankAccountId === 'string' && bankAccountId.trim() !== '') ? bankAccountId.trim() : undefined;
    const cleanClient = (body.client && typeof body.client === 'string' && body.client.trim() !== '') ? body.client.trim() : undefined;
    const cleanVendor = (body.vendor && typeof body.vendor === 'string' && body.vendor.trim() !== '') ? body.vendor.trim() : undefined;
    const cleanEmployee = (body.employee && typeof body.employee === 'string' && body.employee.trim() !== '') ? body.employee.trim() : undefined;
    const cleanProject = (body.project && typeof body.project === 'string' && body.project.trim() !== '') ? body.project.trim() : undefined;
    const cleanScannedDoc = (body.scannedDocument && typeof body.scannedDocument === 'string' && body.scannedDocument.trim() !== '') ? body.scannedDocument.trim() : undefined;

    const tx = await Transaction.create({
      ...txFields,
      title: body.title?.trim() || billTitle,
      description: body.description?.trim(),
      notes,
      amount: roundMoney(body.amount),
      taxAmount: body.taxAmount ? roundMoney(body.taxAmount) : 0,
      bankAccount: cleanBank,
      client: cleanClient,
      vendor: cleanVendor,
      employee: cleanEmployee,
      project: cleanProject,
      attachment: body.attachment || (body.receipt ? { name: body.receipt.name, url: body.receipt.url } : undefined),
      documentHash: body.documentHash || body.attachment?.hash,
      scannedDocument: cleanScannedDoc,
      documentMetadata: body.documentMetadata || undefined,
      status,
      createdBy: req.user!.id,
    });

    if (body.scannedDocument) {
      await import('../../models/ScannedDocument.js')
        .then(({ ScannedDocument }) =>
          ScannedDocument.findByIdAndUpdate(body.scannedDocument, {
            status: 'confirmed',
            linkedTransaction: tx._id,
          })
        )
        .catch(() => null);
    }

    if (status === 'approved' && (body.type === 'revenue' || body.type === 'expense')) {
      await adjustBankBalance({
        bankAccountId: cleanBank,
        amount: tx.amount,
        direction: directionForTxType(body.type),
      });
      memoryCache.delPrefix('finance');
    }

    if (status === 'pending') {
      const approval = await Approval.create({
        type: 'expense',
        refModel: 'Transaction',
        refId: tx._id,
        amount: tx.amount,
        currency: tx.currency,
        title: `${tx.category}: ${billTitle}`,
        description: body.notes || `Expense bill submitted for CEO approval`,
        priority: tx.amount >= settings.alertThresholds.approvalCriticalAmount ? 'critical' : 'medium',
        requestedBy: req.user!.id,
        status: 'pending',
        history: [{ action: 'submitted', by: req.user!.id, at: new Date() }],
      });
      tx.approval = approval._id;
      await tx.save();

      await notifyCeosOfExpenseBill({
        requesterEmail: req.user!.email,
        title: billTitle,
        amount: tx.amount,
        category: tx.category,
      });
    }

    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'Transaction',
      entityId: tx._id.toString(),
      after: tx,
      req,
    });
    res.status(201).json({
      success: true,
      data: tx,
      meta: { billTypes: MANAGER_EXPENSE_BILL_TYPES },
    });
  })
);

/** Manager/employee submits a draft expense bill to CEO */
router.post(
  '/transactions/:id/submit-approval',
  asyncHandler(async (req, res) => {
    if (!['manager', 'employee', 'finance', 'ceo'].includes(req.user!.role)) {
      throw new ForbiddenError();
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const tx = await Transaction.findById(id);
    if (!tx) throw new NotFoundError('Transaction not found');
    if (tx.type !== 'expense') throw new AppError('Only expense bills can be submitted', 400);
    if (!['draft', 'rejected'].includes(tx.status)) {
      throw new AppError('Only draft or rejected expense bills can be submitted', 400);
    }
    if (req.user!.role === 'manager' || req.user!.role === 'employee') {
      if (String(tx.createdBy) !== req.user!.id) {
        throw new ForbiddenError('You can only submit bills you created');
      }
    }

    const settings = await getSettings();
    const billTitle = tx.notes?.replace(/^Title:\s*/m, '').split('\n')[0] || `${tx.category} bill`;

    const approval = await Approval.create({
      type: 'expense',
      refModel: 'Transaction',
      refId: tx._id,
      amount: tx.amount,
      currency: tx.currency,
      title: `${tx.category}: ${billTitle}`,
      description: tx.notes || 'Expense bill submitted for CEO approval',
      priority: tx.amount >= settings.alertThresholds.approvalCriticalAmount ? 'critical' : 'medium',
      requestedBy: req.user!.id,
      status: 'pending',
      history: [{ action: 'submitted', by: req.user!.id, at: new Date() }],
    });

    tx.status = 'pending';
    tx.approval = approval._id;
    await tx.save();

    await notifyCeosOfExpenseBill({
      requesterEmail: req.user!.email,
      title: billTitle,
      amount: tx.amount,
      category: tx.category,
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'submit_expense_approval',
      entity: 'Transaction',
      entityId: id,
      after: { status: 'pending', approvalId: approval._id.toString() },
      req,
    });

    res.json({ success: true, data: { transaction: tx, approval } });
  })
);

router.patch(
  '/transactions/:id',
  requireRoles('ceo'),
  authorize('transactions', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        category: z.string().optional().nullable(),
        amount: z.coerce.number().positive().optional().nullable(),
        taxAmount: z.coerce.number().min(0).optional().nullable(),
        date: flexibleDateSchemaOptional,
        status: z.enum(['draft', 'pending', 'approved', 'rejected', 'paid', 'cancelled']).optional().nullable(),
        notes: z.string().optional().nullable(),
        title: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        paymentMethod: z.string().optional().nullable(),
        bankAccountId: z.string().optional().nullable(),
        client: z.string().optional().nullable(),
        vendor: z.string().optional().nullable(),
        employee: z.string().optional().nullable(),
        attachment: z
          .object({
            name: z.string(),
            url: z.string(),
            mime: z.string().optional().nullable(),
            size: z.number().optional().nullable(),
            hash: z.string().optional().nullable(),
          })
          .optional()
          .nullable(),
      })
      .parse(req.body);
    const existing = await Transaction.findById(req.params.id);
    if (!existing) throw new NotFoundError('Transaction not found');

    // Approved/paid amounts cannot be silently changed — require CEO + reapproval path
    if (['approved', 'paid'].includes(existing.status)) {
      if (body.amount != null && body.amount !== existing.amount) {
        throw new AppError(
          'Cannot change amount on an approved/paid transaction. Reject and resubmit, or create a reversal.',
          400,
          'IMMUTABLE_AMOUNT'
        );
      }
      if (body.status && !['ceo', 'finance'].includes(req.user!.role)) {
        throw new ForbiddenError('Only finance/CEO can change status of approved transactions');
      }
    }

    if (body.amount != null) body.amount = roundMoney(body.amount);

    const updateData: any = { ...body };
    if (updateData.bankAccountId !== undefined) {
      updateData.bankAccount = (updateData.bankAccountId && updateData.bankAccountId.trim() !== '') ? updateData.bankAccountId : null;
      delete updateData.bankAccountId;
    }
    if (updateData.client !== undefined && updateData.client?.trim() === '') updateData.client = null;
    if (updateData.vendor !== undefined && updateData.vendor?.trim() === '') updateData.vendor = null;
    if (updateData.employee !== undefined && updateData.employee?.trim() === '') updateData.employee = null;

    const tx = await Transaction.findByIdAndUpdate(req.params.id, updateData, { new: true });
    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'Transaction',
      entityId: req.params.id,
      before: existing,
      after: tx,
      req,
    });
    res.json({ success: true, data: tx });
  })
);

router.delete(
  '/transactions/:id',
  requireRoles('ceo'),
  authorize('transactions', 'delete'),
  asyncHandler(async (req, res) => {
    const existing = await Transaction.findById(req.params.id);
    if (!existing) throw new NotFoundError('Transaction not found');
    // Reverse bank impact for posted income/expense before hard delete
    if (
      ['approved', 'paid'].includes(existing.status) &&
      (existing.type === 'revenue' || existing.type === 'expense') &&
      existing.bankAccount
    ) {
      const { adjustBankBalance, directionForTxType } = await import('../../utils/bankLedger.js');
      const reverse = directionForTxType(existing.type) === 'credit' ? 'debit' : 'credit';
      await adjustBankBalance({
        bankAccountId: String(existing.bankAccount),
        amount: existing.amount,
        direction: reverse,
        preferPrimary: false,
      });
      memoryCache.delPrefix('finance');
    }
    await Transaction.findByIdAndDelete(req.params.id);
    await writeAudit({
      actor: req.user!.id,
      action: 'delete',
      entity: 'Transaction',
      entityId: req.params.id,
      before: existing,
      req,
    });
    res.json({ success: true, data: { ok: true } });
  })
);

// ── Invoices ────────────────────────────────────────
async function nextInvoiceNumber() {
  const settings = await getSettings();
  settings.invoiceCounter += 1;
  await settings.save();
  const year = new Date().getFullYear();
  return `${settings.invoicePrefix}-${year}-${String(settings.invoiceCounter).padStart(4, '0')}`;
}

function recomputeInvoiceStatus(inv: { total: number; paid: number; dueDate: Date; status: string }) {
  if (['cancelled', 'draft', 'pending_approval', 'rejected'].includes(inv.status)) return inv.status;
  if (inv.paid >= inv.total) return 'paid';
  if (inv.paid > 0) return 'partially_paid';
  if (inv.dueDate < new Date()) return 'overdue';
  return inv.status === 'sent' || inv.status === 'overdue' || inv.status === 'partially_paid'
    ? inv.status === 'overdue'
      ? 'overdue'
      : 'sent'
    : inv.status;
}

router.get(
  '/invoices',
  authorize('invoices', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.client) filter.client = req.query.client;
    if (req.user!.role === 'manager') filter.createdBy = req.user!.id;
    const data = await paginate(Invoice, filter, req, 'client');
    res.json({ success: true, data });
  })
);

router.post(
  '/invoices',
  authorize('invoices', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        client: z.string(),
        project: z.string().optional(),
        items: z
          .array(
            z.object({
              description: z.string(),
              quantity: z.number().positive(),
              unitPrice: z.number().min(0),
            })
          )
          .min(1),
        tax: z.number().min(0).default(0),
        discount: z.number().min(0).default(0),
        issueDate: z.coerce.date(),
        dueDate: z.coerce.date(),
        notes: z.string().optional(),
        status: z.enum(['draft', 'sent']).optional(),
        submitForApproval: z.boolean().optional(),
      })
      .parse(req.body);

    const items = body.items.map((i) => ({
      ...i,
      amount: Math.round(i.quantity * i.unitPrice * 100) / 100,
    }));
    const subtotal = items.reduce((s, i) => s + i.amount, 0);
    const total = Math.round((subtotal + body.tax - body.discount) * 100) / 100;
    const number = await nextInvoiceNumber();

    // Managers always create drafts (or pending_approval if they submit immediately)
    let status: 'draft' | 'pending_approval' | 'sent' = body.status || 'draft';
    if (req.user!.role === 'manager') {
      status = body.submitForApproval ? 'pending_approval' : 'draft';
    }

    const invoice = await Invoice.create({
      number,
      client: body.client,
      project: body.project,
      items,
      tax: body.tax,
      discount: body.discount,
      subtotal,
      total,
      paid: 0,
      status,
      issueDate: body.issueDate,
      dueDate: body.dueDate,
      notes: body.notes,
      createdBy: req.user!.id,
    });

    if (status === 'pending_approval') {
      const approval = await Approval.create({
        type: 'client_bill',
        refModel: 'Invoice',
        refId: invoice._id,
        amount: total,
        title: `Client bill ${number}`,
        description: body.notes || `Invoice draft submitted by manager for CEO approval`,
        requestedBy: req.user!.id,
        status: 'pending',
        priority: total >= 100000 ? 'critical' : 'medium',
        history: [{ action: 'submitted', by: req.user!.id, at: new Date() }],
      });
      invoice.approval = approval._id;
      await invoice.save();

      const { notifyCeos } = await import('../../utils/notify.js');
      await notifyCeos({
        type: 'approval',
        title: 'Bill approval requested',
        message: `${req.user!.email} submitted ${number} for ₹${total}`,
        link: '/approvals',
      });
    }

    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'Invoice',
      entityId: invoice._id.toString(),
      after: invoice,
      req,
    });
    res.status(201).json({ success: true, data: invoice });
  })
);

/** Manager submits a draft client bill to CEO for approval */
router.post(
  '/invoices/:id/submit-approval',
  authorize('invoices', 'submit'),
  asyncHandler(async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const invoice = await Invoice.findById(id).populate('client', 'name company');
    if (!invoice) throw new NotFoundError('Invoice not found');
    if (!['draft', 'rejected'].includes(invoice.status)) {
      throw new AppError('Only draft or rejected bills can be submitted for approval', 400);
    }
    if (req.user!.role === 'manager' && String(invoice.createdBy) !== req.user!.id) {
      throw new ForbiddenError('You can only submit bills you created');
    }

    const approval = await Approval.create({
      type: 'client_bill',
      refModel: 'Invoice',
      refId: invoice._id,
      amount: invoice.total,
      title: `Client bill ${invoice.number}`,
      description: invoice.notes || `Bill for ${(invoice.client as { company?: string; name?: string })?.company || (invoice.client as { name?: string })?.name || 'client'}`,
      requestedBy: req.user!.id,
      status: 'pending',
      priority: invoice.total >= 100000 ? 'critical' : 'medium',
      history: [{ action: 'submitted', by: req.user!.id, at: new Date() }],
    });

    invoice.status = 'pending_approval';
    invoice.approval = approval._id;
    await invoice.save();

    const { notifyCeos } = await import('../../utils/notify.js');
    await notifyCeos({
      type: 'approval',
      title: 'Bill approval requested',
      message: `${req.user!.email} submitted ${invoice.number} (₹${invoice.total}) for approval`,
      link: '/approvals',
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'submit_bill_approval',
      entity: 'Invoice',
      entityId: id,
      after: { status: 'pending_approval', approvalId: approval._id.toString() },
      req,
    });

    res.json({ success: true, data: { invoice, approval } });
  })
);

router.post(
  '/invoices/:id/payments',
  authorize('invoices', 'update'),
  asyncHandler(async (req, res) => {
    if (req.user!.role === 'manager' || req.user!.role === 'employee') {
      throw new ForbiddenError('Only CEO or finance can record invoice payments');
    }
    const body = z
      .object({
        amount: z.number().positive(),
        date: z.coerce.date().optional(),
        method: z.string().optional(),
        note: z.string().optional(),
      })
      .parse(req.body);
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) throw new NotFoundError('Invoice not found');
    if (invoice.status === 'cancelled') throw new AppError('Invoice cancelled', 400);
    if (invoice.status === 'pending_approval' || invoice.status === 'draft') {
      throw new AppError('Invoice must be approved/sent before recording payment', 400);
    }

    invoice.payments.push({
      amount: body.amount,
      date: body.date || new Date(),
      method: body.method,
      note: body.note,
    });
    invoice.paid = Math.round((invoice.paid + body.amount) * 100) / 100;
    invoice.status = recomputeInvoiceStatus(invoice) as typeof invoice.status;

    // Log revenue when payment recorded
    await Transaction.create({
      type: 'revenue',
      category: 'Client Payout',
      amount: body.amount,
      currency: 'INR',
      date: body.date || new Date(),
      client: invoice.client,
      invoice: invoice._id,
      status: 'approved',
      createdBy: req.user!.id,
      notes: `Payment for ${invoice.number}`,
    });

    await invoice.save();
    await writeAudit({
      actor: req.user!.id,
      action: 'payment',
      entity: 'Invoice',
      entityId: invoice._id.toString(),
      after: { paid: invoice.paid, status: invoice.status },
      req,
    });
    res.json({ success: true, data: invoice });
  })
);

router.get(
  '/invoices/:id/pdf',
  authorize('invoices', 'read'),
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findById(req.params.id).populate('client').lean();
    if (!invoice) throw new NotFoundError('Invoice not found');
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`);
    doc.pipe(res);
    doc.fontSize(20).text('STAR MEDIA', { continued: false });
    doc.fontSize(14).text(`Invoice ${invoice.number}`);
    doc.moveDown();
    const client = invoice.client as unknown as { name?: string; company?: string };
    doc.text(`Bill to: ${client?.company || client?.name || ''}`);
    doc.text(`Issue: ${format(new Date(invoice.issueDate), 'yyyy-MM-dd')}`);
    doc.text(`Due: ${format(new Date(invoice.dueDate), 'yyyy-MM-dd')}`);
    doc.moveDown();
    for (const item of invoice.items) {
      doc.text(`${item.description} — ${item.quantity} x ${item.unitPrice} = ${item.amount}`);
    }
    doc.moveDown();
    doc.text(`Subtotal: ${invoice.subtotal}`);
    doc.text(`Tax: ${invoice.tax}`);
    doc.text(`Discount: ${invoice.discount}`);
    doc.text(`Total: ${invoice.total}`);
    doc.text(`Paid: ${invoice.paid}`);
    doc.end();
  })
);

router.post(
  '/invoices/:id/send',
  authorize('invoices', 'update'),
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findById(req.params.id).populate('client');
    if (!invoice) throw new NotFoundError('Invoice not found');
    const client = await Client.findById(invoice.client);
    if (client?.email) {
      await sendEmail({
        to: client.email,
        subject: `Invoice ${invoice.number} from STAR MEDIA`,
        html: `<p>Invoice <b>${invoice.number}</b> for ${invoice.total} INR is due ${format(invoice.dueDate, 'yyyy-MM-dd')}.</p>`,
      });
    }
    if (invoice.status === 'draft') invoice.status = 'sent';
    await invoice.save();
    res.json({ success: true, data: invoice });
  })
);

// ── Vendors / Contracts / Bank / Payroll ────────────
router.get('/vendors', authorize('vendors', 'read'), asyncHandler(async (req, res) => {
  const data = await paginate(Vendor, {}, req);
  res.json({ success: true, data });
}));

router.post('/vendors', authorize('vendors', 'create'), asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string(),
    type: z.enum(['vendor', 'host', 'supplier', 'freelancer']).optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    contact: z.string().optional(),
    notes: z.string().optional(),
  }).parse(req.body);
  const vendor = await Vendor.create(body);
  res.status(201).json({ success: true, data: vendor });
}));

router.get('/contracts', authorize('contracts', 'read'), asyncHandler(async (req, res) => {
  const data = await paginate(Contract, {}, req, ['vendor', 'client']);
  res.json({ success: true, data });
}));

router.post('/contracts', authorize('contracts', 'create'), asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string(),
    vendor: z.string().optional(),
    client: z.string().optional(),
    type: z.string().optional(),
    amount: z.number().min(0),
    billingCycle: z.enum(['monthly', 'quarterly', 'yearly', 'one_time']).optional(),
    startDate: z.coerce.date(),
    renewalDate: z.coerce.date().optional(),
    notes: z.string().optional(),
  }).parse(req.body);
  const contract = await Contract.create(body);
  res.status(201).json({ success: true, data: contract });
}));

router.get('/bank-accounts', authorize('bank_accounts', 'read'), asyncHandler(async (_req, res) => {
  const accounts = await BankAccount.find().lean();
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  res.json({ success: true, data: { accounts, totalLiquid: total } });
}));

router.post('/bank-accounts', authorize('bank_accounts', 'create'), asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string(),
    bank: z.string(),
    accountLast4: z.string().length(4),
    balance: z.number(),
    currency: z.string().optional(),
    isPrimary: z.boolean().optional(),
  }).parse(req.body);
  const account = await BankAccount.create(body);
  res.status(201).json({ success: true, data: account });
}));

router.patch('/bank-accounts/:id', authorize('bank_accounts', 'update'), asyncHandler(async (req, res) => {
  const body = z.object({ balance: z.number().optional(), name: z.string().optional(), status: z.enum(['active', 'inactive']).optional() }).parse(req.body);
  const account = await BankAccount.findByIdAndUpdate(req.params.id, body, { new: true });
  if (!account) throw new NotFoundError();
  res.json({ success: true, data: account });
}));

/** Employee salary master (admin) */
router.get(
  '/salaries',
  authorize('payroll', 'read'),
  asyncHandler(async (_req, res) => {
    const users = await User.find({
      status: { $in: ['active', 'invited'] },
      role: { $in: ['employee', 'manager', 'finance'] },
    })
      .select('name email role department designation employeeId status salary joiningDate')
      .sort({ name: 1 })
      .lean();

    const summary = users.reduce(
      (acc, u) => {
        const base = u.salary?.base || 0;
        acc.headcount += 1;
        acc.withSalary += base > 0 ? 1 : 0;
        acc.monthlyBase += base;
        acc.monthlyStipend += u.salary?.stipend || 0;
        acc.monthlyIncentive += u.salary?.incentive || 0;
        return acc;
      },
      { headcount: 0, withSalary: 0, monthlyBase: 0, monthlyStipend: 0, monthlyIncentive: 0 }
    );

    res.json({
      success: true,
      data: {
        items: users,
        summary: {
          ...summary,
          monthlyTotal: summary.monthlyBase + summary.monthlyStipend + summary.monthlyIncentive,
        },
      },
    });
  })
);

router.patch(
  '/salaries/:userId',
  authorize('payroll', 'manage'),
  asyncHandler(async (req, res) => {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const body = z
      .object({
        base: z.number().min(0),
        stipend: z.number().min(0).optional().default(0),
        incentive: z.number().min(0).optional().default(0),
        currency: z.string().optional().default('INR'),
        payCycle: z.enum(['monthly', 'biweekly', 'weekly']).optional().default('monthly'),
        effectiveFrom: z.coerce.date().optional(),
        bankAccountLast4: z.string().max(4).optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(req.body);

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('Employee not found');
    if (user.role === 'ceo') throw new AppError('CEO salary is not managed here', 400);

    const before = user.salary;
    user.salary = {
      base: body.base,
      stipend: body.stipend,
      incentive: body.incentive,
      currency: body.currency,
      payCycle: body.payCycle,
      effectiveFrom: body.effectiveFrom || user.salary?.effectiveFrom || new Date(),
      bankAccountLast4: body.bankAccountLast4,
      notes: body.notes,
    };
    await user.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'salary_update',
      entity: 'User',
      entityId: userId,
      before,
      after: user.salary,
      req,
    });

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        salary: user.salary,
      },
    });
  })
);

/** Working days + hours for an employee in a month (from attendance). */
router.get(
  '/salaries/:userId/work-summary',
  authorize('payroll', 'read'),
  asyncHandler(async (req, res) => {
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const period = String(req.query.period || '').trim();
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new AppError('period must be YYYY-MM', 400);
    }

    const user = await User.findById(userId).select('name email role employeeId salary status').lean();
    if (!user) throw new NotFoundError('Employee not found');

    const records = await Attendance.find({
      user: userId,
      date: { $regex: `^${period}` },
    })
      .sort({ date: 1 })
      .lean();

    const days = records.map((r) => {
      let minutes = r.durationMinutes || 0;
      if (r.checkInAt && !r.checkOutAt && r.status === 'checked_in') {
        minutes = Math.max(0, Math.round((Date.now() - new Date(r.checkInAt).getTime()) / 60000));
      }
      return {
        _id: r._id,
        date: r.date,
        checkInAt: r.checkInAt,
        checkOutAt: r.checkOutAt,
        durationMinutes: minutes,
        status: r.status,
        workLog: r.workLog,
        notes: r.notes,
      };
    });

    const workingDays = days.filter((d) => d.checkInAt).length;
    const totalMinutes = days.reduce((s, d) => s + (d.durationMinutes || 0), 0);
    const missingCheckout = days.filter((d) => d.status === 'missing_checkout' || (d.checkInAt && !d.checkOutAt)).length;

    const existingPayroll = await Payroll.findOne({ employee: userId, period }).lean();

    const [tasks, userProjects] = await Promise.all([
      Task.find({ assignees: userId })
        .select('title status priority progress dueDate project')
        .populate('project', 'name status progress')
        .lean(),
      Project.find({ members: userId })
        .select('name status progress budget client endDate')
        .populate('client', 'company name')
        .lean(),
    ]);

    const tasksTotal = tasks.length;
    const tasksCompleted = tasks.filter((t) => t.status === 'completed').length;
    const projectsTotal = userProjects.length;
    const projectsCompleted = userProjects.filter((p) => p.status === 'completed').length;

    res.json({
      success: true,
      data: {
        employee: user,
        period,
        workingDays,
        totalMinutes,
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
        missingCheckout,
        days,
        tasksTotal,
        tasksCompleted,
        projectsTotal,
        projectsCompleted,
        projects: userProjects,
        tasks: tasks.slice(0, 10),
        suggestedAmount: user.salary?.base || 0,
        existingPayroll: existingPayroll
          ? { _id: existingPayroll._id, status: existingPayroll.status, net: existingPayroll.net }
          : null,
      },
    });
  })
);

/**
 * Pay salary for selected employee + month.
 * Saves payroll as disbursed and creates a paid expense transaction.
 */
router.post(
  '/salaries/pay',
  authorize('payroll', 'manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        employeeId: z.string().min(1),
        period: z.string().regex(/^\d{4}-\d{2}$/),
        amount: z.number().positive(),
        notes: z.string().max(500).optional(),
      })
      .parse(req.body);

    const employee = await User.findById(body.employeeId);
    if (!employee) throw new NotFoundError('Employee not found');
    if (employee.role === 'ceo') throw new AppError('CEO salary is not managed here', 400);

    const existing = await Payroll.findOne({ employee: body.employeeId, period: body.period });
    if (existing && existing.status === 'disbursed') {
      throw new AppError('Salary already paid for this employee and month', 409, 'ALREADY_PAID');
    }

    const [y, m] = body.period.split('-').map(Number);
    const periodStart = new Date(y, m - 1, 1);
    const periodEnd = new Date(y, m, 0, 23, 59, 59, 999);

    const attendance = await Attendance.find({
      user: body.employeeId,
      date: { $regex: `^${body.period}` },
      checkInAt: { $ne: null },
    }).lean();
    const workingDays = attendance.length;
    const totalMinutes = attendance.reduce((s, r) => s + (r.durationMinutes || 0), 0);

    const notes = [
      body.notes,
      `Working days: ${workingDays}`,
      `Hours: ${(totalMinutes / 60).toFixed(1)}`,
    ]
      .filter(Boolean)
      .join(' · ');

    const payroll = await Payroll.findOneAndUpdate(
      { employee: body.employeeId, period: body.period },
      {
        employee: body.employeeId,
        period: body.period,
        periodStart,
        periodEnd,
        base: body.amount,
        stipend: 0,
        incentive: 0,
        deductions: 0,
        net: body.amount,
        status: 'disbursed',
        paidOn: new Date(),
        createdBy: req.user!.id,
        notes,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Update salary master base to last paid amount for convenience
    if (!employee.salary?.base) {
      employee.salary = {
        base: body.amount,
        stipend: employee.salary?.stipend || 0,
        incentive: employee.salary?.incentive || 0,
        currency: 'INR',
        payCycle: 'monthly',
        effectiveFrom: periodStart,
      };
      await employee.save();
    }

    const expense = await Transaction.create({
      type: 'expense',
      category: 'Employee Stipends',
      amount: body.amount,
      currency: 'INR',
      date: periodEnd,
      status: 'paid',
      paymentMethod: 'salary',
      createdBy: req.user!.id,
      notes: `Salary ${body.period} — ${employee.name} (${workingDays} days, ${(totalMinutes / 60).toFixed(1)}h)`,
    });

    await writeAudit({
      actor: req.user!.id,
      action: 'salary_pay',
      entity: 'Payroll',
      entityId: payroll._id.toString(),
      after: {
        employee: employee.email,
        period: body.period,
        amount: body.amount,
        workingDays,
        expenseId: expense._id.toString(),
      },
      req,
    });

    res.status(201).json({
      success: true,
      data: {
        payroll,
        expense,
        work: { workingDays, totalMinutes, totalHours: Math.round((totalMinutes / 60) * 10) / 10 },
      },
    });
  })
);

router.get('/payroll', authorize('payroll', 'read'), asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.period) filter.period = req.query.period;
  if (req.query.status) filter.status = req.query.status;
  const data = await paginate(Payroll, filter, req, 'employee');
  res.json({ success: true, data });
}));

router.post('/payroll/run', authorize('payroll', 'create'), asyncHandler(async (req, res) => {
  const body = z.object({
    period: z.string(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    entries: z.array(z.object({
      employee: z.string(),
      base: z.number().min(0),
      stipend: z.number().min(0).default(0),
      incentive: z.number().min(0).default(0),
      deductions: z.number().min(0).default(0),
    })).min(1),
    submit: z.boolean().optional(),
  }).parse(req.body);

  const created = [];
  for (const e of body.entries) {
    const net = e.base + e.stipend + e.incentive - e.deductions;
    const row = await Payroll.findOneAndUpdate(
      { employee: e.employee, period: body.period },
      {
        ...e,
        net,
        period: body.period,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        status: body.submit ? 'pending_approval' : 'draft',
        createdBy: req.user!.id,
      },
      { upsert: true, new: true }
    );
    if (body.submit) {
      const emp = await User.findById(e.employee).select('name');
      const approval = await Approval.create({
        type: 'payroll',
        refModel: 'Payroll',
        refId: row._id,
        amount: net,
        title: `Payroll ${body.period} — ${emp?.name || 'employee'}`,
        requestedBy: req.user!.id,
        status: 'pending',
        history: [{ action: 'submitted', by: req.user!.id, at: new Date() }],
      });
      row.approval = approval._id;
      await row.save();
    }
    created.push(row);
  }
  res.status(201).json({ success: true, data: created });
}));

/** Generate payroll rows from configured employee salaries for a month (YYYY-MM). */
router.post(
  '/payroll/generate',
  authorize('payroll', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        period: z.string().regex(/^\d{4}-\d{2}$/),
        submit: z.boolean().optional().default(false),
        deductionsDefault: z.number().min(0).optional().default(0),
      })
      .parse(req.body);

    const [y, m] = body.period.split('-').map(Number);
    const periodStart = new Date(y, m - 1, 1);
    const periodEnd = new Date(y, m, 0, 23, 59, 59, 999);

    const employees = await User.find({
      status: 'active',
      role: { $in: ['employee', 'manager', 'finance'] },
      'salary.base': { $gt: 0 },
    }).select('name salary');

    if (!employees.length) {
      throw new AppError('No employees with salary configured. Set salaries first.', 400, 'NO_SALARIES');
    }

    const created = [];
    for (const emp of employees) {
      const base = emp.salary?.base || 0;
      const stipend = emp.salary?.stipend || 0;
      const incentive = emp.salary?.incentive || 0;
      const deductions = body.deductionsDefault;
      const net = base + stipend + incentive - deductions;

      const existing = await Payroll.findOne({ employee: emp._id, period: body.period });
      if (existing && ['approved', 'disbursed'].includes(existing.status)) {
        created.push(existing);
        continue;
      }

      const row = await Payroll.findOneAndUpdate(
        { employee: emp._id, period: body.period },
        {
          employee: emp._id,
          period: body.period,
          periodStart,
          periodEnd,
          base,
          stipend,
          incentive,
          deductions,
          net,
          status: body.submit ? 'pending_approval' : 'draft',
          createdBy: req.user!.id,
          notes: `Auto-generated from salary master (${emp.salary?.payCycle || 'monthly'})`,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (body.submit && row.status === 'pending_approval') {
        const approval = await Approval.create({
          type: 'payroll',
          refModel: 'Payroll',
          refId: row._id,
          amount: net,
          title: `Payroll ${body.period} — ${emp.name}`,
          requestedBy: req.user!.id,
          status: 'pending',
          history: [{ action: 'submitted', by: req.user!.id, at: new Date() }],
        });
        row.approval = approval._id;
        await row.save();
      }
      created.push(row);
    }

    await writeAudit({
      actor: req.user!.id,
      action: 'payroll_generate',
      entity: 'Payroll',
      entityId: body.period,
      after: { count: created.length, submit: body.submit },
      req,
    });

    res.status(201).json({ success: true, data: { period: body.period, count: created.length, items: created } });
  })
);

/** CEO/finance can approve a draft or pending payroll row directly */
router.post(
  '/payroll/:id/approve',
  authorize('payroll', 'approve'),
  asyncHandler(async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const row = await Payroll.findById(id);
    if (!row) throw new NotFoundError();
    if (!['draft', 'pending_approval'].includes(row.status)) {
      throw new AppError('Only draft or pending payroll can be approved', 400);
    }
    row.status = 'approved';
    await row.save();
    if (row.approval) {
      await Approval.findByIdAndUpdate(row.approval, {
        status: 'approved',
        $push: { history: { action: 'approved', by: req.user!.id, at: new Date() } },
      });
    }
    await writeAudit({
      actor: req.user!.id,
      action: 'payroll_approve',
      entity: 'Payroll',
      entityId: id,
      after: { status: 'approved', net: row.net },
      req,
    });
    res.json({ success: true, data: row });
  })
);

router.post('/payroll/:id/disburse', authorize('payroll', 'update'), asyncHandler(async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const row = await Payroll.findById(id).populate('employee', 'name');
  if (!row) throw new NotFoundError();
  if (row.status !== 'approved') throw new AppError('Payroll must be approved first', 400);
  row.status = 'disbursed';
  row.paidOn = new Date();
  await row.save();
  const empName = (row.employee as { name?: string })?.name || 'employee';
  await Transaction.create({
    type: 'expense',
    category: 'Employee Stipends',
    amount: row.net,
    currency: 'INR',
    date: new Date(),
    status: 'paid',
    createdBy: req.user!.id,
    notes: `Salary/payroll ${row.period} — ${empName}`,
  });
  await writeAudit({
    actor: req.user!.id,
    action: 'payroll_disburse',
    entity: 'Payroll',
    entityId: id,
    after: { status: 'disbursed', net: row.net },
    req,
  });
  res.json({ success: true, data: row });
}));

// ── Overview / P&L / Export ─────────────────────────
router.get(
  '/overview',
  authorize('finance_overview', 'read'),
  asyncHandler(async (req, res) => {
    const now = new Date();
    const today = { $gte: startOfDay(now), $lte: endOfDay(now) };
    const month = { $gte: startOfMonth(now), $lte: endOfMonth(now) };
    const year = { $gte: startOfYear(now), $lte: endOfYear(now) };

    const sum = async (type: 'revenue' | 'expense', range: { $gte: Date; $lte: Date }) => {
      const r = await Transaction.aggregate([
        { $match: { type, status: { $in: ['approved', 'paid'] }, date: range } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      return r[0]?.total || 0;
    };

    const [
      revToday,
      revMonth,
      revYear,
      revAll,
      expMonth,
      expYear,
      expByCat,
      ar,
      payrollLiab,
      banks,
      invoicedMonth,
      collectedMonth,
      vendorPayables,
    ] = await Promise.all([
        sum('revenue', today),
        sum('revenue', month),
        sum('revenue', year),
        Transaction.aggregate([
          { $match: { type: 'revenue', status: { $in: ['approved', 'paid'] } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        sum('expense', month),
        sum('expense', year),
        Transaction.aggregate([
          { $match: { type: 'expense', status: { $in: ['approved', 'paid'] }, date: month } },
          { $group: { _id: '$category', total: { $sum: '$amount' } } },
          { $sort: { total: -1 } },
        ]),
        Invoice.aggregate([
          { $match: { status: { $in: ['sent', 'partially_paid', 'overdue'] } } },
          {
            $project: {
              outstanding: { $subtract: ['$total', '$paid'] },
              dueDate: 1,
              number: 1,
              client: 1,
              status: 1,
            },
          },
          {
            $facet: {
              total: [{ $group: { _id: null, sum: { $sum: '$outstanding' } } }],
              aging: [
                {
                  $bucket: {
                    groupBy: {
                      $dateDiff: { startDate: '$dueDate', endDate: now, unit: 'day' },
                    },
                    boundaries: [-99999, 0, 31, 61, 91, 99999],
                    default: 'other',
                    output: { count: { $sum: 1 }, amount: { $sum: '$outstanding' } },
                  },
                },
              ],
              overdue: [
                { $match: { dueDate: { $lt: now } } },
                { $sort: { dueDate: 1 } },
                { $limit: 20 },
                {
                  $lookup: {
                    from: 'clients',
                    localField: 'client',
                    foreignField: '_id',
                    as: 'client',
                  },
                },
                { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
              ],
            },
          },
        ]),
        Payroll.aggregate([
          { $match: { status: { $in: ['pending_approval', 'approved'] } } },
          { $group: { _id: null, total: { $sum: '$net' } } },
        ]),
        BankAccount.find({ status: 'active' }).lean(),
        // Invoiced = invoice totals issued this month (not cash)
        Invoice.aggregate([
          {
            $match: {
              status: { $nin: ['draft', 'cancelled'] },
              issueDate: month,
            },
          },
          { $group: { _id: null, total: { $sum: '$total' }, collected: { $sum: '$paid' } } },
        ]),
        // Collected = invoice payments recorded this month via revenue txs linked to invoices
        Transaction.aggregate([
          {
            $match: {
              type: 'revenue',
              status: { $in: ['approved', 'paid'] },
              invoice: { $ne: null },
              date: month,
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        // Vendor payables = approved unpaid vendor-linked expenses + upcoming contract renewals
        Transaction.aggregate([
          {
            $match: {
              type: 'expense',
              vendor: { $ne: null },
              status: { $in: ['approved', 'pending'] },
            },
          },
          {
            $facet: {
              outstanding: [{ $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }],
              upcoming: [
                { $match: { date: { $gte: now, $lte: addDays(now, 30) } } },
                { $sort: { date: 1 } },
                { $limit: 15 },
                {
                  $lookup: {
                    from: 'vendors',
                    localField: 'vendor',
                    foreignField: '_id',
                    as: 'vendor',
                  },
                },
                { $unwind: { path: '$vendor', preserveNullAndEmptyArrays: true } },
              ],
            },
          },
        ]),
      ]);

    const revenueAll = revAll[0]?.total || 0;
    const profitMonth = roundMoney(revMonth - expMonth);
    const margin = revMonth > 0 ? (profitMonth / revMonth) * 100 : 0;

    const agingMap: Record<string, { count: number; amount: number }> = {
      '0-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 },
      '90+': { count: 0, amount: 0 },
    };
    const buckets = ar[0]?.aging || [];
    for (const b of buckets) {
      if (b._id >= 0 && b._id < 31) agingMap['0-30'] = { count: b.count, amount: b.amount };
      else if (b._id >= 31 && b._id < 61) agingMap['31-60'] = { count: b.count, amount: b.amount };
      else if (b._id >= 61 && b._id < 91) agingMap['61-90'] = { count: b.count, amount: b.amount };
      else if (b._id >= 91) agingMap['90+'] = { count: b.count, amount: b.amount };
    }

    const vp = vendorPayables[0] || { outstanding: [], upcoming: [] };

    res.json({
      success: true,
      data: {
        // collectedRevenue = cash-basis from revenue transactions (includes invoice payments)
        revenue: {
          today: revToday,
          month: revMonth,
          year: revYear,
          cumulative: revenueAll,
          definition: 'collected',
        },
        // Explicit invoiced vs collected for AR clarity
        invoiced: {
          month: invoicedMonth[0]?.total || 0,
          collectedMonth: collectedMonth[0]?.total || invoicedMonth[0]?.collected || 0,
          definition: 'invoiced = invoice.total issued; collectedMonth = payments linked to invoices',
        },
        expenses: { month: expMonth, year: expYear, byCategory: expByCat },
        profit: {
          month: profitMonth,
          margin,
          year: roundMoney(revYear - expYear),
          definition: 'operating = collected revenue − approved/paid expenses',
        },
        ar: {
          outstanding: ar[0]?.total[0]?.sum || 0,
          aging: agingMap,
          overdue: ar[0]?.overdue || [],
        },
        vendorPayables: {
          outstanding: vp.outstanding[0]?.total || 0,
          count: vp.outstanding[0]?.count || 0,
          upcoming: vp.upcoming || [],
          note: 'Approved/pending vendor-linked expenses (not bank-synced AP)',
        },
        payrollLiability: payrollLiab[0]?.total || 0,
        treasury: {
          accounts: banks,
          totalLiquid: banks.reduce((s, a) => s + a.balance, 0),
          note: 'Manually maintained balances — not real-time bank sync',
        },
      },
    });
  })
);

router.get(
  '/pnl',
  authorize('finance_overview', 'read'),
  asyncHandler(async (req, res) => {
    const { start, end } = parseRange(String(req.query.from || ''), String(req.query.to || ''));
    const rows = await Transaction.aggregate([
      {
        $match: {
          status: { $in: ['approved', 'paid'] },
          date: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            type: '$type',
            category: '$category',
          },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthly: Record<string, { revenue: number; expense: number }> = {};
    for (const r of rows) {
      const key = `${r._id.year}-${String(r._id.month).padStart(2, '0')}`;
      if (!monthly[key]) monthly[key] = { revenue: 0, expense: 0 };
      monthly[key][r._id.type as 'revenue' | 'expense'] += r.total;
    }

    const summary = Object.entries(monthly).map(([period, v]) => ({
      period,
      revenue: v.revenue,
      expense: v.expense,
      profit: v.revenue - v.expense,
      margin: v.revenue ? ((v.revenue - v.expense) / v.revenue) * 100 : 0,
    }));

    res.json({ success: true, data: { summary, breakdown: rows } });
  })
);

router.get(
  '/export',
  authorize('finance_overview', 'export'),
  asyncHandler(async (req, res) => {
    const formatType = String(req.query.format || 'csv');
    const { start, end } = parseRange(String(req.query.from || ''), String(req.query.to || ''));
    const txs = await Transaction.find({
      status: { $in: ['approved', 'paid'] },
      date: { $gte: start, $lte: end },
    })
      .sort('date')
      .lean();

    if (formatType === 'pdf') {
      const doc = new PDFDocument({ margin: 40 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="pnl-export.pdf"');
      doc.pipe(res);
      doc.fontSize(18).text('STAR MEDIA — Profit & Loss');
      doc.fontSize(10).text(`${format(start, 'yyyy-MM-dd')} to ${format(end, 'yyyy-MM-dd')}`);
      doc.moveDown();
      let rev = 0;
      let exp = 0;
      for (const t of txs) {
        if (t.type === 'revenue') rev += t.amount;
        else exp += t.amount;
        doc.text(`${format(t.date, 'yyyy-MM-dd')} | ${t.type} | ${t.category} | ${t.amount}`);
      }
      doc.moveDown();
      doc.text(`Revenue: ${rev}`);
      doc.text(`Expenses: ${exp}`);
      doc.text(`Net Profit: ${rev - exp}`);
      doc.end();
      return;
    }

    const rows = txs.map((t) => ({
      date: format(t.date, 'yyyy-MM-dd'),
      account: t.category,
      debit: t.type === 'expense' ? t.amount : 0,
      credit: t.type === 'revenue' ? t.amount : 0,
      reference: t._id.toString(),
      type: t.type,
      status: t.status,
      notes: t.notes || '',
    }));
    const csv = stringify(rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="pnl-export.csv"');
    res.send(csv);
  })
);

// ── Centralized Finance Dashboard Summary ────────────
router.get(
  '/dashboard-summary',
  authorize('finance_overview', 'read'),
  asyncHandler(async (req, res) => {
    const period = String(req.query.period || 'this_month');
    const cacheKey = `finance_dashboard_${period}_${req.query.from || ''}_${req.query.to || ''}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const { start, end } = getFinancePeriodRange(
      period,
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined
    );

    // 1. In-period Income (approved/paid revenue transactions)
    const incomeAgg = await Transaction.aggregate([
      { $match: { type: 'revenue', status: { $in: ['approved', 'paid'] }, date: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const totalIncome = incomeAgg[0]?.total || 0;
    const incomeCount = incomeAgg[0]?.count || 0;

    // 2. In-period Expenses (approved/paid expense transactions, includes paid salary & paid bills)
    const expenseAgg = await Transaction.aggregate([
      { $match: { type: 'expense', status: { $in: ['approved', 'paid'] }, date: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const totalExpenses = expenseAgg[0]?.total || 0;
    const expenseCount = expenseAgg[0]?.count || 0;

    // 3. Net Profit / Loss
    const netProfit = roundMoney(totalIncome - totalExpenses);

    // 4. Available Balance = Total Opening Balance + All-time Income - All-time Expenses
    const [allTimeIncomeAgg, allTimeExpenseAgg, bankAccounts] = await Promise.all([
      Transaction.aggregate([
        { $match: { type: 'revenue', status: { $in: ['approved', 'paid'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'expense', status: { $in: ['approved', 'paid'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      BankAccount.find({ status: 'active' }).lean(),
    ]);

    const allTimeIncome = allTimeIncomeAgg[0]?.total || 0;
    const allTimeExpense = allTimeExpenseAgg[0]?.total || 0;
    const totalOpeningBalance = bankAccounts.reduce((acc, b) => acc + (b.openingBalance || 0), 0);
    const availableBalance = roundMoney(totalOpeningBalance + allTimeIncome - allTimeExpense);

    // 5. Total Salary Paid (in period) & Pending Salary (all outstanding)
    const [salaryPaidAgg, salaryPendingAgg] = await Promise.all([
      Payroll.aggregate([
        { $match: { status: 'disbursed', paidOn: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$net' }, count: { $sum: 1 } } },
      ]),
      Payroll.aggregate([
        { $match: { status: { $in: ['draft', 'pending_approval', 'approved'] } } },
        { $group: { _id: null, total: { $sum: '$net' }, count: { $sum: 1 } } },
      ]),
    ]);
    const salaryPaid = salaryPaidAgg[0]?.total || 0;
    const salaryPaidCount = salaryPaidAgg[0]?.count || 0;
    const salaryPending = salaryPendingAgg[0]?.total || 0;
    const salaryPendingCount = salaryPendingAgg[0]?.count || 0;

    // 6. Pending Payments & Liabilities
    const [billsPayablePendingAgg, billsReceivablePendingAgg, invoicesPendingAgg] = await Promise.all([
      Bill.aggregate([
        { $match: { type: 'payable', paymentStatus: { $in: ['unpaid', 'partially_paid'] } } },
        { $group: { _id: null, total: { $sum: '$outstandingAmount' }, count: { $sum: 1 } } },
      ]),
      Bill.aggregate([
        { $match: { type: 'receivable', paymentStatus: { $in: ['unpaid', 'partially_paid'] } } },
        { $group: { _id: null, total: { $sum: '$outstandingAmount' }, count: { $sum: 1 } } },
      ]),
      Invoice.aggregate([
        { $match: { status: { $in: ['sent', 'partially_paid', 'overdue'] } } },
        {
          $project: {
            outstanding: { $subtract: ['$total', '$paid'] },
          },
        },
        { $group: { _id: null, total: { $sum: '$outstanding' }, count: { $sum: 1 } } },
      ]),
    ]);

    const pendingBillsPayable = billsPayablePendingAgg[0]?.total || 0;
    const pendingBillsReceivable = billsReceivablePendingAgg[0]?.total || 0;
    const pendingInvoicesReceivable = invoicesPendingAgg[0]?.total || 0;
    const totalPendingLiabilities = roundMoney(salaryPending + pendingBillsPayable);

    // 7. Category Breakdowns
    const [categoryExpenses, categoryIncome] = await Promise.all([
      Transaction.aggregate([
        { $match: { type: 'expense', status: { $in: ['approved', 'paid'] }, date: { $gte: start, $lte: end } } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'revenue', status: { $in: ['approved', 'paid'] }, date: { $gte: start, $lte: end } } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
    ]);

    // 8. Recent Activity
    const recentTransactions = await Transaction.find({ status: { $in: ['approved', 'paid'] } })
      .sort({ date: -1, createdAt: -1 })
      .limit(8)
      .populate('client', 'name company')
      .populate('vendor', 'name')
      .populate('employee', 'name email')
      .lean();

    const summaryPayload = {
        period,
        dateRange: { start, end },
        cards: {
          totalIncome,
          incomeCount,
          totalExpenses,
          expenseCount,
          netProfit,
          openingBalance: totalOpeningBalance,
          availableBalance,
          salaryPaid,
          salaryPaidCount,
          salaryPending,
          salaryPendingCount,
          pendingBillsPayable,
          pendingBillsReceivable,
          pendingInvoicesReceivable,
          totalPendingLiabilities,
        },
        bankAccounts,
        categoryBreakdown: {
          expense: categoryExpenses.map((c) => ({ category: c._id || 'Other', total: c.total, count: c.count })),
          income: categoryIncome.map((c) => ({ category: c._id || 'Other', total: c.total, count: c.count })),
        },
        recentTransactions,
      };

      memoryCache.set(cacheKey, summaryPayload, 20);
      res.json({
        success: true,
        data: summaryPayload,
      });
    }
  )
);

// ── Financial Reports Endpoint ───────────────────────
router.get(
  '/reports',
  authorize('finance_overview', 'read'),
  asyncHandler(async (req, res) => {
    const period = String(req.query.period || 'this_year');
    const { start, end } = getFinancePeriodRange(
      period,
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined
    );

    // 1. Monthly Trends
    const monthlyRaw = await Transaction.aggregate([
      {
        $match: {
          status: { $in: ['approved', 'paid'] },
          date: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            type: '$type',
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthMap = new Map<string, { month: string; income: number; expense: number; profit: number; count: number }>();
    for (const item of monthlyRaw) {
      const key = `${item._id.year}-${String(item._id.month).padStart(2, '0')}`;
      if (!monthMap.has(key)) {
        monthMap.set(key, { month: key, income: 0, expense: 0, profit: 0, count: 0 });
      }
      const m = monthMap.get(key)!;
      if (item._id.type === 'revenue') {
        m.income = roundMoney(m.income + item.total);
      } else {
        m.expense = roundMoney(m.expense + item.total);
      }
      m.count += item.count;
      m.profit = roundMoney(m.income - m.expense);
    }
    const monthlyTrends = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    // 2. Category distributions
    const [catExp, catInc, salaryMonthly, openBills] = await Promise.all([
      Transaction.aggregate([
        { $match: { type: 'expense', status: { $in: ['approved', 'paid'] }, date: { $gte: start, $lte: end } } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      Transaction.aggregate([
        { $match: { type: 'revenue', status: { $in: ['approved', 'paid'] }, date: { $gte: start, $lte: end } } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      Payroll.aggregate([
        { $match: { status: 'disbursed', paidOn: { $gte: start, $lte: end } } },
        { $group: { _id: '$period', total: { $sum: '$net' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Bill.aggregate([
        { $match: { paymentStatus: { $in: ['unpaid', 'partially_paid'] } } },
        {
          $group: {
            _id: '$type',
            totalOutstanding: { $sum: '$outstandingAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalIncomePeriod = catInc.reduce((s, c) => s + c.total, 0);
    const totalExpensePeriod = catExp.reduce((s, c) => s + c.total, 0);

    const categoryExpenses = catExp.map((c) => ({
      category: c._id || 'Other',
      total: c.total,
      count: c.count,
      pct: totalExpensePeriod > 0 ? Math.round((c.total / totalExpensePeriod) * 100) : 0,
    }));

    const categoryIncome = catInc.map((c) => ({
      category: c._id || 'Other',
      total: c.total,
      count: c.count,
      pct: totalIncomePeriod > 0 ? Math.round((c.total / totalIncomePeriod) * 100) : 0,
    }));

    res.json({
      success: true,
      data: {
        period,
        dateRange: { start, end },
        summary: {
          totalIncome: totalIncomePeriod,
          totalExpenses: totalExpensePeriod,
          netProfit: roundMoney(totalIncomePeriod - totalExpensePeriod),
          margin: totalIncomePeriod > 0 ? Math.round(((totalIncomePeriod - totalExpensePeriod) / totalIncomePeriod) * 100) : 0,
        },
        monthlyTrends,
        categoryExpenses,
        categoryIncome,
        salaryTrends: salaryMonthly.map((s) => ({ period: s._id, totalPaid: s.total, count: s.count })),
        openBillsSummary: openBills,
      },
    });
  })
);

router.get('/budgets', authorize('budgets', 'read'), asyncHandler(async (req, res) => {
  const data = await paginate(Budget, {}, req, 'project');
  res.json({ success: true, data });
}));

router.post('/budgets', authorize('budgets', 'create'), asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string(),
    category: z.string().optional(),
    project: z.string().optional(),
    period: z.string(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    planned: z.number().min(0),
    submit: z.boolean().optional(),
  }).parse(req.body);
  const budget = await Budget.create({
    ...body,
    actual: 0,
    status: body.submit ? 'pending' : 'draft',
    createdBy: req.user!.id,
  });
  if (body.submit) {
    const approval = await Approval.create({
      type: 'budget_allocation',
      refModel: 'Budget',
      refId: budget._id,
      amount: budget.planned,
      title: `Budget: ${budget.name}`,
      requestedBy: req.user!.id,
      status: 'pending',
      history: [{ action: 'submitted', by: req.user!.id, at: new Date() }],
    });
    budget.approval = approval._id;
    await budget.save();
  }
  res.status(201).json({ success: true, data: budget });
}));

export default router;
