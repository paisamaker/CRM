import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env.js';
import { uploadDocumentToCloudinary } from '../../utils/cloudinary.js';
import { publicUploadPath } from '../../middleware/upload.js';
import { ScannedDocument, type IExtractedFinancialData } from '../../models/ScannedDocument.js';
import { Transaction, EXPENSE_CATEGORIES, REVENUE_CATEGORIES } from '../../models/Transaction.js';
import { Bill } from '../../models/Bill.js';
import { AppError } from '../../utils/AppError.js';
import { createWorker } from 'tesseract.js';

export interface DuplicateMatchInfo {
  id: string;
  type: 'transaction' | 'bill' | 'scan';
  title?: string;
  billNumber?: string;
  invoiceNumber?: string;
  amount?: number;
  date?: string;
  vendorName?: string;
}

export interface ScanResult {
  scanId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  documentHash: string;
  extractedData: IExtractedFinancialData;
  isDuplicate: boolean;
  duplicateMatch?: DuplicateMatchInfo;
  duplicateWarning?: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'tesseract' | 'pdf-parse' | 'heuristic';
}

/**
 * Compute SHA-256 hash of file buffer for idempotency and duplicate detection.
 */
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Check if the document has already been processed or matches an existing transaction or bill.
 */
export async function checkDuplicateDocument(
  hash: string,
  invoiceNumber?: string | null,
  amount?: number | null,
  vendorName?: string | null
): Promise<{ isDuplicate: boolean; duplicateMatch?: DuplicateMatchInfo; warning?: string }> {
  // 1. Direct Content Hash Match in Transactions
  const existingTxByHash = await Transaction.findOne({
    $or: [{ 'attachment.hash': hash }, { documentHash: hash }],
  }).select('_id title invoiceNumber amount date type category').lean();

  if (existingTxByHash) {
    return {
      isDuplicate: true,
      duplicateMatch: {
        id: existingTxByHash._id.toString(),
        type: 'transaction',
        title: existingTxByHash.title,
        invoiceNumber: existingTxByHash.invoiceNumber,
        amount: existingTxByHash.amount,
        date: existingTxByHash.date?.toISOString().slice(0, 10),
      },
      warning: `This exact document was already recorded as a transaction (${existingTxByHash.title || 'Transaction'} - ₹${existingTxByHash.amount}).`,
    };
  }

  // 2. Direct Content Hash Match in Bills
  const existingBillByHash = await Bill.findOne({
    $or: [{ 'attachment.hash': hash }, { documentHash: hash }],
  }).select('_id title billNumber totalAmount billDate partyName').lean();

  if (existingBillByHash) {
    return {
      isDuplicate: true,
      duplicateMatch: {
        id: existingBillByHash._id.toString(),
        type: 'bill',
        title: existingBillByHash.title,
        billNumber: existingBillByHash.billNumber,
        amount: existingBillByHash.totalAmount,
        date: existingBillByHash.billDate?.toISOString().slice(0, 10),
        vendorName: existingBillByHash.partyName,
      },
      warning: `This exact document was already uploaded as Bill #${existingBillByHash.billNumber} (${existingBillByHash.partyName} - ₹${existingBillByHash.totalAmount}).`,
    };
  }

  // 3. Invoice Number & Amount Match (logical duplicate check)
  if (invoiceNumber && invoiceNumber.trim().length >= 3 && amount && amount > 0) {
    const cleanInv = invoiceNumber.trim();
    const existingTxByInv = await Transaction.findOne({
      invoiceNumber: { $regex: new RegExp(`^${cleanInv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      amount: { $gte: amount - 1, $lte: amount + 1 },
    }).select('_id title invoiceNumber amount date').lean();

    if (existingTxByInv) {
      return {
        isDuplicate: true,
        duplicateMatch: {
          id: existingTxByInv._id.toString(),
          type: 'transaction',
          title: existingTxByInv.title,
          invoiceNumber: existingTxByInv.invoiceNumber,
          amount: existingTxByInv.amount,
          date: existingTxByInv.date?.toISOString().slice(0, 10),
        },
        warning: `An existing transaction matches Invoice #${invoiceNumber} for ₹${amount}.`,
      };
    }

    const existingBillByInv = await Bill.findOne({
      billNumber: { $regex: new RegExp(`^${cleanInv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      totalAmount: { $gte: amount - 1, $lte: amount + 1 },
    }).select('_id title billNumber totalAmount billDate partyName').lean();

    if (existingBillByInv) {
      return {
        isDuplicate: true,
        duplicateMatch: {
          id: existingBillByInv._id.toString(),
          type: 'bill',
          title: existingBillByInv.title,
          billNumber: existingBillByInv.billNumber,
          amount: existingBillByInv.totalAmount,
          date: existingBillByInv.billDate?.toISOString().slice(0, 10),
          vendorName: existingBillByInv.partyName,
        },
        warning: `An existing bill matches Invoice #${invoiceNumber} for ₹${amount}.`,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Extract plain text from digital PDFs using pdf-parse.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  let parser: any = null;
  try {
    const pdfMod: any = await import('pdf-parse');
    if (pdfMod.PDFParse) {
      parser = new pdfMod.PDFParse({ data: buffer });
      const textResult = await parser.getText();
      return textResult.text || '';
    }
    if (typeof pdfMod.default === 'function') {
      const res = await pdfMod.default(buffer);
      return res.text || '';
    }
    return '';
  } catch (err) {
    console.warn('[DocumentScanner] PDF text extraction failed:', err);
    return '';
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      await parser.destroy().catch(() => null);
    }
  }
}

/**
 * Extract text from images using tesseract.js worker.
 */
export async function extractTextFromImageOCR(filePathOrBuffer: string | Buffer): Promise<string> {
  let worker;
  try {
    worker = await createWorker('eng');
    const { data } = await worker.recognize(filePathOrBuffer);
    return data.text || '';
  } catch (err) {
    console.warn('[DocumentScanner] Tesseract OCR failed:', err);
    return '';
  } finally {
    if (worker) {
      await worker.terminate().catch(() => null);
    }
  }
}

/** Extract net salary + employee from payslip text (PDFKit often splits label/value lines). */
export function extractPayslipFields(
  rawText: string,
  fileName?: string
): { net: number | null; employeeName: string | null; period: string | null } {
  const text = rawText || '';
  const collapsed = text.replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n');

  // Prefer filename: Payslip_sahil_bhagat_2026-10.pdf
  let employeeName: string | null = null;
  if (fileName) {
    const fromFile = fileName
      .replace(/\.[^.]+$/, '')
      .replace(/^(payslip|salary[_-]?slip|salary)[_-]*/i, '')
      .replace(/[_-]*\d{4}-\d{2}.*$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    if (
      fromFile.length >= 3 &&
      !/^(document|scan|bill|invoice|employee|id)$/i.test(fromFile) &&
      !/^employee\s*id$/i.test(fromFile)
    ) {
      employeeName = fromFile.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  // Avoid capturing the next label ("Employee ID") when PDF columns are flattened
  const empPatterns = [
    /employee\s*name\s*[:\-]?\s*([A-Za-z][A-Za-z]+(?:\s+[A-Za-z][A-Za-z]+){0,3})(?=\s*(?:employee\s*id|department|designation|payment|\n|$))/i,
    /employee\s*name\s*[:\-]?\s*\n\s*([A-Za-z][A-Za-z]+(?:\s+[A-Za-z]+){0,3})/i,
  ];
  for (const pat of empPatterns) {
    const m = collapsed.match(pat) || text.match(pat);
    if (m?.[1] && !/^(employee|id|department|designation|payment|status)$/i.test(m[1].trim())) {
      employeeName = m[1].replace(/\s+/g, ' ').trim();
      break;
    }
  }

  const periodMatch =
    text.match(/(?:period|month)\s*[:\-]?\s*((?:20\d{2}[-/]\d{1,2})|(?:[A-Za-z]{3,9}[\s,-]*20\d{2}))/i) ||
    (fileName || '').match(/(20\d{2}-\d{2})/);
  const period = periodMatch?.[1]?.trim() || null;

  // Net salary: allow amount on same or following lines (PDFKit layout)
  const netPatterns = [
    /net\s*salary(?:\s*payable)?\s*[:\-]?\s*(?:inr)?\s*(?:₹|rs\.?)?\s*([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]{3,}(?:\.[0-9]{1,2})?)/i,
    /net\s*salary(?:\s*payable)?[\s\S]{0,80}?(?:inr\s*)?(?:₹|rs\.?)?\s*([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]{3,}(?:\.[0-9]{1,2})?)/i,
    /(?:net\s*pay|take\s*home(?:\s*pay)?)\s*[:\-]?\s*(?:inr)?\s*(?:₹|rs\.?)?\s*([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]{3,})/i,
    /basic\s*salary[\s\S]{0,40}?(?:₹|rs\.?)?\s*([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]{3,})/i,
  ];

  let net: number | null = null;
  for (const pat of netPatterns) {
    const m = text.match(pat);
    if (m?.[1]) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      // Ignore day-of-month noise (1–31) and tiny values for salary
      if (!isNaN(n) && n >= 100) {
        net = Math.round(n * 100) / 100;
        break;
      }
    }
  }

  // Last resort: largest ₹ amount on the page that looks like salary (>= 500)
  if (net == null) {
    const amounts: number[] = [];
    for (const m of text.matchAll(/(?:₹|rs\.?|inr)\s*([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]{3,}(?:\.[0-9]{1,2})?)/gi)) {
      const n = parseFloat((m[1] || '').replace(/,/g, ''));
      if (!isNaN(n) && n >= 500) amounts.push(n);
    }
    if (amounts.length) net = Math.max(...amounts);
  }

  return { net, employeeName, period };
}

/**
 * Parse raw extracted text using comprehensive financial regex and heuristics.
 */
export function parseFinancialTextWithHeuristics(rawText: string, fileName?: string): IExtractedFinancialData {
  const text = rawText || '';
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const uncertainFields: string[] = [];
  const confidence: Record<string, 'high' | 'medium' | 'low'> = {};

  // 1. GSTIN Patterns (Indian standard 15-character format)
  const gstinRegex = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/gi;
  const gstins = [...text.matchAll(gstinRegex)].map((m) => m[1].toUpperCase());
  const vendorGstin = gstins[0] || null;
  const customerGstin = gstins.length > 1 ? gstins[1] : null;

  // 2. Invoice / Bill / Receipt Number
  const invoiceNumPatterns = [
    /(?:inv\s*(?:no|number|#)|invoice\s*(?:no|number|#)|bill\s*(?:no|number|#)|receipt\s*(?:no|number|#)|tax\s*invoice\s*(?:no|number|#))[:.\s#-]*([A-Za-z0-9\-_/]{2,30})/i,
    /(?:invoice|inv|bill|receipt|ref)\s*[:#]\s*([A-Za-z0-9\-_/]{2,30})/i,
    /#\s*([A-Za-z0-9\-_/]{3,20})/i,
  ];

  let invoiceNumber: string | null = null;
  for (const pat of invoiceNumPatterns) {
    const match = text.match(pat);
    if (match && match[1] && !/^(date|total|amount|inr|rs|gst|tax|gstin|invoice|receipt|bill|number|no|details)$/i.test(match[1])) {
      invoiceNumber = match[1].trim();
      break;
    }
  }

  // 3. Dates (Document Date & Due Date)
  const datePatterns = [
    // 14/10/2026 or 14-10-2026 or 14.10.2026
    /\b(0?[1-9]|[12][0-9]|3[01])[/\-.](0?[1-9]|1[012])[/\-.](20\d\d)\b/,
    // 2026-10-14
    /\b(20\d\d)[/\-.](0?[1-9]|1[012])[/\-.](0?[1-9]|[12][0-9]|3[01])\b/,
    // 14 Oct 2026 or 14 October 2026
    /\b(0?[1-9]|[12][0-9]|3[01])\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d\d)\b/i,
  ];

  function parseDateString(dStr: string): string | null {
    try {
      const trimmed = dStr.trim();
      const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
      if (dmy) {
        const day = parseInt(dmy[1], 10);
        const month = parseInt(dmy[2], 10) - 1;
        const year = parseInt(dmy[3], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2040) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
      }
      const d = new Date(trimmed);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2040) {
        return d.toISOString().slice(0, 10);
      }
    } catch {
      // ignore
    }
    return null;
  }

  let documentDate: string | null = null;
  let dueDate: string | null = null;

  for (const line of lines) {
    if (/(?:due\s*date|payment\s*due|pay\s*by)[:.\s]/i.test(line)) {
      for (const pat of datePatterns) {
        const m = line.match(pat);
        if (m) {
          const parsed = parseDateString(m[0]);
          if (parsed) {
            dueDate = parsed;
            break;
          }
        }
      }
    } else if (/(?:invoice\s*date|bill\s*date|date\s*of\s*issue|dated|date)[:.\s]/i.test(line)) {
      if (!documentDate) {
        for (const pat of datePatterns) {
          const m = line.match(pat);
          if (m) {
            const parsed = parseDateString(m[0]);
            if (parsed) {
              documentDate = parsed;
              break;
            }
          }
        }
      }
    }
  }

  // Fallback to first valid date in text if document date not found
  if (!documentDate) {
    for (const pat of datePatterns) {
      const m = text.match(pat);
      if (m) {
        const parsed = parseDateString(m[0]);
        if (parsed) {
          documentDate = parsed;
          break;
        }
      }
    }
  }

  // 4. Financial Amounts (invoices + UPI / GPay / PhonePe success screens)
  function cleanAmount(raw: string): number | null {
    if (!raw) return null;
    // Handle Indian numbering: 1,23,456.78 or 1,234.56
    const sanitized = raw.replace(/[^\d.]/g, '');
    if (!sanitized || sanitized === '.') return null;
    const num = parseFloat(sanitized);
    // Ignore year-like and tiny noise values
    if (isNaN(num) || num <= 0 || num > 100_000_000) return null;
    if (num >= 1900 && num <= 2100 && !String(raw).includes('.')) return null;
    return Math.round(num * 100) / 100;
  }

  function extractRupeeAmounts(source: string): number[] {
    const found: number[] = [];
    const patterns = [
      /(?:₹|rs\.?|inr)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi,
      /([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?)\s*(?:₹|rs\.?|inr)?/gi,
    ];
    for (const pat of patterns) {
      for (const m of source.matchAll(pat)) {
        const val = cleanAmount(m[1] || m[0]);
        if (val !== null) found.push(val);
      }
    }
    return found;
  }

  let grandTotal: number | null = null;
  let subtotal: number | null = null;
  let totalTax: number | null = null;
  let cgst: number | null = null;
  let sgst: number | null = null;
  let igst: number | null = null;
  let discount: number | null = null;
  let amountPaid: number | null = null;
  let outstandingAmount: number | null = null;

  const totalMatches: number[] = [];
  const upiAmountMatches: number[] = [];

  for (const line of lines) {
    // Payslip net salary (highest priority for salary slips)
    if (
      /(?:net\s*salary(?:\s*payable)?|net\s*pay|take\s*home(?:\s*pay)?|net\s*earnings)[:\s]*(?:inr|₹|rs\.?)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.test(
        line
      )
    ) {
      const match = line.match(
        /(?:net\s*salary(?:\s*payable)?|net\s*pay|take\s*home(?:\s*pay)?|net\s*earnings)[:\s]*(?:inr|₹|rs\.?)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
      );
      if (match?.[1]) {
        const val = cleanAmount(match[1]);
        if (val !== null && val > 0) totalMatches.push(val);
      }
    }

    // Grand Total / Total Amount
    if (/(?:grand\s*total|total\s*amount|invoice\s*total|net\s*payable|amount\s*payable|total\s*value|amount\s*debited)[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.test(line)) {
      const match = line.match(/(?:grand\s*total|total\s*amount|invoice\s*total|net\s*payable|amount\s*payable|total\s*value|amount\s*debited)[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
      if (match && match[1]) {
        const val = cleanAmount(match[1]);
        if (val !== null && val > 0) totalMatches.push(val);
      }
    }

    // UPI / wallet success screens: "Paid ₹500", "You paid 500", standalone ₹ amounts
    if (
      /(?:transaction\s*successful|payment\s*successful|paid\s*successfully|money\s*sent|sent\s*successfully|\bpaid\s*to\b|\byou\s*paid\b|\bdebited\b)/i.test(
        line
      ) ||
      /^(?:₹|rs\.?)\s*[0-9]/i.test(line.trim())
    ) {
      upiAmountMatches.push(...extractRupeeAmounts(line));
    }

    // Subtotal
    if (/(?:sub\s*total|taxable\s*value|taxable\s*amount|subtotal)[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.test(line)) {
      const match = line.match(/(?:sub\s*total|taxable\s*value|taxable\s*amount|subtotal)[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
      if (match && match[1]) {
        subtotal = cleanAmount(match[1]);
      }
    }

    // CGST
    if (/(?:cgst|central\s*tax)(?:[^(:\n]*\([^)]*\))?[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.test(line)) {
      const match = line.match(/(?:cgst|central\s*tax)(?:[^(:\n]*\([^)]*\))?[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
      if (match && match[1]) cgst = cleanAmount(match[1]);
    }

    // SGST
    if (/(?:sgst|state\s*tax)(?:[^(:\n]*\([^)]*\))?[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.test(line)) {
      const match = line.match(/(?:sgst|state\s*tax)(?:[^(:\n]*\([^)]*\))?[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
      if (match && match[1]) sgst = cleanAmount(match[1]);
    }

    // IGST
    if (/(?:igst|integrated\s*tax)(?:[^(:\n]*\([^)]*\))?[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.test(line)) {
      const match = line.match(/(?:igst|integrated\s*tax)(?:[^(:\n]*\([^)]*\))?[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
      if (match && match[1]) igst = cleanAmount(match[1]);
    }

    // Discount
    if (/(?:discount|less\s*discount)[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.test(line)) {
      const match = line.match(/(?:discount|less\s*discount)[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
      if (match && match[1]) discount = cleanAmount(match[1]);
    }

    // Amount Paid — avoid bare "PAID" (payslip status next to date day "22")
    if (
      /(?:amount\s*paid|paid\s*amount|you\s*paid|amount\s*received|received\s*with\s*thanks)[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.test(
        line
      )
    ) {
      const match = line.match(
        /(?:amount\s*paid|paid\s*amount|you\s*paid|amount\s*received|received\s*with\s*thanks)[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
      );
      if (match && match[1]) {
        const val = cleanAmount(match[1]);
        // Skip day-of-month style values when line also looks like a calendar date
        if (val != null && !(val <= 31 && /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})\b/i.test(line))) {
          amountPaid = val;
        }
      }
    }

    // Balance / Outstanding
    if (/(?:balance\s*due|amount\s*due|outstanding)[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i.test(line)) {
      const match = line.match(/(?:balance\s*due|amount\s*due|outstanding)[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
      if (match && match[1]) outstandingAmount = cleanAmount(match[1]);
    }
  }

  // Calculate Tax Total
  if (cgst || sgst || igst) {
    totalTax = Math.round(((cgst || 0) + (sgst || 0) + (igst || 0)) * 100) / 100;
  }

  if (totalMatches.length > 0) {
    grandTotal = totalMatches[totalMatches.length - 1]; // usually the final total line
  } else if (amountPaid) {
    grandTotal = amountPaid;
  } else if (upiAmountMatches.length > 0) {
    // Prefer the largest plausible payment amount on UPI screenshots
    grandTotal = Math.max(...upiAmountMatches);
    amountPaid = grandTotal;
  } else if (subtotal && totalTax) {
    grandTotal = Math.round((subtotal + totalTax - (discount || 0)) * 100) / 100;
  } else {
    // Search general Total / Amount / ₹XXX across whole text
    const genericTotal = text.match(
      /(?:total|amount|paid)[:\s]*(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
    );
    if (genericTotal && genericTotal[1]) {
      grandTotal = cleanAmount(genericTotal[1]);
    }
    if (!grandTotal) {
      const rupeeHits = extractRupeeAmounts(text).filter((n) => n >= 1);
      if (rupeeHits.length) {
        // Prefer mid/large values; skip tiny fees if a larger amount exists
        const sorted = [...rupeeHits].sort((a, b) => b - a);
        grandTotal = sorted[0];
      }
    }
  }

  // 5. Vendor Name & Party Details
  let vendorName: string | null = null;
  // Common vendors
  const knownVendors = [
    'Amazon Web Services',
    'AWS',
    'Google Cloud',
    'Google Workspace',
    'Microsoft',
    'Adobe',
    'Meta Platforms',
    'Facebook Ads',
    'GoDaddy',
    'Namecheap',
    'Vercel',
    'Render',
    'Cloudflare',
    'MongoDB',
    'Zoho',
    'Slack',
    'Canva',
    'Figma',
    'OpenAI',
    'Airtel',
    'Jio',
    'Swiggy',
    'Zomato',
    'Uber',
    'Ola',
  ];

  for (const v of knownVendors) {
    if (new RegExp(`\\b${v}\\b`, 'i').test(text)) {
      vendorName = v;
      break;
    }
  }

  // UPI / wallet: "Paid to Acme Store", "To: Merchant Name"
  if (!vendorName) {
    const paidTo = text.match(
      /(?:paid\s*to|payment\s*to|sent\s*to|to)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9 .,&'@_-]{2,60})/i
    );
    if (paidTo?.[1]) {
      const name = paidTo[1].replace(/\s+/g, ' ').trim();
      if (!/^(upi|success|successful|transaction|payment|bank|inr|rs)$/i.test(name)) {
        vendorName = name.slice(0, 80);
      }
    }
  }

  // UPI ID as fallback identifier
  if (!vendorName) {
    const upiId = text.match(/\b([a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,})\b/);
    if (upiId?.[1]) vendorName = upiId[1];
  }

  if (!vendorName && lines.length > 0) {
    // Top 3 non-empty lines usually have company name
    const candidateLines = lines.slice(0, 4).filter(
      (l) => !/(?:tax\s*invoice|invoice|bill|receipt|gstin|phone|email|date)/i.test(l) && l.length > 3 && l.length < 50
    );
    if (candidateLines.length > 0) {
      vendorName = candidateLines[0].replace(/[^\w\s.,&'-]/g, '').trim();
    }
  }

  // 6. Document Type & Classification
  let documentType: IExtractedFinancialData['documentType'] = 'bill';
  let suggestedType: 'expense' | 'revenue' = 'expense';
  let suggestedCategory = 'Office Expenses';

  const lower = `${text}\n${fileName || ''}`.toLowerCase();
  const looksLikePayslip =
    /salary\s*slip|payslip|pay\s*slip|salary\s*payout|net\s*salary|monthly\s*salary|earnings\s*statement/i.test(
      lower
    ) || /payslip|salary[_-]?slip|salary[_-]?payout/i.test(fileName || '');

  const payslipFields = looksLikePayslip ? extractPayslipFields(text, fileName) : null;
  const employeeName = payslipFields?.employeeName || null;
  const salaryPeriod = payslipFields?.period || undefined;

  if (lower.includes('credit note')) {
    documentType = 'credit_note';
    suggestedType = 'revenue';
  } else if (lower.includes('debit note')) {
    documentType = 'debit_note';
    suggestedType = 'expense';
  } else if (looksLikePayslip) {
    documentType = 'salary_slip';
    suggestedCategory = 'Salary';
    suggestedType = 'expense';
    if (payslipFields?.net != null) {
      grandTotal = payslipFields.net;
      amountPaid = payslipFields.net;
    } else if (grandTotal != null && grandTotal < 100) {
      // Drop date-day false positives (e.g. PAID + "22 Oct")
      grandTotal = null;
      amountPaid = null;
    }
    if (employeeName) {
      vendorName = employeeName;
    }
  } else if (lower.includes('receipt') || lower.includes('payment receipt')) {
    documentType = 'receipt';
    suggestedType = 'revenue';
  } else if (lower.includes('tax invoice') || lower.includes('invoice')) {
    documentType = 'invoice';
  }

  // Company letterhead invoices → revenue, but NEVER reclassify salary slips
  const isIssuedByCompany = /star\s*media/i.test(lines.slice(0, 5).join(' '));
  if (documentType === 'salary_slip') {
    suggestedType = 'expense';
    suggestedCategory = 'Salary';
  } else if (isIssuedByCompany) {
    suggestedType = 'revenue';
    suggestedCategory = 'Client Payment';
  } else if (documentType === 'receipt') {
    suggestedType = 'revenue';
  } else {
    suggestedType = 'expense';
    if (/(?:aws|google\s*cloud|vercel|render|hosting|server|azure|mongodb)/i.test(text)) {
      suggestedCategory = 'Software Purchase';
    } else if (/(?:domain|godaddy|namecheap|dns)/i.test(text)) {
      suggestedCategory = 'Domain';
    } else if (/(?:travel|flight|airline|hotel|ticket|transport|booking)/i.test(text)) {
      suggestedCategory = 'Travel';
    } else if (/(?:facebook\s*ads|meta|google\s*ads|campaign|marketing|advertising)/i.test(text)) {
      suggestedCategory = 'Ads Running';
    } else if (/(?:subscription|saas|canva|figma|adobe|slack|zoom)/i.test(text)) {
      suggestedCategory = 'Software Purchase';
    } else if (/(?:freelancer|vendor|agency|consulting)/i.test(text)) {
      suggestedCategory = 'Vendor Costs';
    }
  }

  // 7. Payment Status & Method
  let paymentStatus: 'paid' | 'unpaid' | 'partially_paid' = 'unpaid';
  if (documentType === 'salary_slip') {
    paymentStatus = 'paid';
  } else if (/\bunpaid\b|payment\s*(?:pending|due)|balance\s*due/i.test(text)) {
    paymentStatus = 'unpaid';
  } else if (documentType === 'receipt' || /(?:payment\s*successful|\bpaid\b|receipt\s*for\s*payment|amount\s*received)/i.test(text)) {
    paymentStatus = 'paid';
  } else if (outstandingAmount !== null && grandTotal !== null && outstandingAmount < grandTotal && outstandingAmount > 0) {
    paymentStatus = 'partially_paid';
  }

  let paymentMethod = 'Bank Transfer';
  if (/(?:upi|gpay|phonepe|paytm)/i.test(text)) {
    paymentMethod = 'UPI';
  } else if (/(?:credit\s*card|visa|mastercard|amex)/i.test(text)) {
    paymentMethod = 'Credit Card';
  } else if (/(?:cash)/i.test(text)) {
    paymentMethod = 'Cash';
  } else if (/(?:neft|rtgs|imps|net\s*banking)/i.test(text)) {
    paymentMethod = 'Bank Transfer';
  }

  // Confidence & Uncertainty
  confidence.amount = grandTotal !== null ? 'high' : 'low';
  confidence.date = documentDate !== null ? 'high' : 'medium';
  confidence.vendor = vendorName !== null ? 'high' : 'low';
  confidence.invoiceNumber = invoiceNumber !== null ? 'high' : 'medium';

  if (!grandTotal) uncertainFields.push('amount');
  if (!vendorName) uncertainFields.push('vendorName');
  if (!documentDate) uncertainFields.push('documentDate');
  if (!invoiceNumber) uncertainFields.push('invoiceNumber');

  return {
    documentType,
    invoiceNumber: invoiceNumber || undefined,
    billNumber: invoiceNumber || undefined,
    receiptNumber: documentType === 'receipt' ? invoiceNumber || undefined : undefined,
    documentDate: documentDate || undefined,
    dueDate: dueDate || undefined,
    currency: 'INR',
    vendor: {
      name: vendorName || (fileName ? fileName.replace(/\.[^/.]+$/, '').slice(0, 30) : undefined),
      address: undefined,
      gstin: vendorGstin || undefined,
    },
    customer: {
      name: isIssuedByCompany ? undefined : 'STAR MEDIA',
      gstin: customerGstin || undefined,
    },
    subtotal: subtotal || (grandTotal && totalTax ? Math.round((grandTotal - totalTax) * 100) / 100 : grandTotal) || undefined,
    cgst: cgst || undefined,
    sgst: sgst || undefined,
    igst: igst || undefined,
    totalTax: totalTax || undefined,
    grandTotal: grandTotal || undefined,
    suggestedTransactionType: suggestedType,
    suggestedCategory,
    paymentMethod,
    paymentStatus,
    partyDetails: {
      vendorName: vendorName || (fileName ? fileName.replace(/\.[^/.]+$/, '').slice(0, 30) : null),
      vendorAddress: null,
      vendorGstin,
      customerName: isIssuedByCompany ? null : 'STAR MEDIA',
      customerGstin,
    },
    financialDetails: {
      subtotal: subtotal || (grandTotal && totalTax ? Math.round((grandTotal - totalTax) * 100) / 100 : grandTotal),
      discount: discount || 0,
      taxableAmount: subtotal,
      cgst,
      sgst,
      igst,
      otherTaxes: null,
      totalTax: totalTax || 0,
      grandTotal: grandTotal || 0,
      amountPaid: amountPaid || (paymentStatus === 'paid' ? grandTotal : 0),
      outstandingAmount: outstandingAmount || (paymentStatus === 'paid' ? 0 : grandTotal),
    },
    transactionDetails: {
      suggestedType,
      suggestedCategory,
      paymentMethod,
      paymentStatus,
      description:
        documentType === 'salary_slip'
          ? `Salary payout${employeeName ? ` — ${employeeName}` : ''}${salaryPeriod ? ` (${salaryPeriod})` : ''}`
          : `${vendorName ? `${vendorName} - ` : ''}${invoiceNumber ? `Invoice #${invoiceNumber}` : 'Document Scan'}`.trim(),
      notes: [
        documentType === 'salary_slip' && employeeName ? `Employee: ${employeeName}` : null,
        documentType === 'salary_slip' && salaryPeriod ? `Period: ${salaryPeriod}` : null,
        vendorGstin ? `Vendor GSTIN: ${vendorGstin}` : null,
        invoiceNumber ? `Invoice Ref: ${invoiceNumber}` : null,
        totalTax ? `Total GST: ₹${totalTax}` : null,
      ]
        .filter(Boolean)
        .join(' | '),
    },
    lineItems: [],
    confidence,
    uncertainFields,
  } as any;
}

/**
 * Force correct classification for salary / payslip documents (company letterhead
 * must not reclassify payroll as client revenue).
 */
export function normalizePayslipExtraction(
  extracted: IExtractedFinancialData,
  fileName?: string,
  rawText?: string
): IExtractedFinancialData {
  const blob = `${fileName || ''}\n${rawText || ''}\n${JSON.stringify(extracted)}`.toLowerCase();
  const isPayslip =
    extracted.documentType === 'salary_slip' ||
    /salary\s*slip|payslip|pay\s*slip|salary\s*payout|net\s*salary|earnings\s*statement/.test(blob) ||
    /payslip|salary[_-]?slip|salary[_-]?payout/i.test(fileName || '');

  if (!isPayslip) return extracted;

  const fields = extractPayslipFields(rawText || '', fileName);
  // Prefer dedicated extractor; ignore tiny false positives from status+date ("PAID 22 Oct")
  const existingNet =
    extracted.financialDetails?.grandTotal ||
    extracted.financialDetails?.amountPaid ||
    (extracted as any).grandTotal ||
    0;
  const net =
    fields.net ??
    (typeof existingNet === 'number' && existingNet >= 100 ? existingNet : null) ??
    0;

  let employeeName = fields.employeeName || undefined;
  const badName = !employeeName || /^(employee(\s*id)?|star\s*media|—|-)$/i.test(employeeName);
  if (badName) {
    const vendor = extracted.partyDetails?.vendorName;
    if (vendor && !/^(employee(\s*id)?|star\s*media)$/i.test(vendor)) {
      employeeName = vendor;
    }
  }
  const period = fields.period || undefined;

  const description = `Salary payout${employeeName ? ` — ${employeeName}` : ''}${period ? ` (${period})` : ''}`;

  return {
    ...extracted,
    documentType: 'salary_slip',
    currency: extracted.currency || 'INR',
    partyDetails: {
      ...extracted.partyDetails,
      vendorName: employeeName || extracted.partyDetails?.vendorName || null,
      customerName: 'STAR MEDIA',
    },
    financialDetails: {
      ...extracted.financialDetails,
      grandTotal: net || extracted.financialDetails?.grandTotal || 0,
      amountPaid: net || extracted.financialDetails?.amountPaid || 0,
      outstandingAmount: 0,
      totalTax: extracted.financialDetails?.totalTax ?? 0,
    },
    transactionDetails: {
      ...extracted.transactionDetails,
      suggestedType: 'expense',
      suggestedCategory: 'Salary',
      paymentMethod: extracted.transactionDetails?.paymentMethod || 'Bank Transfer',
      paymentStatus: 'paid',
      description,
      notes: [
        employeeName ? `Employee: ${employeeName}` : null,
        period ? `Period: ${period}` : null,
        extracted.transactionDetails?.notes || null,
      ]
        .filter(Boolean)
        .join(' | '),
    },
  };
}

/**
 * Call Google Gemini Vision / Multimodal API for state-of-the-art document extraction.
 */
export async function extractWithGemini(
  fileBuffer: Buffer,
  mimeType: string
): Promise<IExtractedFinancialData | null> {
  const apiKey = (env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  const modelsToTry = [
    env.GEMINI_MODEL || 'gemini-2.5-flash',
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-2.5-flash-lite',
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  const prompt = `You are a Senior Financial Auditor and Expert Document OCR Specialist for an Indian CRM accounting system.
Analyze the attached document (invoice, receipt, bill, or salary slip) and extract financial, tax, and party details accurately.
Follow standard Indian and International accounting principles (e.g. Subtotal + CGST + SGST or IGST = Grand Total).
Never confuse Subtotal with Grand Total, or Amount Paid with Balance Due.

PAYSLIP / SALARY SLIP RULES (critical):
- If the document is a salary slip, payslip, or earnings statement: set documentType to "salary_slip".
- suggestedType MUST be "expense" (company paying employee), NEVER "revenue", even if company name STAR MEDIA appears on the header.
- suggestedCategory MUST be exactly "Salary".
- grandTotal / amountPaid MUST be the NET SALARY PAYABLE (not basic, not deductions, not "Total Deductions").
- partyDetails.vendorName = employee full name (the payee).
- description like "Salary payout — <Employee> (<Period>)".

Output ONLY a valid JSON object matching this schema:
{
  "documentType": "tax_invoice" | "bill" | "receipt" | "credit_note" | "debit_note" | "salary_slip" | "other",
  "invoiceNumber": string or null,
  "receiptNumber": string or null,
  "billNumber": string or null,
  "documentDate": "YYYY-MM-DD" or null,
  "dueDate": "YYYY-MM-DD" or null,
  "currency": "INR" or currency code,
  "partyDetails": {
    "vendorName": string or null,
    "vendorAddress": string or null,
    "vendorGstin": string or null,
    "customerName": string or null,
    "customerGstin": string or null
  },
  "financialDetails": {
    "subtotal": number or null,
    "discount": number or null,
    "taxableAmount": number or null,
    "cgst": number or null,
    "sgst": number or null,
    "igst": number or null,
    "otherTaxes": number or null,
    "totalTax": number or null,
    "grandTotal": number,
    "amountPaid": number or null,
    "outstandingAmount": number or null
  },
  "transactionDetails": {
    "suggestedType": "expense" or "revenue",
    "suggestedCategory": string (use "Salary" for payslips; otherwise e.g. "Software Purchase", "Office Expenses", "Marketing", "Vendor Payment", "Client Payment"),
    "paymentMethod": "UPI" | "Bank Transfer" | "Credit Card" | "Cash" or null,
    "paymentStatus": "paid" | "unpaid" | "partially_paid",
    "description": string,
    "notes": string
  },
  "lineItems": [
    {
      "name": string,
      "quantity": number,
      "unitPrice": number,
      "taxRate": number,
      "lineTotal": number
    }
  ],
  "confidence": {
    "amount": "high" | "medium" | "low",
    "date": "high" | "medium" | "low",
    "vendor": "high" | "medium" | "low",
    "invoiceNumber": "high" | "medium" | "low"
  },
  "uncertainFields": ["string"]
}`;

  const base64Data = fileBuffer.toString('base64');
  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  };

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[DocumentScanner] Gemini API error (${res.status}) model=${model}:`, errText.slice(0, 500));
        // Invalid API key — stop trying models
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          if (/API_KEY_INVALID|PERMISSION_DENIED|API key not valid/i.test(errText)) {
            console.warn('[DocumentScanner] Gemini API key rejected — falling back to offline OCR');
            return null;
          }
        }
        continue;
      }

      const json = await res.json();
      const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) continue;

      const cleaned = candidateText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed: IExtractedFinancialData = JSON.parse(cleaned);
      return parsed;
    } catch (err) {
      console.warn(`[DocumentScanner] Gemini extraction failed (model=${model}):`, err);
    }
  }

  return null;
}

/**
 * Call OpenAI API for structured extraction if configured.
 */
export async function extractWithOpenAI(
  fileBuffer: Buffer,
  mimeType: string,
  rawText?: string
): Promise<IExtractedFinancialData | null> {
  const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const model = env.OPENAI_MODEL || 'gpt-4o-mini';
    const isImage = mimeType.startsWith('image/');

    const messages: any[] = [
      {
        role: 'system',
        content: `You are a financial audit OCR model. Extract invoice, receipt, tax and party details accurately. Return valid JSON matching the financial schema.`,
      },
    ];

    if (isImage) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Extract all financial details, GSTIN, invoice number, items, and totals from this bill/receipt.' },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${fileBuffer.toString('base64')}`,
            },
          },
        ],
      });
    } else {
      messages.push({
        role: 'user',
        content: `Extract all financial details, GSTIN, invoice number, items, and totals from this document text:\n\n${rawText || ''}`,
      });
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    return JSON.parse(content) as IExtractedFinancialData;
  } catch (err) {
    console.warn('[DocumentScanner] OpenAI extraction failed:', err);
    return null;
  }
}

/**
 * Validate file mime type and magic bytes to prevent disguised executable uploads.
 */
export function validateDocumentFile(
  buffer: Buffer,
  originalMime: string,
  originalName?: string,
  maxMb?: number
): { isValid: boolean; fileType: 'pdf' | 'image' } {
  const allowedMimes = new Set([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ]);

  if (!allowedMimes.has(originalMime.toLowerCase())) {
    throw new AppError('Unsupported file type. Please upload a PDF, JPG, PNG, or WEBP file.', 400, 'INVALID_FILE_TYPE');
  }

  const effectiveMaxMb = maxMb || env.DOCUMENT_SCAN_MAX_MB || 15;
  if (buffer.length > effectiveMaxMb * 1024 * 1024) {
    throw new AppError(`File exceeds maximum allowed size (${effectiveMaxMb}MB)`, 400, 'FILE_TOO_LARGE');
  }

  // Magic bytes verification
  if (buffer.length < 4) {
    throw new AppError('Invalid or corrupted document file', 400, 'CORRUPTED_FILE');
  }

  const hexHeader = buffer.slice(0, 4).toString('hex').toLowerCase();

  // PDF: %PDF (25 50 44 46)
  const isPdf = hexHeader.startsWith('25504446');
  // JPEG: FF D8 FF
  const isJpeg = hexHeader.startsWith('ffd8ff');
  // PNG: 89 50 4E 47
  const isPng = hexHeader.startsWith('89504e47');
  // WEBP: RIFF...WEBP (52 49 46 46)
  const isWebp = hexHeader.startsWith('52494646');

  if (!isPdf && !isJpeg && !isPng && !isWebp) {
    throw new AppError('File signature does not match allowed document types. Executables or disguised files are rejected.', 400, 'SECURITY_VIOLATION');
  }

  return {
    isValid: true,
    fileType: isPdf ? 'pdf' : 'image',
  };
}

/**
 * Main pipeline: Validate, hash, duplicate check, extract text/OCR/AI, store file, and record scan.
 */
export async function processFinancialDocument(
  file: Express.Multer.File,
  user: { id: string; role: string }
): Promise<ScanResult> {
  if (!file) {
    throw new AppError('No document file uploaded', 400);
  }

  const filePath = file.path;
  const fileBuffer = fs.readFileSync(filePath);

  // 1. Security & Magic bytes validation
  validateDocumentFile(fileBuffer, file.mimetype);

  // 2. Hash calculation
  const documentHash = computeFileHash(fileBuffer);

  // 3. Initial text extraction (PDF / OCR)
  let rawText = '';
  const isPdf = file.mimetype === 'application/pdf';

  if (isPdf) {
    rawText = await extractTextFromPDF(fileBuffer);
  } else {
    // For images, run Tesseract OCR if no cloud AI is set or for offline support
    const hasCloudAI = !!(env.GEMINI_API_KEY || env.OPENAI_API_KEY);
    if (!hasCloudAI) {
      rawText = await extractTextFromImageOCR(filePath);
    }
  }

  // 4. Extraction Engine Selection (AI -> OCR -> Heuristic fallback)
  let extracted: IExtractedFinancialData | null = null;
  let providerUsed: ScanResult['provider'] = 'heuristic';

  const preferredProvider = env.AI_OCR_PROVIDER || 'auto';

  if (preferredProvider !== 'heuristic') {
    // Try Gemini first if available (supports direct PDF and images)
    if (env.GEMINI_API_KEY && (preferredProvider === 'auto' || preferredProvider === 'gemini')) {
      extracted = await extractWithGemini(fileBuffer, file.mimetype);
      if (extracted) providerUsed = 'gemini';
    }

    // Try OpenAI next if Gemini wasn't configured or failed
    if (!extracted && env.OPENAI_API_KEY && (preferredProvider === 'auto' || preferredProvider === 'openai')) {
      extracted = await extractWithOpenAI(fileBuffer, file.mimetype, rawText);
      if (extracted) providerUsed = 'openai';
    }
  }

  // Fallback to offline regex & heuristics parser
  if (!extracted) {
    // If it's an image and rawText was empty (because cloud AI was skipped), run OCR now
    if (!isPdf && !rawText) {
      rawText = await extractTextFromImageOCR(filePath);
    }
    extracted = parseFinancialTextWithHeuristics(rawText, file.originalname);
    providerUsed = isPdf ? 'pdf-parse' : rawText ? 'tesseract' : 'heuristic';
  }

  // Ensure payslips are never misclassified as client revenue / wrong category
  extracted = normalizePayslipExtraction(extracted, file.originalname, rawText);
  if (!extracted.financialDetails) {
    extracted.financialDetails = { grandTotal: 0 } as any;
  }
  if (!extracted.partyDetails) {
    extracted.partyDetails = {} as any;
  }

  // 5. Duplicate Detection Check
  const duplicateCheck = await checkDuplicateDocument(
    documentHash,
    extracted.invoiceNumber,
    extracted.financialDetails?.grandTotal,
    extracted.partyDetails?.vendorName
  );

  // 6. Secure Storage (Cloudinary if available, otherwise local persistent path)
  let fileUrl = publicUploadPath(file.filename);
  const cloudUpload = await uploadDocumentToCloudinary(filePath, 'starmedia/financial-docs');
  if (cloudUpload?.secure_url) {
    fileUrl = cloudUpload.secure_url;
  }

  // 7. Store ScannedDocument entry in DB
  const scannedDoc = await ScannedDocument.create({
    fileName: file.originalname,
    fileUrl,
    fileSize: file.size,
    mimeType: file.mimetype,
    documentHash,
    documentType: extracted.documentType || 'bill',
    extractedData: extracted,
    rawText: rawText ? rawText.slice(0, 10000) : undefined, // limit raw text size in DB
    provider: providerUsed,
    status: 'scanned',
    scannedBy: user.id,
  });

  return {
    scanId: scannedDoc._id.toString(),
    fileName: file.originalname,
    fileUrl,
    fileSize: file.size,
    mimeType: file.mimetype,
    documentHash,
    extractedData: extracted,
    isDuplicate: duplicateCheck.isDuplicate,
    duplicateMatch: duplicateCheck.duplicateMatch,
    duplicateWarning: duplicateCheck.warning,
    provider: providerUsed,
  };
}
