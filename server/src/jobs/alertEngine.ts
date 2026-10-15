import cron from 'node-cron';
import { differenceInDays, subDays, subHours, addDays } from 'date-fns';
import { Invoice } from '../models/Invoice.js';
import { Lead } from '../models/Lead.js';
import { Client } from '../models/Client.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Contract } from '../models/Contract.js';
import { Payroll } from '../models/Payroll.js';
import { Approval } from '../models/Approval.js';
import { Alert } from '../models/Alert.js';
import { User } from '../models/User.js';
import { getSettings } from '../models/Settings.js';
import { sendEmail } from '../utils/mailer.js';
import { logger } from '../utils/logger.js';
import { Attendance } from '../models/Attendance.js';
import { companyDateKey } from '../utils/timezone.js';

async function upsertAlert(opts: {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  link?: string;
  dedupeKey: string;
  user?: string;
  meta?: unknown;
}) {
  const existing = await Alert.findOne({
    dedupeKey: opts.dedupeKey,
    status: { $in: ['open', 'snoozed'] },
  });
  if (existing) {
    if (existing.status === 'snoozed' && existing.snoozedUntil && existing.snoozedUntil > new Date()) {
      return null;
    }
    existing.message = opts.message;
    existing.severity = opts.severity;
    await existing.save();
    return existing;
  }

  const alert = await Alert.create({
    type: opts.type,
    severity: opts.severity,
    message: opts.message,
    link: opts.link,
    dedupeKey: opts.dedupeKey,
    user: opts.user,
    meta: opts.meta,
    status: 'open',
  });

  const ceos = await User.find({ role: 'ceo', status: 'active' });
  const targets = opts.user ? [opts.user] : ceos.map((c) => c._id.toString());

  const { notifyUsers } = await import('../utils/notify.js');
  await notifyUsers(targets.map(String), {
    type: 'alert',
    title: `Alert: ${opts.type}`,
    message: opts.message,
    link: opts.link || '/alerts',
    email: false,
  });

  for (const ceo of ceos) {
    await sendEmail({
      to: ceo.email,
      subject: `[${opts.severity.toUpperCase()}] ${opts.type}`,
      html: `<p>${opts.message}</p>`,
    });
  }

  return alert;
}

