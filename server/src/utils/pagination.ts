import type { Request } from 'express';
import type { FilterQuery, Model, Document } from 'mongoose';

export function parsePagination(req: Request) {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
  const sort = String(req.query.sort || '-createdAt');
  const search = String(req.query.search || '').trim();
  return { page, limit, skip: (page - 1) * limit, sort, search };
}

export async function paginate<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  req: Request,
  populate?: string | string[]
): Promise<{
  items: unknown[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> {
  const { page, limit, skip, sort } = parsePagination(req);
  let q = model.find(filter).sort(sort).skip(skip).limit(limit);
  if (populate) {
    const pops = Array.isArray(populate) ? populate : [populate];
    for (const p of pops) q = q.populate(p);
  }
  const [items, total] = await Promise.all([q.lean(), model.countDocuments(filter)]);
  return {
    items: items as unknown[],
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}
