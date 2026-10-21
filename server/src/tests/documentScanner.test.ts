import { describe, it, expect } from '@jest/globals';
import {
  computeFileHash,
  validateDocumentFile,
  parseFinancialTextWithHeuristics,
} from '../modules/finance/documentScanner.js';

describe('Document Scanner & AI Extraction Engine', () => {
  describe('File Validation & Magic Bytes Security', () => {
    it('should validate genuine PDF file magic bytes', () => {
      const pdfHeader = Buffer.from('%PDF-1.5 test invoice header content');
      const result = validateDocumentFile(pdfHeader, 'application/pdf', 'invoice.pdf');
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('pdf');
    });

    it('should validate genuine JPEG image magic bytes', () => {
      // JPEG SOI: 0xFF 0xD8 0xFF
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const result = validateDocumentFile(jpegHeader, 'image/jpeg', 'receipt.jpg');
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('image');
    });

    it('should validate genuine PNG image magic bytes', () => {
      // PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      const result = validateDocumentFile(pngHeader, 'image/png', 'bill.png');
      expect(result.isValid).toBe(true);
      expect(result.fileType).toBe('image');
    });

    it('should reject executable or binary files disguised as PDF', () => {
      // Windows PE executable header: "MZ" (0x4D 0x5A)
      const disguisedExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00');
      expect(() => {
        validateDocumentFile(disguisedExe, 'application/pdf', 'malicious.pdf');
      }).toThrow(/disguised files|File signature does not match/i);
    });

    it('should reject unsupported file MIME types', () => {
      const textBuffer = Buffer.from('console.log("hello");');
      expect(() => {
        validateDocumentFile(textBuffer, 'application/javascript', 'script.js');
      }).toThrow(/unsupported file type/i);
    });

    it('should reject files exceeding upload size limits', () => {
      const largeBuffer = Buffer.alloc(16 * 1024 * 1024); // 16MB
      largeBuffer.write('%PDF-1.4');
      expect(() => {
        validateDocumentFile(largeBuffer, 'application/pdf', 'large.pdf', 15);
      }).toThrow(/exceeds maximum allowed size/i);
    });
  });

  describe('Document SHA-256 Content Hashing', () => {
    it('should generate deterministic cryptographic SHA-256 hashes', () => {
      const docBuffer1 = Buffer.from('Invoice INV-2026-001 for Star Media CRM');
      const docBuffer2 = Buffer.from('Invoice INV-2026-001 for Star Media CRM');
      const docBuffer3 = Buffer.from('Different document content');

      const hash1 = computeFileHash(docBuffer1);
      const hash2 = computeFileHash(docBuffer2);
      const hash3 = computeFileHash(docBuffer3);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Heuristic Financial Parsing (Indian GST & Invoices)', () => {
    it('should parse Indian Tax Invoice with GST breakdown correctly', () => {
      const rawInvoiceText = `
        TAX INVOICE
        Invoice No: INV-2026-104
        Invoice Date: 2026-10-20
        Due Date: 2026-11-04

        Vendor Details:
        Adobe Systems India Pvt Ltd
        GSTIN: 07AAACA6148C1Z4
        Address: Noida Sector 132, Uttar Pradesh, India

        Bill To:
        Star Media Influencer Pvt Ltd
        GSTIN: 27AAPFU0939F1ZV
        Mumbai, Maharashtra, India

        Item Description | Qty | Rate | Amount
        Creative Cloud All Apps License | 1 | 2000.00 | 2000.00

        Sub Total: Rs. 2000.00
        CGST (9%): Rs. 180.00
        SGST (9%): Rs. 180.00
        Total Tax: Rs. 360.00
        Grand Total: Rs. 2360.00

        Payment Status: Unpaid
        Payment Method: Bank Transfer
      `;

      const result = parseFinancialTextWithHeuristics(rawInvoiceText);

      // Verify Document Info
      expect(result.documentType).toBe('invoice');
      expect(result.invoiceNumber).toBe('INV-2026-104');
      expect(result.documentDate).toBe('2026-10-20');
      expect(result.suggestedTransactionType).toBe('expense');
      expect(result.suggestedCategory).toBe('Software Purchase');

      // Verify Parties & GSTINs
      expect(result.vendor?.gstin).toBe('07AAACA6148C1Z4');
      expect(result.customer?.gstin).toBe('27AAPFU0939F1ZV');

      // Verify Financial Amounts
      expect(result.subtotal).toBe(2000);
      expect(result.cgst).toBe(180);
      expect(result.sgst).toBe(180);
      expect(result.totalTax).toBe(360);
      expect(result.grandTotal).toBe(2360);

      // Verify Status & Method
      expect(result.paymentStatus).toBe('unpaid');
      expect(result.paymentMethod).toBe('Bank Transfer');
    });

    it('should identify paid status and payment receipt accurately', () => {
      const receiptText = `
        PAYMENT RECEIPT
        Receipt Number: REC-8849
        Date: 15-10-2026
        Received with thanks from: TechNova Solutions
        Amount Paid: INR 55,000.00
        Payment Mode: UPI Ref # 928374928374
        Payment Status: Paid in Full
      `;

      const result = parseFinancialTextWithHeuristics(receiptText);

      expect(result.documentType).toBe('receipt');
      expect(result.suggestedTransactionType).toBe('revenue');
      expect(result.receiptNumber).toBe('REC-8849');
      expect(result.grandTotal).toBe(55000);
      expect(result.paymentStatus).toBe('paid');
      expect(result.paymentMethod).toBe('UPI');
    });

    it('should categorize travel, hotel, and meal bills appropriately', () => {
      const travelBillText = `
        TAX INVOICE - FLIGHT BOOKING
        Indigo Airlines Ltd
        GSTIN: 06AABCI1234D1Z2
        Date: 2026-09-12
        Total Amount: Rs. 6,450.00
        Description: Round trip ticket Mumbai to Delhi
      `;

      const result = parseFinancialTextWithHeuristics(travelBillText);
      expect(result.suggestedTransactionType).toBe('expense');
      expect(result.suggestedCategory).toBe('Travel');
      expect(result.grandTotal).toBe(6450);
    });

    it('should handle missing fields gracefully without inventing hallucinations', () => {
      const vagueText = `
        Notes from yesterday meeting with client.
        We discussed project scope and milestones.
      `;

      const result = parseFinancialTextWithHeuristics(vagueText);
      expect(result.invoiceNumber).toBeUndefined();
      expect(result.grandTotal).toBeUndefined();
      expect(result.totalTax).toBeUndefined();
      expect(result.vendor?.gstin).toBeUndefined();
    });
  });
});
