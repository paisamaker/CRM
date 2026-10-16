import { describe, it, expect } from '@jest/globals';
import { roundMoney, addMoney, subMoney, toCents, fromCents } from '../utils/money.js';

describe('Financial Management Calculations & Accounting Rules', () => {
  it('should accurately calculate ₹100 Income, ₹80 Expense, ₹20 Net Profit with no float drift', () => {
    const clientPayment = 100;
    const softwarePurchase = 30;
    const officeExpense = 20;
    const salaryPaid = 30;

    const totalIncome = clientPayment;
    const totalExpenses = addMoney(softwarePurchase, officeExpense, salaryPaid);
    const netProfit = subMoney(totalIncome, totalExpenses);

    expect(totalIncome).toBe(100);
    expect(totalExpenses).toBe(80);
    expect(netProfit).toBe(20);
  });

  it('should calculate Available Balance starting from ₹500 opening balance', () => {
    const openingBalance = 500;
    const totalIncome = 100;
    const initialExpenses = 80;

    let availableBalance = addMoney(openingBalance, subMoney(totalIncome, initialExpenses));
    expect(availableBalance).toBe(520);

    // Another expense of 10 is added
    const additionalExpense = 10;
    const updatedExpenses = addMoney(initialExpenses, additionalExpense);
    const updatedNetProfit = subMoney(totalIncome, updatedExpenses);
    availableBalance = addMoney(openingBalance, subMoney(totalIncome, updatedExpenses));

    expect(updatedExpenses).toBe(90);
    expect(updatedNetProfit).toBe(10);
    expect(availableBalance).toBe(510);
  });

  it('should verify outstanding bill balance calculation', () => {
    const billTotal = 1200; // 1000 base + 200 tax
    let paidAmount = 0;
    let outstanding = subMoney(billTotal, paidAmount);
    expect(outstanding).toBe(1200);

    // Partial payment of ₹500
    paidAmount = addMoney(paidAmount, 500);
    outstanding = subMoney(billTotal, paidAmount);
    expect(outstanding).toBe(700);

    // Remaining payment of ₹700
    paidAmount = addMoney(paidAmount, 700);
    outstanding = subMoney(billTotal, paidAmount);
    expect(outstanding).toBe(0);
  });

  it('should verify Net Salary calculation: Basic + Allowances + Bonuses - Deductions', () => {
    const basic = 45000;
    const allowances = 5000;
    const bonuses = 2500;
    const deductions = 1800;

    const netSalary = subMoney(addMoney(basic, allowances, bonuses), deductions);
    expect(netSalary).toBe(50700);
  });
});
