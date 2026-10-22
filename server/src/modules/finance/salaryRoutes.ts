import { Router, Request, Response } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Payroll } from '../../models/Payroll.js';
import { User } from '../../models/User.js';
import { Transaction } from '../../models/Transaction.js';
import { BankAccount } from '../../models/BankAccount.js';
import { getSettings } from '../../models/Settings.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { roundMoney, addMoney, subMoney } from '../../utils/money.js';
import { adjustBankBalance } from '../../utils/bankLedger.js';
import { memoryCache } from '../../utils/cache.js';
import { format } from 'date-fns';

const router = Router();
router.use(authenticate);

// GET /api/v1/finance/salaries/records (List employee salary disbursements)
router.get(
  '/records',
  authorize('payroll', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};

    if (req.query.period) filter.period = String(req.query.period).trim();
    if (req.query.status) {
      if (req.query.status === 'paid' || req.query.status === 'disbursed') {
        filter.status = 'disbursed';
      } else if (req.query.status === 'pending' || req.query.status === 'approved') {
        filter.status = { $in: ['draft', 'pending_approval', 'approved'] };
      } else if (req.query.status !== 'all') {
        filter.status = req.query.status;
      }
    }
    if (req.query.employee) filter.employee = req.query.employee;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [records, total, summaryAgg, employeeIds] = await Promise.all([
      Payroll.find(filter)
        .populate('employee', 'name email employeeId designation department salary')
        .populate('createdBy', 'name email')
        .sort({ period: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payroll.countDocuments(filter),
      Payroll.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalPaid: {
              $sum: { $cond: [{ $eq: ['$status', 'disbursed'] }, '$net', 0] },
            },
            totalPending: {
              $sum: { $cond: [{ $ne: ['$status', 'disbursed'] }, '$net', 0] },
            },
            totalNet: { $sum: '$net' },
            paidCount: {
              $sum: { $cond: [{ $eq: ['$status', 'disbursed'] }, 1, 0] },
            },
            pendingCount: {
              $sum: { $cond: [{ $ne: ['$status', 'disbursed'] }, 1, 0] },
            },
          },
        },
      ]),
      Payroll.distinct('employee', filter),
    ]);

    const agg = summaryAgg[0] || {
      totalPaid: 0,
      totalPending: 0,
      totalNet: 0,
      paidCount: 0,
      pendingCount: 0,
    };

    res.json({
      success: true,
      data: {
        items: records,
        summary: {
          totalPaid: roundMoney(agg.totalPaid),
          totalPending: roundMoney(agg.totalPending),
          totalNet: roundMoney(agg.totalNet),
          paidCount: agg.paidCount,
          pendingCount: agg.pendingCount,
          totalEmployees: employeeIds.length,
        },
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      },
    });
  })
);

