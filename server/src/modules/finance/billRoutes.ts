import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { upload, publicUploadPath } from '../../middleware/upload.js';
import { Bill, IBill } from '../../models/Bill.js';
import { Transaction } from '../../models/Transaction.js';
import { BankAccount } from '../../models/BankAccount.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/AppError.js';
import { writeAudit } from '../../utils/audit.js';
import { paginate } from '../../utils/pagination.js';
import { roundMoney, addMoney, subMoney } from '../../utils/money.js';
import { startOfDay, endOfDay } from 'date-fns';
import { flexibleDateSchema, flexibleDateSchemaOptional } from './routes.js';

const router = Router();
router.use(authenticate);

async function generateBillNumber(type: 'payable' | 'receivable'): Promise<string> {
  const prefix = type === 'payable' ? 'BILL' : 'REC';
  const year = new Date().getFullYear();
  const count = await Bill.countDocuments({
    type,
    createdAt: { $gte: new Date(year, 0, 1) },
  });
  return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
}

// GET /api/v1/finance/bills
router.get(
  '/',
  authorize('invoices', 'read'),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};

    const pType = String(req.query.type || '');
    if (pType && pType !== 'all') filter.type = pType;

    const pStatus = String(req.query.paymentStatus || req.query.status || '');
    if (pStatus && pStatus !== 'all') filter.paymentStatus = pStatus;

    const pCat = String(req.query.category || '');
    if (pCat && pCat !== 'all') filter.category = pCat;

    if (req.query.search) {
      const q = String(req.query.search).trim();
      filter.$or = [
        { billNumber: { $regex: q, $options: 'i' } },
        { title: { $regex: q, $options: 'i' } },
        { partyName: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
      ];
    }

    const fromDate = (req.query.from || req.query.startDate) as string | undefined;
    const toDate = (req.query.to || req.query.endDate) as string | undefined;
    if (fromDate || toDate) {
      const dateFilter: Record<string, unknown> = {};
      if (fromDate) dateFilter.$gte = startOfDay(new Date(fromDate));
      if (toDate) dateFilter.$lte = endOfDay(new Date(toDate));
      filter.billDate = dateFilter;
    }

    const data = await paginate(Bill, filter, req, ['client', 'vendor', 'createdBy']);

    // Summary calculation for bills
    const [payableStats, receivableStats] = await Promise.all([
      Bill.aggregate([
        { $match: { type: 'payable', paymentStatus: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: null,
            totalPayable: { $sum: '$totalAmount' },
            paidPayable: { $sum: '$paidAmount' },
            outstandingPayable: { $sum: '$outstandingAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
      Bill.aggregate([
        { $match: { type: 'receivable', paymentStatus: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: null,
            totalReceivable: { $sum: '$totalAmount' },
            paidReceivable: { $sum: '$paidAmount' },
            outstandingReceivable: { $sum: '$outstandingAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        ...data,
        summary: {
          payable: payableStats[0] || {
            totalPayable: 0,
            paidPayable: 0,
            outstandingPayable: 0,
            count: 0,
          },
          receivable: receivableStats[0] || {
            totalReceivable: 0,
            paidReceivable: 0,
            outstandingReceivable: 0,
            count: 0,
          },
        },
      },
    });
  })
);

// GET /api/v1/finance/bills/:id
router.get(
  '/:id',
  authorize('invoices', 'read'),
  asyncHandler(async (req, res) => {
    const bill = await Bill.findById(req.params.id)
      .populate('client')
      .populate('vendor')
      .populate('createdBy', 'name email role')
      .populate('payments.recordedBy', 'name email');

    if (!bill) throw new NotFoundError('Bill not found');
    res.json({ success: true, data: bill });
  })
);

// POST /api/v1/finance/bills (Create new Bill with optional file attachment)
router.post(
  '/',
  authorize('invoices', 'create'),
  upload.single('attachment'),
  asyncHandler(async (req: Request, res: Response) => {
    const rawData = req.body.data ? JSON.parse(req.body.data) : req.body;

    const schema = z.object({
      title: z.string().trim().optional().nullable(),
      billNumber: z.string().trim().optional().nullable(),
      type: z.enum(['payable', 'receivable']),
      partyName: z.string().trim().optional().nullable(),
      clientName: z.string().trim().optional().nullable(),
      vendorName: z.string().trim().optional().nullable(),
      client: z.string().optional().nullable(),
      vendor: z.string().optional().nullable(),
      category: z.string().trim().optional().nullable(),
      amount: z.coerce.number().positive(),
      taxAmount: z.coerce.number().default(0),
      billDate: flexibleDateSchema,
      dueDate: flexibleDateSchemaOptional,
      description: z.string().optional().nullable(),
      paymentMethod: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      documentHash: z.string().optional().nullable(),
      scannedDocument: z.string().optional().nullable(),
      documentMetadata: z.record(z.unknown()).optional().nullable(),
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
    });

    const parsed = schema.parse(rawData);

    const partyName =
      parsed.partyName?.trim() ||
      parsed.clientName?.trim() ||
      parsed.vendorName?.trim() ||
      (parsed.type === 'receivable' ? 'Client' : 'Vendor');

    const category = parsed.category?.trim() || (parsed.type === 'receivable' ? 'Client Payment' : 'Office Expenses');
    const title = parsed.title?.trim() || `${partyName} - ${category}`;
    const amount = roundMoney(parsed.amount);
    const taxAmount = roundMoney(parsed.taxAmount || 0);
    const totalAmount = addMoney(amount, taxAmount);
    const billNumber = parsed.billNumber?.trim() || (await generateBillNumber(parsed.type));
    const billDate = parsed.billDate;
    const dueDate = parsed.dueDate || new Date(billDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Handle uploaded attachment if present
    let attachment: IBill['attachment'] = undefined;
    if (parsed.attachment) {
      attachment = {
        name: parsed.attachment.name,
        url: parsed.attachment.url,
        mime: parsed.attachment.mime || undefined,
        size: parsed.attachment.size || undefined,
        hash: parsed.attachment.hash || undefined,
      };
    }
    if (req.file) {
      attachment = {
        name: req.file.originalname,
        url: publicUploadPath(req.file.filename),
        mime: req.file.mimetype,
        size: req.file.size,
      };
    }

    const bill = await Bill.create({
      title,
      billNumber,
      type: parsed.type,
      partyName,
      client: parsed.client?.trim() || undefined,
      vendor: parsed.vendor?.trim() || undefined,
      category,
      amount,
      taxAmount,
      totalAmount,
      paidAmount: 0,
      outstandingAmount: totalAmount,
      billDate,
      dueDate,
      description: parsed.description?.trim(),
      paymentStatus: 'unpaid',
      paymentMethod: parsed.paymentMethod?.trim() || 'Bank Transfer',
      notes: parsed.notes?.trim(),
      documentHash: parsed.documentHash || attachment?.hash,
      scannedDocument: parsed.scannedDocument?.trim() || undefined,
      documentMetadata: parsed.documentMetadata || undefined,
      attachment,
      payments: [],
      createdBy: req.user!.id,
    });

    // If linked to a ScannedDocument, update its status
    if (parsed.scannedDocument) {
      await import('../../models/ScannedDocument.js')
        .then(({ ScannedDocument }) =>
          ScannedDocument.findByIdAndUpdate(parsed.scannedDocument, {
            status: 'confirmed',
            linkedBill: bill._id,
          })
        )
        .catch(() => null);
    }

    await writeAudit({
      actor: req.user!.id,
      action: 'create',
      entity: 'Bill',
      entityId: bill._id.toString(),
      after: bill,
      req,
    });

    res.status(201).json({ success: true, data: bill });
  })
);

// PATCH /api/v1/finance/bills/:id
router.patch(
  '/:id',
  authorize('invoices', 'update'),
  upload.single('attachment'),
  asyncHandler(async (req: Request, res: Response) => {
    const rawData = req.body.data ? JSON.parse(req.body.data) : req.body;

    const schema = z.object({
      title: z.string().trim().optional().nullable(),
      partyName: z.string().trim().optional().nullable(),
      category: z.string().trim().optional().nullable(),
      amount: z.coerce.number().positive().optional().nullable(),
      taxAmount: z.coerce.number().optional().nullable(),
      billDate: flexibleDateSchemaOptional,
      dueDate: flexibleDateSchemaOptional,
      description: z.string().optional().nullable(),
      paymentMethod: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      paymentStatus: z.enum(['unpaid', 'partially_paid', 'paid', 'cancelled']).optional().nullable(),
    });

    const parsed = schema.parse(rawData);

    const bill = await Bill.findById(req.params.id);
    if (!bill) throw new NotFoundError('Bill not found');

    if (bill.paymentStatus === 'cancelled' && req.user!.role !== 'ceo') {
      throw new ForbiddenError('Only CEO can edit a cancelled bill');
    }

    if (parsed.title) bill.title = parsed.title;
    if (parsed.partyName) bill.partyName = parsed.partyName;
    if (parsed.category) bill.category = parsed.category;
    if (parsed.billDate) bill.billDate = parsed.billDate;
    if (parsed.dueDate) bill.dueDate = parsed.dueDate;
    if (parsed.description !== undefined) bill.description = parsed.description || undefined;
    if (parsed.paymentMethod !== undefined) bill.paymentMethod = parsed.paymentMethod || undefined;
    if (parsed.notes !== undefined) bill.notes = parsed.notes || undefined;

    if (parsed.amount != null || parsed.taxAmount != null) {
      if (bill.payments.length > 0 && req.user!.role !== 'ceo') {
        throw new AppError('Cannot modify amount on a bill with recorded payments', 400);
      }
      const newAmount = parsed.amount != null ? roundMoney(parsed.amount) : bill.amount;
      const newTax = parsed.taxAmount != null ? roundMoney(parsed.taxAmount) : bill.taxAmount;
      bill.amount = newAmount;
      bill.taxAmount = newTax;
      bill.totalAmount = addMoney(newAmount, newTax);
      bill.outstandingAmount = subMoney(bill.totalAmount, bill.paidAmount);
      if (bill.outstandingAmount <= 0) {
        bill.paymentStatus = 'paid';
      } else if (bill.paidAmount > 0) {
        bill.paymentStatus = 'partially_paid';
      } else {
        bill.paymentStatus = 'unpaid';
      }
    }

    if (parsed.paymentStatus) {
      bill.paymentStatus = parsed.paymentStatus;
    }

    if (req.file) {
      bill.attachment = {
        name: req.file.originalname,
        url: publicUploadPath(req.file.filename),
        mime: req.file.mimetype,
        size: req.file.size,
      };
    }

    await bill.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'update',
      entity: 'Bill',
      entityId: bill._id.toString(),
      after: bill,
      req,
    });

    res.json({ success: true, data: bill });
  })
);

// POST /api/v1/finance/bills/:id/payments (Record Partial or Full Payment)
router.post(
  '/:id/payments',
  authorize('invoices', 'update'),
  upload.single('receipt'),
  asyncHandler(async (req: Request, res: Response) => {
    const rawData = req.body.data ? JSON.parse(req.body.data) : req.body;

    const schema = z.object({
      amount: z.coerce.number().positive(),
      date: flexibleDateSchema.default(() => new Date()),
      method: z.string().default('Bank Transfer'),
      note: z.string().optional().nullable(),
      bankAccountId: z.string().optional().nullable(),
    });

    const parsed = schema.parse(rawData);
    const paymentAmount = roundMoney(parsed.amount);

    const bill = await Bill.findById(req.params.id);
    if (!bill) throw new NotFoundError('Bill not found');

    if (bill.paymentStatus === 'cancelled') {
      throw new AppError('Cannot record payment for a cancelled bill', 400);
    }

    if (paymentAmount > bill.outstandingAmount + 0.01) {
      throw new AppError(
        `Payment amount (₹${paymentAmount}) exceeds outstanding bill amount (₹${bill.outstandingAmount})`,
        400
      );
    }

    let receiptUrl: string | undefined;
    if (req.file) {
      receiptUrl = publicUploadPath(req.file.filename);
    }

    // Determine corresponding bank account
    let bankAccount = null;
    if (parsed.bankAccountId) {
      bankAccount = await BankAccount.findById(parsed.bankAccountId);
    } else {
      bankAccount = await BankAccount.findOne({ isPrimary: true, status: 'active' });
    }

    // Create an official Transaction entry for cash-basis accounting:
    // Payable bill paid -> Cash Expense
    // Receivable bill collected -> Cash Revenue
    const isPayable = bill.type === 'payable';
    const txType = isPayable ? 'expense' : 'revenue';

    const tx = await Transaction.create({
      type: txType,
      category: bill.category || (isPayable ? 'Vendor Payment' : 'Client Payment'),
      amount: paymentAmount,
      currency: 'INR',
      date: parsed.date,
      title: `${isPayable ? 'Bill Payment' : 'Bill Collection'}: ${bill.title} (${bill.billNumber})`,
      description: parsed.note || `Payment against ${bill.type} ${bill.billNumber} (${bill.partyName})`,
      bill: bill._id,
      client: bill.client,
      vendor: bill.vendor,
      bankAccount: bankAccount?._id,
      paymentMethod: parsed.method,
      status: 'paid',
      receipt: receiptUrl ? { name: req.file?.originalname || 'receipt', url: receiptUrl } : undefined,
      notes: `Bill: ${bill.billNumber} | Party: ${bill.partyName}`,
      createdBy: req.user!.id,
    });

    // Adjust bank account balance safely
    if (bankAccount) {
      if (isPayable) {
        bankAccount.balance = subMoney(bankAccount.balance, paymentAmount);
      } else {
        bankAccount.balance = addMoney(bankAccount.balance, paymentAmount);
      }
      await bankAccount.save();
    }

    // Update bill payment array & outstanding balance
    bill.payments.push({
      amount: paymentAmount,
      date: parsed.date,
      method: parsed.method,
      note: parsed.note || undefined,
      transaction: tx._id,
      receiptUrl,
      recordedBy: req.user!.id as unknown as import('mongoose').Types.ObjectId,
    });

    bill.paidAmount = roundMoney(addMoney(bill.paidAmount, paymentAmount));
    bill.outstandingAmount = roundMoney(Math.max(0, subMoney(bill.totalAmount, bill.paidAmount)));

    if (bill.outstandingAmount <= 0) {
      bill.paymentStatus = 'paid';
    } else {
      bill.paymentStatus = 'partially_paid';
    }

    await bill.save();

    await writeAudit({
      actor: req.user!.id,
      action: 'payment',
      entity: 'Bill',
      entityId: bill._id.toString(),
      after: {
        paymentAmount,
        outstandingRemaining: bill.outstandingAmount,
        transactionId: tx._id,
      },
      req,
    });

    res.json({
      success: true,
      data: {
        bill,
        transaction: tx,
      },
    });
  })
);

// DELETE /api/v1/finance/bills/:id (Cancels or deletes safely)
router.delete(
  '/:id',
  authorize('invoices', 'delete'),
  asyncHandler(async (req, res) => {
    const bill = await Bill.findById(req.params.id);
    if (!bill) throw new NotFoundError('Bill not found');

    if (bill.payments.length > 0 && req.user!.role !== 'ceo') {
      throw new ForbiddenError(
        'This bill has recorded payments. Only CEO can cancel or reverse paid bills.'
      );
    }

    if (bill.payments.length > 0) {
      // Soft cancel to preserve accounting audit
      bill.paymentStatus = 'cancelled';
      await bill.save();
      await writeAudit({
        actor: req.user!.id,
        action: 'cancel',
        entity: 'Bill',
        entityId: bill._id.toString(),
        before: bill,
        req,
      });
      return res.json({ success: true, message: 'Bill marked as cancelled', data: bill });
    }

    // If completely unpaid, safely delete
    await Bill.findByIdAndDelete(req.params.id);

    await writeAudit({
      actor: req.user!.id,
      action: 'delete',
      entity: 'Bill',
      entityId: req.params.id,
      before: bill,
      req,
    });

    res.json({ success: true, data: { ok: true } });
  })
);

export default router;