export async function runAlertEngine() {
  const settings = await getSettings();
  const now = new Date();
  logger.info('Running alert engine');

  // 1. Overdue payments
  const overdueInvoices = await Invoice.find({
    status: { $in: ['sent', 'partially_paid', 'overdue'] },
    dueDate: { $lt: now },
    $expr: { $lt: ['$paid', '$total'] },
  });
  for (const inv of overdueInvoices) {
    if (inv.status !== 'overdue') {
      inv.status = 'overdue';
      await inv.save();
    }
    const days = differenceInDays(now, inv.dueDate);
    const thresholds = settings.alertThresholds.overdueInvoiceDays;
    const hit = thresholds.filter((d) => days >= d).pop();
    if (hit != null) {
      await upsertAlert({
        type: 'overdue_payment',
        severity: days >= 30 ? 'critical' : days >= 15 ? 'warning' : 'info',
        message: `Invoice ${inv.number} is ${days} days overdue (₹${inv.total - inv.paid} outstanding)`,
        link: `/finance/invoices/${inv._id}`,
        dedupeKey: `overdue_invoice:${inv._id}:${hit}`,
        meta: { invoiceId: inv._id, days },
      });
    }
  }

  // 2. Client / lead follow-up
  const followUpDays = settings.alertThresholds.clientFollowUpDays;
  const staleLeads = await Lead.find({
    stage: { $nin: ['won', 'lost'] },
    $or: [
      { nextFollowUp: { $lte: now } },
      { lastActivityAt: { $lte: subDays(now, followUpDays) } },
      { lastActivityAt: null, createdAt: { $lte: subDays(now, followUpDays) } },
    ],
  }).limit(50);
  for (const lead of staleLeads) {
    await upsertAlert({
      type: 'client_followup',
      severity: 'warning',
      message: `Follow up needed: lead ${lead.name}`,
      link: `/leads/${lead._id}`,
      dedupeKey: `followup_lead:${lead._id}:${formatDay(now)}`,
      user: lead.owner.toString(),
    });
  }

  const staleClients = await Client.find({
    status: 'active',
    lastActivityAt: { $lte: subDays(now, followUpDays) },
  }).limit(50);
  for (const client of staleClients) {
    await upsertAlert({
      type: 'client_followup',
      severity: 'info',
      message: `No activity with client ${client.name} for ${followUpDays}+ days`,
      link: `/clients/${client._id}`,
      dedupeKey: `followup_client:${client._id}:${formatDay(now)}`,
      user: client.owner.toString(),
    });
  }

  // 3. Project deadline warning
  const warnDays = settings.alertThresholds.projectDeadlineWarningDays;
  const dueProjects = await Project.find({
    status: { $in: ['active', 'planned'] },
    endDate: { $gte: now, $lte: addDays(now, warnDays) },
  });
  for (const p of dueProjects) {
    await upsertAlert({
      type: 'project_deadline',
      severity: 'warning',
      message: `Project "${p.name}" due within ${warnDays} days`,
      link: `/projects/${p._id}`,
      dedupeKey: `project_deadline:${p._id}`,
    });
  }

  const dueTasks = await Task.find({
    status: { $ne: 'completed' },
    dueDate: { $gte: now, $lte: addDays(now, warnDays) },
  });
  for (const t of dueTasks) {
    await upsertAlert({
      type: 'project_deadline',
      severity: 'info',
      message: `Task "${t.title}" due soon`,
      link: `/tasks/${t._id}`,
      dedupeKey: `task_deadline:${t._id}`,
      user: t.assignees[0]?.toString(),
    });
  }

  // 4. Overdue task escalation
  const overdueTasks = await Task.find({
    status: { $ne: 'completed' },
    dueDate: { $lt: now },
  });
  const managers = await User.find({ role: 'manager', status: 'active' });
  const ceos = await User.find({ role: 'ceo', status: 'active' });
  for (const t of overdueTasks) {
    const days = differenceInDays(now, t.dueDate!);
    if (days >= settings.alertThresholds.taskEscalateCeoDays) {
      for (const ceo of ceos) {
        await upsertAlert({
          type: 'overdue_task',
          severity: 'critical',
          message: `Task "${t.title}" overdue ${days} days — escalated to CEO`,
          link: `/tasks/${t._id}`,
          dedupeKey: `overdue_task_ceo:${t._id}`,
          user: ceo._id.toString(),
        });
      }
    } else if (days >= settings.alertThresholds.taskEscalateManagerDays) {
      for (const m of managers) {
        await upsertAlert({
          type: 'overdue_task',
          severity: 'warning',
          message: `Task "${t.title}" overdue ${days} day(s)`,
          link: `/tasks/${t._id}`,
          dedupeKey: `overdue_task_mgr:${t._id}`,
          user: m._id.toString(),
        });
      }
    }
  }

  // 5. Performance metrics (simplified: low completion)
  // 6. Contract renewal
  for (const d of settings.alertThresholds.contractRenewalDays) {
    const contracts = await Contract.find({
      status: 'active',
      renewalDate: {
        $gte: addDays(now, d - 1),
        $lte: addDays(now, d),
      },
    });
    for (const c of contracts) {
      await upsertAlert({
        type: 'contract_renewal',
        severity: d <= 7 ? 'critical' : 'warning',
        message: `Contract "${c.name}" renews in ~${d} days`,
        link: `/finance/contracts`,
        dedupeKey: `contract_renewal:${c._id}:${d}`,
      });
    }
  }

  // 7. Payroll status
  const payrollDue = await Payroll.find({
    status: { $in: ['draft', 'pending_approval'] },
    periodEnd: {
      $lte: addDays(now, settings.alertThresholds.payrollDueDays),
      $gte: now,
    },
  });
  for (const p of payrollDue) {
    await upsertAlert({
      type: 'payroll_status',
      severity: 'warning',
      message: `Payroll ${p.period} needs approval/disbursement`,
      link: '/finance/payroll',
      dedupeKey: `payroll:${p._id}`,
    });
  }

  // 8. Executive approval priority
  const staleApprovals = await Approval.find({
    status: 'pending',
    createdAt: { $lte: subHours(now, settings.alertThresholds.approvalPendingHours) },
  });
  for (const a of staleApprovals) {
    await upsertAlert({
      type: 'approval_priority',
      severity: a.amount >= settings.alertThresholds.approvalCriticalAmount ? 'critical' : 'warning',
      message: `Approval pending >${settings.alertThresholds.approvalPendingHours}h: ${a.title} (₹${a.amount})`,
      link: '/approvals',
      dedupeKey: `approval_stale:${a._id}`,
    });
  }

  const criticalApprovals = await Approval.find({
    status: 'pending',
    amount: { $gte: settings.alertThresholds.approvalCriticalAmount },
  });
  for (const a of criticalApprovals) {
    await upsertAlert({
      type: 'approval_priority',
      severity: 'critical',
      message: `High-value approval pending: ${a.title} (₹${a.amount})`,
      link: '/approvals',
      dedupeKey: `approval_critical:${a._id}`,
    });
  }

  // 9. Mark missing check-outs for prior open sessions (not early-day absences)
  const todayKey = companyDateKey();
  const missing = await Attendance.updateMany(
    {
      date: { $lt: todayKey },
      checkInAt: { $ne: null },
      checkOutAt: null,
      status: 'checked_in',
    },
    { status: 'missing_checkout' }
  );
  if (missing.modifiedCount) {
    await upsertAlert({
      type: 'attendance_exception',
      severity: 'warning',
      message: `${missing.modifiedCount} attendance record(s) marked missing check-out`,
      link: '/attendance',
      dedupeKey: `attendance_missing:${todayKey}`,
    });
  }

  logger.info('Alert engine finished');
}

function formatDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function sendCeoDigest() {
  const ceos = await User.find({ role: 'ceo', status: 'active' });
  const open = await Alert.find({ status: 'open' }).sort({ severity: -1 }).limit(30).lean();
  if (!open.length) return;
  const html = `<h2>Daily Alert Digest</h2><ul>${open
    .map((a) => `<li><b>[${a.severity}]</b> ${a.message}</li>`)
    .join('')}</ul>`;
  for (const ceo of ceos) {
    await sendEmail({ to: ceo.email, subject: 'STAR MEDIA CRM — Daily Alert Digest', html });
  }
}

export function startJobs() {
  cron.schedule('0 * * * *', () => {
    runAlertEngine().catch((err) => logger.error({ err }, 'Alert engine hourly failed'));
  });
  cron.schedule('0 8 * * *', () => {
    runAlertEngine()
      .then(() => sendCeoDigest())
      .catch((err) => logger.error({ err }, 'Alert engine daily failed'));
  });
  logger.info('Cron jobs scheduled');
}