// POST /api/v1/finance/salaries/record-payment (Create or update salary record, mark paid, record transaction)
router.post(
  '/record-payment',
  authorize('payroll', 'create'),
  asyncHandler(async (req, res) => {
    if (!['ceo', 'finance'].includes(req.user!.role)) {
      throw new ForbiddenError('Only CEO and Finance can record salary payments');
    }

    const body = z
      .object({
        payrollId: z.string().optional(),
        employeeId: z.string().min(1),
        period: z.string().min(4), // e.g. "2026-10" or "October 2026"
        basicSalary: z.coerce.number().min(0),
        allowances: z.coerce.number().min(0).default(0),
        bonuses: z.coerce.number().min(0).default(0),
        deductions: z.coerce.number().min(0).default(0),
        paymentDate: z.coerce.date().default(() => new Date()),
        paymentMethod: z.string().default('Bank Transfer'),
        paymentStatus: z.enum(['pending', 'paid']).default('paid'),
        transactionRef: z.string().optional(),
        notes: z.string().optional(),
        bankAccountId: z.string().optional(),
      })
      .parse(req.body);

    const employee = await User.findById(body.employeeId);
    if (!employee) throw new NotFoundError('Employee not found');

    const basicSalary = roundMoney(body.basicSalary);
    const allowances = roundMoney(body.allowances);
    const bonuses = roundMoney(body.bonuses);
    const deductions = roundMoney(body.deductions);
    const netSalary = roundMoney(Math.max(0, basicSalary + allowances + bonuses - deductions));

    let payroll = body.payrollId ? await Payroll.findById(body.payrollId) : null;

    if (!payroll) {
      // Check if one already exists for this employee and period
      payroll = await Payroll.findOne({ employee: employee._id, period: body.period });
    }

    const isMarkingPaid = body.paymentStatus === 'paid';

    if (payroll) {
      payroll.base = basicSalary;
      payroll.stipend = allowances;
      payroll.incentive = bonuses;
      payroll.deductions = deductions;
      payroll.net = netSalary;
      payroll.notes = body.notes || payroll.notes;
      if (body.paymentMethod) payroll.paymentMethod = body.paymentMethod;
      if (body.transactionRef) payroll.transactionRef = body.transactionRef;
    } else {
      payroll = new Payroll({
        employee: employee._id,
        period: body.period,
        base: basicSalary,
        stipend: allowances,
        incentive: bonuses,
        deductions,
        net: netSalary,
        status: isMarkingPaid ? 'disbursed' : 'approved',
        paymentMethod: body.paymentMethod,
        transactionRef: body.transactionRef,
        notes: body.notes,
        createdBy: req.user!.id,
      });
    }

    // Accounting rule: When marked as paid, create or sync with a single Transaction
    let tx = null;
    if (isMarkingPaid) {
      payroll.status = 'disbursed';
      payroll.paidOn = body.paymentDate;

      // Determine bank account
      let bankAccount = null;
      if (body.bankAccountId) {
        bankAccount = await BankAccount.findById(body.bankAccountId);
      } else {
        bankAccount = await BankAccount.findOne({ isPrimary: true, status: 'active' });
      }

      if (payroll.transaction) {
        tx = await Transaction.findById(payroll.transaction);
      }

      const txDescription = `Salary payment for ${employee.name} (${body.period}) - Net: ₹${netSalary}`;

      if (tx) {
        if (bankAccount && tx.amount !== netSalary) {
          const diff = subMoney(netSalary, tx.amount);
          if (diff !== 0) {
            await adjustBankBalance({
              bankAccountId: String(bankAccount._id),
              amount: Math.abs(diff),
              direction: diff > 0 ? 'debit' : 'credit',
              preferPrimary: false,
            });
          }
        }
        tx.amount = netSalary;
        tx.date = body.paymentDate;
        tx.paymentMethod = body.paymentMethod;
        tx.status = 'paid';
        tx.description = txDescription;
        await tx.save();
      } else {
        tx = await Transaction.create({
          type: 'expense',
          category: 'Salary',
          amount: netSalary,
          currency: 'INR',
          date: body.paymentDate,
          title: `Salary: ${employee.name} (${body.period})`,
          description: txDescription,
          payroll: payroll._id,
          employee: employee._id,
          bankAccount: bankAccount?._id,
          paymentMethod: body.paymentMethod,
          status: 'paid',
          notes: body.transactionRef ? `Ref: ${body.transactionRef}` : undefined,
          createdBy: req.user!.id,
        });

        payroll.transaction = tx._id;

        if (bankAccount) {
          await adjustBankBalance({
            bankAccountId: String(bankAccount._id),
            amount: netSalary,
            direction: 'debit',
            preferPrimary: false,
          });
        }
      }
      memoryCache.delPrefix('finance');
    } else {
      payroll.status = 'approved';
      payroll.paidOn = undefined;
    }

    await payroll.save();

    await writeAudit({
      actor: req.user!.id,
      action: isMarkingPaid ? 'salary_disburse' : 'salary_update',
      entity: 'Payroll',
      entityId: payroll._id.toString(),
      after: {
        employeeName: employee.name,
        period: body.period,
        netSalary,
        status: payroll.status,
      },
      req,
    });

    res.json({
      success: true,
      data: {
        payroll,
        transaction: tx,
      },
    });
  })
);

