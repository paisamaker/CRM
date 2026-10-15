import type { Request } from 'express';
import { AuditLog } from '../models/AuditLog.js';
import type { Types } from 'mongoose';

export async function writeAudit(opts: {
  actor: Types.ObjectId | string;
  action: string;
  entity: string;
  entityId?: string | string[];
  before?: unknown;
  after?: unknown;
  req?: Request;
}): Promise<void> {
  await AuditLog.create({
    actor: opts.actor,
    action: opts.action,
    entity: opts.entity,
    entityId: opts.entityId,
    before: opts.before,
    after: opts.after,
    ip: opts.req?.ip,
    userAgent: opts.req?.get('user-agent'),
  });
}
