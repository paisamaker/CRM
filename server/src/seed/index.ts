import { connectDB, disconnectDB } from '../config/db.js';
import { hashPassword } from '../utils/password.js';
import {
  User,
  Client,
  Lead,
  Project,
  Task,
  Transaction,
  Invoice,
  Vendor,
  Contract,
  Payroll,
  BankAccount,
  Approval,
  Budget,
  TimeLog,
  Notification,
  Alert,
  Settings,
} from '../models/index.js';
import { LEAD_STAGES } from '../models/Lead.js';
import { logger } from '../utils/logger.js';
import { subDays, subMonths, addDays, startOfMonth, endOfMonth, format } from 'date-fns';

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
  await connectDB();
  logger.info('Seeding STAR MEDIA CRM...');

  await Promise.all([
    User.deleteMany({}),
    Client.deleteMany({}),
    Lead.deleteMany({}),
    Project.deleteMany({}),
    Task.deleteMany({}),
    Transaction.deleteMany({}),
    Invoice.deleteMany({}),
    Vendor.deleteMany({}),
    Contract.deleteMany({}),
    Payroll.deleteMany({}),
    BankAccount.deleteMany({}),
    Approval.deleteMany({}),
    Budget.deleteMany({}),
    TimeLog.deleteMany({}),
    Notification.deleteMany({}),
    Alert.deleteMany({}),
    Settings.deleteMany({}),
  ]);

  await Settings.create({
    allowedDomains: ['starmediainfluencer.com'],
    company: { name: 'STAR MEDIA', currency: 'INR', timezone: 'Asia/Kolkata' },
    invoiceCounter: 0,
  });

  const passwordHash = await hashPassword('StarMedia#2026!');
  const demoUsers = [
    { name: 'Aarav Mehta', email: 'ceo@starmediainfluencer.com', role: 'ceo' as const, department: 'Executive' },
    { name: 'Priya Sharma', email: 'manager@starmediainfluencer.com', role: 'manager' as const, department: 'Operations' },
    { name: 'Rohan Kapoor', email: 'finance@starmediainfluencer.com', role: 'finance' as const, department: 'Finance' },
    { name: 'Ananya Iyer', email: 'employee@starmediainfluencer.com', role: 'employee' as const, department: 'Creative' },
  ];

  const moreNames = [
    'Kabir Singh', 'Neha Gupta', 'Vikram Rao', 'Ishita Nair', 'Arjun Desai',
    'Sana Khan', 'Dev Patel', 'Meera Joshi', 'Karan Malhotra', 'Diya Reddy', 'Aditya Bose',
  ];
  const usersData = [
    ...demoUsers,
    ...moreNames.map((name, i) => ({
      name,
      email: `${name.split(' ')[0].toLowerCase()}@starmediainfluencer.com`,
      role: (i % 3 === 0 ? 'manager' : 'employee') as 'manager' | 'employee',
      department: pick(['Creative', 'Ops', 'Growth', 'Talent', 'Finance']),
    })),
  ];

  const users = await User.insertMany(
    usersData.map((u) => ({
      ...u,
      passwordHash,
      status: 'active',
      mfa: { enabled: false, backupCodes: [] },
      passwordChangedAt: new Date(),
    }))
  );

  const ceo = users.find((u) => u.role === 'ceo')!;
  const manager = users.find((u) => u.email === 'manager@starmediainfluencer.com')!;
  const finance = users.find((u) => u.email === 'finance@starmediainfluencer.com')!;
  const employee = users.find((u) => u.email === 'employee@starmediainfluencer.com')!;

  const industries = ['Beauty', 'Tech', 'Fashion', 'Food', 'Gaming', 'Finance', 'Travel', 'Fitness'];
  const clients = await Client.insertMany(
    Array.from({ length: 40 }, (_, i) => ({
      name: `Client Contact ${i + 1}`,
      company: `${pick(['Nova', 'Pulse', 'Orbit', 'Lumen', 'Vertex', 'Aura'])} ${pick(['Media', 'Brands', 'Labs', 'Studio'])} ${i + 1}`,
      email: `client${i + 1}@example.com`,
      phone: `+91-98${String(10000000 + i).slice(0, 8)}`,
      status: pick(['active', 'active', 'active', 'inactive', 'churned', 'prospect']),
      industry: pick(industries),
      owner: pick(users)._id,
      onboardedAt: subDays(new Date(), rand(30, 700)),
      tags: [pick(['retainer', 'campaign', 'influencer', 'production'])],
      lastActivityAt: subDays(new Date(), rand(0, 40)),
    }))
  );

  const sources = ['inbound', 'referral', 'linkedin', 'instagram', 'event', 'cold'];
  const leads = await Lead.insertMany(
    Array.from({ length: 120 }, (_, i) => ({
      name: `Lead ${i + 1}`,
      company: `Prospect Co ${i + 1}`,
      email: `lead${i + 1}@prospect.com`,
      source: pick(sources),
      stage: pick([...LEAD_STAGES]),
      value: rand(25000, 2500000),
      owner: pick(users)._id,
      nextFollowUp: addDays(new Date(), rand(-5, 20)),
      lastActivityAt: subDays(new Date(), rand(0, 30)),
    }))
  );

  const projects = await Project.insertMany(
    Array.from({ length: 25 }, (_, i) => {
      const start = subDays(new Date(), rand(10, 200));
      return {
        name: `${pick(['Campaign', 'Launch', 'Retainer', 'Content'])} ${i + 1}`,
        client: pick(clients)._id,
        owner: pick([ceo, manager, ...users.filter((u) => u.role === 'manager')])._id,
        members: [employee._id, pick(users)._id, pick(users)._id],
        budget: rand(100000, 5000000),
        startDate: start,
        endDate: addDays(start, rand(30, 180)),
        status: pick(['planned', 'active', 'active', 'on_hold', 'completed']),
        progress: rand(0, 100),
        tags: [pick(['Q1', 'Q2', 'Q3', 'Q4'])],
      };
    })
  );

  const priorities = ['low', 'medium', 'high', 'urgent'] as const;
  const statuses = ['todo', 'in_progress', 'review', 'completed'] as const;
  const tasks = await Task.insertMany(
    Array.from({ length: 200 }, (_, i) => {
      const status = pick([...statuses]);
      const due = addDays(new Date(), rand(-15, 30));
      return {
        title: `Task ${i + 1}: ${pick(['Draft brief', 'Shoot day', 'Edit reel', 'Client review', 'Publish', 'Report'])}`,
        description: 'Seeded task for demo workflows.',
        project: pick(projects)._id,
        assignees: [pick([employee, ...users])._id],
        priority: pick([...priorities]),
        status,
        dueDate: due,
        tags: [pick(['content', 'ops', 'finance', 'client'])],
        checklist: [
          { text: 'Brief approved', done: true },
          { text: 'Assets ready', done: status !== 'todo' },
        ],
        createdBy: manager._id,
        progress: status === 'completed' ? 100 : rand(0, 90),
        completedAt: status === 'completed' ? subDays(due, rand(0, 5)) : undefined,
        watchers: [manager._id],
      };
    })
  );

  // Time logs
  await TimeLog.insertMany(
    Array.from({ length: 80 }, () => {
      const start = subDays(new Date(), rand(0, 14));
      const minutes = rand(30, 240);
      return {
        user: pick([employee, ...users.filter((u) => u.role === 'employee')])._id,
        task: pick(tasks)._id,
        start,
        end: new Date(start.getTime() + minutes * 60000),
        minutes,
        note: 'Work session',
        submitted: Math.random() > 0.5,
      };
    })
  );

  const vendors = await Vendor.insertMany(
    Array.from({ length: 15 }, (_, i) => ({
      name: `Vendor ${i + 1}`,
      type: pick(['vendor', 'host', 'supplier', 'freelancer']),
      email: `vendor${i + 1}@supply.com`,
      status: 'active',
    }))
  );

  await Contract.insertMany(
    vendors.slice(0, 10).map((v, i) => ({
      name: `${v.name} Subscription`,
      vendor: v._id,
      type: 'subscription',
      amount: rand(2000, 80000),
      billingCycle: pick(['monthly', 'yearly'] as const),
      startDate: subMonths(new Date(), rand(1, 12)),
      renewalDate: addDays(new Date(), pick([7, 15, 30, 60])),
      status: 'active',
    }))
  );

  await BankAccount.insertMany([
    { name: 'Operating Account', bank: 'HDFC', accountLast4: '4821', balance: 4850000, currency: 'INR', isPrimary: true },
    { name: 'Payroll Account', bank: 'ICICI', accountLast4: '1190', balance: 1250000, currency: 'INR' },
    { name: 'Tax Reserve', bank: 'SBI', accountLast4: '7733', balance: 890000, currency: 'INR' },
  ]);

  // 2 years of transactions
  const txDocs = [];
  for (let m = 0; m < 24; m++) {
    const monthDate = subMonths(new Date(), m);
    for (let i = 0; i < rand(8, 18); i++) {
      txDocs.push({
        type: 'revenue' as const,
        category: pick(['Client Payout', 'Host Fee', 'Agency Fee', 'Subscription Renewal']),
        amount: rand(50000, 1500000),
        currency: 'INR',
        date: addDays(startOfMonth(monthDate), rand(0, 27)),
        client: pick(clients)._id,
        project: pick(projects)._id,
        status: 'approved' as const,
        createdBy: finance._id,
      });
    }
    for (let i = 0; i < rand(6, 14); i++) {
      txDocs.push({
        type: 'expense' as const,
        category: pick([
          'Operations',
          'Employee Stipends',
          'Domain Services',
          'Software Subscriptions',
          'Vendor Costs',
          'Marketing',
          'Other',
        ]),
        amount: rand(5000, 400000),
        currency: 'INR',
        date: addDays(startOfMonth(monthDate), rand(0, 27)),
        vendor: pick(vendors)._id,
        status: pick(['approved', 'approved', 'paid'] as const),
        createdBy: pick([finance, employee, manager])._id,
      });
    }
  }
  await Transaction.insertMany(txDocs);

  // Invoices
  const settings = await Settings.findOne();
  const invoices = [];
  for (let i = 0; i < 40; i++) {
    settings!.invoiceCounter += 1;
    const subtotal = rand(50000, 800000);
    const tax = Math.round(subtotal * 0.18);
    const total = subtotal + tax;
    const paid = pick([0, 0, total * 0.4, total, total]);
    const dueDate = addDays(new Date(), rand(-40, 40));
    let status: 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'draft' = 'sent';
    if (paid >= total) status = 'paid';
    else if (paid > 0) status = 'partially_paid';
    else if (dueDate < new Date()) status = 'overdue';
    invoices.push({
      number: `INV-2026-${String(settings!.invoiceCounter).padStart(4, '0')}`,
      client: pick(clients)._id,
      project: pick(projects)._id,
      items: [{ description: 'Campaign services', quantity: 1, unitPrice: subtotal, amount: subtotal }],
      tax,
      discount: 0,
      subtotal,
      total,
      paid,
      status,
      issueDate: subDays(dueDate, 30),
      dueDate,
      payments: paid
        ? [{ amount: paid, date: subDays(new Date(), rand(0, 20)), method: 'NEFT' }]
        : [],
      createdBy: finance._id,
    });
  }
  await settings!.save();
  await Invoice.insertMany(invoices);

  // Payroll current month
  const period = format(new Date(), 'yyyy-MM');
  const payrollRows = await Payroll.insertMany(
    users
      .filter((u) => u.role !== 'ceo')
      .slice(0, 12)
      .map((u) => {
        const base = rand(40000, 180000);
        const stipend = rand(0, 15000);
        const incentive = rand(0, 25000);
        const deductions = rand(2000, 10000);
        return {
          employee: u._id,
          period,
          periodStart: startOfMonth(new Date()),
          periodEnd: endOfMonth(new Date()),
          base,
          stipend,
          incentive,
          deductions,
          net: base + stipend + incentive - deductions,
          status: pick(['draft', 'pending_approval', 'approved'] as const),
          createdBy: finance._id,
        };
      })
  );

  for (const row of payrollRows.filter((p) => p.status === 'pending_approval')) {
    await Approval.create({
      type: 'payroll',
      refModel: 'Payroll',
      refId: row._id,
      amount: row.net,
      title: `Payroll ${period} — ${row.employee}`,
      requestedBy: finance._id,
      status: 'pending',
      history: [{ action: 'submitted', by: finance._id, at: new Date() }],
    });
  }

  // Pending expense approvals
  const pendingExpenses = await Transaction.insertMany(
    Array.from({ length: 6 }, (_, i) => ({
      type: 'expense' as const,
      category: 'Operations',
      amount: rand(8000, 120000),
      currency: 'INR',
      date: subDays(new Date(), i),
      status: 'pending' as const,
      createdBy: employee._id,
      notes: `Expense claim #${i + 1}`,
    }))
  );
  for (const tx of pendingExpenses) {
    const approval = await Approval.create({
      type: 'expense',
      refModel: 'Transaction',
      refId: tx._id,
      amount: tx.amount,
      title: `Expense: ${tx.category}`,
      description: tx.notes,
      priority: tx.amount > 50000 ? 'high' : 'medium',
      requestedBy: employee._id,
      status: 'pending',
      history: [{ action: 'submitted', by: employee._id, at: new Date() }],
    });
    tx.approval = approval._id;
    await tx.save();
  }

  await Budget.insertMany([
    {
      name: 'Q Marketing',
      category: 'Marketing',
      period: period,
      periodStart: startOfMonth(new Date()),
      periodEnd: endOfMonth(new Date()),
      planned: 500000,
      actual: 320000,
      status: 'locked',
      createdBy: finance._id,
    },
    {
      name: 'Software',
      category: 'Software Subscriptions',
      period: period,
      periodStart: startOfMonth(new Date()),
      periodEnd: endOfMonth(new Date()),
      planned: 120000,
      actual: 95000,
      status: 'locked',
      createdBy: finance._id,
    },
  ]);

  await Notification.create({
    user: ceo._id,
    type: 'system',
    title: 'Welcome to STAR MEDIA CRM',
    message: 'Your demo workspace is ready with seeded data.',
    link: '/dashboard',
  });

  logger.info('Seed complete');
  logger.info('Demo logins (password: StarMedia#2026!):');
  logger.info('  ceo@starmediainfluencer.com');
  logger.info('  manager@starmediainfluencer.com');
  logger.info('  finance@starmediainfluencer.com');
  logger.info('  employee@starmediainfluencer.com');
  logger.info(`Clients: ${clients.length}, Leads: ${leads.length}, Tasks: ${tasks.length}, Tx: ${txDocs.length}`);

  await disconnectDB();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