// PATCH /api/v1/finance/salaries/:id — CEO-only update of salary components / status
router.patch(
  '/:id',
  requireRoles('ceo'),
  authorize('payroll', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        basicSalary: z.coerce.number().min(0).optional(),
        allowances: z.coerce.number().min(0).optional(),
        bonuses: z.coerce.number().min(0).optional(),
        deductions: z.coerce.number().min(0).optional(),
        period: z.string().min(4).optional(),
        paymentMethod: z.string().optional(),
        transactionRef: z.string().optional(),
        notes: z.string().optional(),
        paymentDate: z.coerce.date().optional(),
        paymentStatus: z.enum(['pending', 'paid']).optional(),
      })
      .parse(req.body);

    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) throw new NotFoundError('Payroll record not found');

    const before = {
      base: payroll.base,
      stipend: payroll.stipend,
      incentive: payroll.incentive,
      deductions: payroll.deductions,
      net: payroll.net,
      status: payroll.status,
    };

    if (body.basicSalary != null) payroll.base = roundMoney(body.basicSalary);
    if (body.allowances != null) payroll.stipend = roundMoney(body.allowances);
    if (body.bonuses != null) payroll.incentive = roundMoney(body.bonuses);
    if (body.deductions != null) payroll.deductions = roundMoney(body.deductions);
    if (body.period) payroll.period = body.period;
    if (body.paymentMethod !== undefined) payroll.paymentMethod = body.paymentMethod;
    if (body.transactionRef !== undefined) payroll.transactionRef = body.transactionRef;
    if (body.notes !== undefined) payroll.notes = body.notes;

    const newNet = roundMoney(
      Math.max(0, payroll.base + payroll.stipend + payroll.incentive - payroll.deductions)
    );
    const oldNet = before.net;
    const wasDisbursed = payroll.status === 'disbursed';

    payroll.net = newNet;

    if (body.paymentStatus === 'paid') {
      payroll.status = 'disbursed';
      payroll.paidOn = body.paymentDate || payroll.paidOn || new Date();
    } else if (body.paymentStatus === 'pending') {
      payroll.status = 'approved';
      payroll.paidOn = undefined;
    }

    // Keep linked expense + bank in sync for previously disbursed salaries
    if (wasDisbursed && payroll.transaction) {
      const tx = await Transaction.findById(payroll.transaction);
      if (tx && tx.status !== 'cancelled') {
        if (payroll.status !== 'disbursed') {
          // Revert paid → pending: credit bank for posted amount and cancel expense
          if (tx.bankAccount) {
            await adjustBankBalance({
              bankAccountId: String(tx.bankAccount),
              amount: tx.amount,
              direction: 'credit',
              preferPrimary: false,
            });
          }
          tx.status = 'cancelled';
        } else {
          // Still paid: adjust bank for net difference only
          const diff = subMoney(newNet, tx.amount);
          if (diff !== 0 && tx.bankAccount) {
            await adjustBankBalance({
              bankAccountId: String(tx.bankAccount),
              amount: Math.abs(diff),
              direction: diff > 0 ? 'debit' : 'credit',
              preferPrimary: false,
            });
          }
          tx.amount = newNet;
          tx.status = 'paid';
          if (body.paymentDate) tx.date = body.paymentDate;
          if (body.paymentMethod) tx.paymentMethod = body.paymentMethod;
        }
        await tx.save();
      }
    }

    await payroll.save();
    memoryCache.delPrefix('finance');

    await writeAudit({
      actor: req.user!.id,
      action: 'salary_update',
      entity: 'Payroll',
      entityId: payroll._id.toString(),
      before,
      after: payroll,
      req,
    });

    res.json({ success: true, data: payroll });
  })
);

// DELETE /api/v1/finance/salaries/:id — CEO-only; reverses bank/ledger if paid
router.delete(
  '/:id',
  requireRoles('ceo'),
  authorize('payroll', 'delete'),
  asyncHandler(async (req, res) => {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) throw new NotFoundError('Payroll record not found');

    if (payroll.status === 'disbursed' && payroll.transaction) {
      const tx = await Transaction.findById(payroll.transaction);
      if (tx) {
        if (tx.bankAccount && tx.status !== 'cancelled') {
          await adjustBankBalance({
            bankAccountId: String(tx.bankAccount),
            amount: tx.amount,
            direction: 'credit',
            preferPrimary: false,
          });
        }
        await Transaction.findByIdAndDelete(tx._id);
      }
    } else if (payroll.transaction) {
      await Transaction.findByIdAndDelete(payroll.transaction).catch(() => null);
    }

    await Payroll.findByIdAndDelete(payroll._id);
    memoryCache.delPrefix('finance');

    await writeAudit({
      actor: req.user!.id,
      action: 'salary_delete',
      entity: 'Payroll',
      entityId: String(req.params.id),
      before: payroll,
      req,
    });

    res.json({ success: true, data: { ok: true } });
  })
);

// GET /api/v1/finance/salaries/:id/slip (Generate Branded PDF Salary Slip)
router.get(
  '/:id/slip',
  authorize('payroll', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const payroll = await Payroll.findById(req.params.id)
      .populate('employee', 'name email employeeId designation department salary joiningDate')
      .populate('createdBy', 'name email');

    if (!payroll) throw new NotFoundError('Payroll record not found');

    const emp = payroll.employee as unknown as {
      name: string;
      email: string;
      employeeId?: string;
      designation?: string;
      department?: string;
    };

    const settings = await getSettings();
    const companyName = settings.company?.name || 'STAR MEDIA';

    const doc = new PDFDocument({ margin: 45, size: 'A4' });
    const filename = `SalarySlip_${(emp?.name || 'employee').replace(/\s+/g, '_')}_${payroll.period}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    doc.pipe(res);

    // Header styling
    doc.rect(40, 40, 515, 75).fill('#0f172a');
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text(companyName, 60, 55);
    doc.fontSize(10).font('Helvetica').fillColor('#94a3b8').text('MONTHLY SALARY SLIP & EARNINGS STATEMENT', 60, 80);
    doc.fillColor('#38bdf8').fontSize(11).font('Helvetica-Bold').text(`Period: ${payroll.period}`, 420, 68);

    doc.moveDown(3);

    // Employee & Payment Details Block
    const detailsTop = 135;
    doc.rect(40, detailsTop, 515, 85).strokeColor('#e2e8f0').lineWidth(1).stroke();

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569');
    doc.text('Employee Name:', 55, detailsTop + 12);
    doc.text('Employee ID:', 55, detailsTop + 28);
    doc.text('Department:', 55, detailsTop + 44);
    doc.text('Designation:', 55, detailsTop + 60);

    doc.font('Helvetica').fillColor('#0f172a');
    doc.text(emp?.name || '—', 145, detailsTop + 12);
    doc.text(emp?.employeeId || 'STAFF-' + payroll._id.toString().slice(-4).toUpperCase(), 145, detailsTop + 28);
    doc.text(emp?.department || 'Operations', 145, detailsTop + 44);
    doc.text(emp?.designation || 'Specialist', 145, detailsTop + 60);

    doc.font('Helvetica-Bold').fillColor('#475569');
    doc.text('Payment Status:', 320, detailsTop + 12);
    doc.text('Payment Date:', 320, detailsTop + 28);
    doc.text('Payment Mode:', 320, detailsTop + 44);
    doc.text('Reference No:', 320, detailsTop + 60);

    doc.font('Helvetica-Bold');
    doc.fillColor(payroll.status === 'disbursed' ? '#059669' : '#d97706');
    doc.text(payroll.status === 'disbursed' ? 'PAID' : 'PENDING', 410, detailsTop + 12);

    doc.font('Helvetica').fillColor('#0f172a');
    doc.text(payroll.paidOn ? format(new Date(payroll.paidOn), 'dd MMM yyyy') : '—', 410, detailsTop + 28);
    doc.text(payroll.paymentMethod || 'Bank Transfer', 410, detailsTop + 44);
    doc.text(payroll.transactionRef || 'TX-' + payroll._id.toString().slice(-6).toUpperCase(), 410, detailsTop + 60);

    // Earnings and Deductions Table
    const tableTop = 240;
    doc.rect(40, tableTop, 255, 25).fill('#f1f5f9');
    doc.rect(295, tableTop, 260, 25).fill('#f1f5f9');

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10);
    doc.text('EARNINGS', 55, tableTop + 8);
    doc.text('AMOUNT (INR)', 210, tableTop + 8);
    doc.text('DEDUCTIONS', 310, tableTop + 8);
    doc.text('AMOUNT (INR)', 465, tableTop + 8);

    let y = tableTop + 35;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');

    // Row 1: Basic & Deductions
    doc.text('Basic Salary', 55, y);
    doc.text(`₹ ${payroll.base.toLocaleString('en-IN')}`, 210, y);
    doc.text('Tax & Deductions', 310, y);
    doc.text(`₹ ${payroll.deductions.toLocaleString('en-IN')}`, 465, y);

    // Row 2: Allowances
    y += 20;
    doc.text('Allowances / Stipend', 55, y);
    doc.text(`₹ ${payroll.stipend.toLocaleString('en-IN')}`, 210, y);
    doc.text('—', 310, y);
    doc.text('—', 465, y);

    // Row 3: Bonuses / Incentives
    y += 20;
    doc.text('Bonuses & Incentives', 55, y);
    doc.text(`₹ ${payroll.incentive.toLocaleString('en-IN')}`, 210, y);
    doc.text('—', 310, y);
    doc.text('—', 465, y);

    // Table divider line
    y += 25;
    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, y).lineTo(555, y).stroke();

    // Gross & Total Deductions
    y += 10;
    const grossEarnings = payroll.base + payroll.stipend + payroll.incentive;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
    doc.text('Gross Earnings:', 55, y);
    doc.text(`₹ ${grossEarnings.toLocaleString('en-IN')}`, 210, y);
    doc.text('Total Deductions:', 310, y);
    doc.text(`₹ ${payroll.deductions.toLocaleString('en-IN')}`, 465, y);

    // Net Salary Highlight Box
    y += 30;
    doc.rect(40, y, 515, 55).fill('#ecfdf5');
    doc.rect(40, y, 515, 55).strokeColor('#10b981').lineWidth(1.5).stroke();

    doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(11);
    doc.text('NET SALARY PAYABLE:', 60, y + 20);
    doc.fontSize(16).fillColor('#047857');
    doc.text(`INR ₹ ${payroll.net.toLocaleString('en-IN')}`, 320, y + 17);

    // Footer & Signatures
    const footerTop = 480;
    doc.fontSize(9).font('Helvetica').fillColor('#64748b');
    doc.text('This is a computer-generated salary slip and requires no physical stamp if transmitted digitally.', 40, footerTop, { align: 'center', width: 515 });

    doc.strokeColor('#94a3b8').lineWidth(1).moveTo(80, footerTop + 90).lineTo(220, footerTop + 90).stroke();
    doc.moveTo(375, footerTop + 90).lineTo(515, footerTop + 90).stroke();

    doc.fontSize(9).font('Helvetica').fillColor('#475569');
    doc.text('Employee Signature', 80, footerTop + 98, { align: 'center', width: 140 });
    doc.text('Authorized Signatory (CEO)', 375, footerTop + 98, { align: 'center', width: 140 });

    doc.end();
  })
);

export default router;
