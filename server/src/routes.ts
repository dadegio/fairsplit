import { Router } from 'express';
import { z } from 'zod';
import { prisma, cents, money } from './db.js';
import { calculateSimplified } from './domain.js';
import { featuresForEveryone } from './features.js';
import { convert } from './currency.js';
import { scanReceipt } from './ocr.js';
import { toCsv } from '@fairsplit/core';
import { createToken, hashPassword, readBearerToken, verifyPassword, verifyToken } from './auth.js';
import webpush from 'web-push';

export const router = Router();

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? '';
const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@fairsplit.local';
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}


const asyncHandler = (fn: any) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
const idSchema = z.string().min(1);
const emailSchema = z.string().email().transform(v => v.trim().toLowerCase());
const passwordSchema = z.string().min(8, 'PASSWORD_MIN_8_CHARS');

async function currentUser(req: any) {
  const token = readBearerToken(req);
  const session = token ? verifyToken(token) : null;
  if (session) return prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

  // Dev fallback kept so old scripts still work, but the web app uses Bearer auth.
  const legacyId = req.header('x-user-id');
  if (legacyId) return prisma.user.findUniqueOrThrow({ where: { id: legacyId } });

  const err: any = new Error('AUTH_REQUIRED');
  err.status = 401;
  throw err;
}

function normalizeExpense(e: any) {
  return {
    ...e,
    total: money(e.total),
    payers: e.payers?.map((p: any) => ({ ...p, amount: money(p.amount) })) ?? [],
    splits: e.splits?.map((s: any) => ({ ...s, amount: money(s.amount) })) ?? []
  };
}

function nameFromEmail(email: string) {
  return email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function userGroupIds(userId: string) {
  const memberships = await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
  return memberships.map(m => m.groupId);
}

async function assertGroupMember(groupId: string | undefined | null, userId: string) {
  if (!groupId) return;
  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
  if (!membership) {
    const err: any = new Error('NOT_A_GROUP_MEMBER');
    err.status = 403;
    throw err;
  }
}

function normalizeReceipt(r: any) {
  return {
    ...r,
    imageDataUrl: r.imageDataUrl,
    uploader: r.uploader ? { id: r.uploader.id, name: r.uploader.name, email: r.uploader.email } : undefined,
    expense: r.expense ? { id: r.expense.id, title: r.expense.title, total: money(r.expense.total), currency: r.expense.currency, date: r.expense.date } : undefined
  };
}

async function notifyGroupMembers(groupId: string | undefined | null, actorId: string, payload: { title: string; body: string; url?: string; tag?: string }) {
  if (!groupId || !vapidPublicKey || !vapidPrivateKey) return;
  const members = await prisma.groupMember.findMany({
    where: { groupId, userId: { not: actorId } },
    include: { user: { include: { pushSubscriptions: true } } }
  });
  const subscriptions = members.flatMap(m => m.user.pushSubscriptions);
  await Promise.allSettled(subscriptions.map(async sub => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as any, JSON.stringify(payload));
    } catch (err: any) {
      if ([404, 410].includes(Number(err?.statusCode))) {
        await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => undefined);
      }
    }
  }));
}

router.post('/auth/register', asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().min(1), email: emailSchema, password: passwordSchema }).parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) return res.status(409).json({ error: 'EMAIL_ALREADY_REGISTERED' });
  const user = await prisma.user.create({ data: {
    email: body.email,
    name: body.name,
    passwordHash: await hashPassword(body.password),
    defaultCurrency: 'EUR'
  }});
  res.status(201).json({ token: createToken(user), user: { ...user, features: featuresForEveryone() } });
}));

router.post('/auth/login', asyncHandler(async (req, res) => {
  const body = z.object({ email: emailSchema, password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return res.status(401).json({ error: 'INVALID_EMAIL_OR_PASSWORD' });
  }
  res.json({ token: createToken(user), user: { ...user, features: featuresForEveryone() } });
}));

router.get('/me', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  res.json({ ...user, features: featuresForEveryone() });
}));

router.get('/users', asyncHandler(async (req, res) => {
  await currentUser(req);
  res.json(await prisma.user.findMany({ orderBy: { name: 'asc' } }));
}));

router.post('/users', asyncHandler(async (req, res) => {
  await currentUser(req);
  const body = z.object({ name: z.string().min(1), email: emailSchema, password: passwordSchema, defaultCurrency: z.string().default('EUR') }).parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) return res.status(409).json({ error: 'EMAIL_ALREADY_REGISTERED' });
  const user = await prisma.user.create({ data: { name: body.name, email: body.email, defaultCurrency: body.defaultCurrency, passwordHash: await hashPassword(body.password) } });
  res.status(201).json(user);
}));

router.post('/users/by-email', asyncHandler(async (req, res) => {
  await currentUser(req);
  const body = z.object({ email: emailSchema }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  res.json(user);
}));

router.patch('/users/:id', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  if (user.id !== req.params.id) return res.status(403).json({ error: 'CAN_ONLY_EDIT_CURRENT_USER' });
  const body = z.object({ name: z.string().min(1).optional(), email: emailSchema.optional(), defaultCurrency: z.string().optional(), password: passwordSchema.optional() }).parse(req.body);
  const data: any = { ...body };
  if (body.password) { data.passwordHash = await hashPassword(body.password); delete data.password; }
  const updated = await prisma.user.update({ where: { id: req.params.id }, data });
  res.json({ ...updated, features: featuresForEveryone() });
}));

router.get('/notifications/config', asyncHandler(async (req, res) => {
  await currentUser(req);
  res.json({ enabled: Boolean(vapidPublicKey && vapidPrivateKey), publicKey: vapidPublicKey });
}));

router.post('/notifications/subscribe', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const body = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).parse(req.body);
  const saved = await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    update: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
    create: { userId: user.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth }
  });
  res.status(201).json({ ok: true, id: saved.id });
}));

router.get('/groups', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  res.json(await prisma.group.findMany({
    where: { members: { some: { userId: user.id } } },
    include: { members: { include: { user: true }, orderBy: { role: 'asc' } }, _count: { select: { expenses: true } } },
    orderBy: { createdAt: 'desc' }
  }));
}));

router.post('/groups', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const body = z.object({ name: z.string().min(1), type: z.string().default('general'), currency: z.string().default('EUR'), memberIds: z.array(z.string()).default([]), memberEmails: z.array(emailSchema).default([]), simplifyDebts: z.boolean().default(true) }).parse(req.body);

  const invitedUsers = body.memberEmails.length
    ? await prisma.user.findMany({ where: { email: { in: body.memberEmails } } })
    : [];
  const foundEmails = new Set(invitedUsers.map(u => u.email));
  const missingEmails = body.memberEmails.filter(email => !foundEmails.has(email));
  if (missingEmails.length) return res.status(404).json({ error: 'USERS_NOT_FOUND', missingEmails });
  const memberIds = [...new Set([user.id, ...body.memberIds, ...invitedUsers.map(u => u.id)])];
  const group = await prisma.group.create({ data: {
    name: body.name,
    type: body.type,
    currency: body.currency,
    simplifyDebts: body.simplifyDebts,
    members: { create: memberIds.map(userId => ({ userId, role: userId === user.id ? 'OWNER' : 'MEMBER' })) }
  }, include: { members: { include: { user: true } }, _count: { select: { expenses: true } } } });
  res.status(201).json(group);
}));


router.delete('/groups/:id', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: req.params.id, userId: user.id } }
  });
  if (!membership) return res.status(403).json({ error: 'NOT_A_GROUP_MEMBER' });
  if (!['OWNER', 'ADMIN'].includes(membership.role)) return res.status(403).json({ error: 'ONLY_OWNER_CAN_DELETE_GROUP' });

  await prisma.$transaction(async tx => {
    const expenses = await tx.expense.findMany({ where: { groupId: req.params.id }, select: { id: true } });
    const expenseIds = expenses.map(e => e.id);
    if (expenseIds.length) {
      await tx.comment.deleteMany({ where: { expenseId: { in: expenseIds } } });
      await tx.expensePayer.deleteMany({ where: { expenseId: { in: expenseIds } } });
      await tx.expenseSplit.deleteMany({ where: { expenseId: { in: expenseIds } } });
      await tx.recurrence.deleteMany({ where: { expenseId: { in: expenseIds } } });
    }
    await tx.receiptArchive.deleteMany({ where: { groupId: req.params.id } });
    await tx.settlement.deleteMany({ where: { groupId: req.params.id } });
    await tx.expense.deleteMany({ where: { groupId: req.params.id } });
    await tx.groupMember.deleteMany({ where: { groupId: req.params.id } });
    await tx.group.delete({ where: { id: req.params.id } });
  });
  res.status(204).end();
}));

router.get('/groups/:id', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const isMember = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: req.params.id, userId: user.id } } });
  if (!isMember) return res.status(403).json({ error: 'NOT_A_GROUP_MEMBER' });
  const group = await prisma.group.findUniqueOrThrow({ where: { id: req.params.id }, include: {
    members: { include: { user: true } },
    expenses: { where: { status: 'active' }, include: { payers: { include: { user: true } }, splits: { include: { user: true } } }, orderBy: { date: 'desc' } },
    settlements: { include: { fromUser: true, toUser: true }, orderBy: { date: 'desc' } }
  }});
  res.json({ ...group, expenses: group.expenses.map(normalizeExpense), settlements: group.settlements.map(s => ({ ...s, amount: money(s.amount) })) });
}));

router.patch('/groups/:id', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  await assertGroupMember(req.params.id, user.id);
  const body = z.object({ name: z.string().min(1).optional(), type: z.string().optional(), currency: z.string().optional(), simplifyDebts: z.boolean().optional() }).parse(req.body);
  const group = await prisma.group.update({ where: { id: req.params.id }, data: body, include: { members: { include: { user: true } }, _count: { select: { expenses: true } } } });
  res.json(group);
}));

router.post('/groups/:id/members', asyncHandler(async (req, res) => {
  const actor = await currentUser(req);
  await assertGroupMember(req.params.id, actor.id);
  const body = z.object({ userId: idSchema.optional(), email: emailSchema.optional(), role: z.string().default('MEMBER') }).parse(req.body);
  let userId = body.userId;
  if (!userId && body.email) {
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    userId = user.id;
  }
  if (!userId) return res.status(400).json({ error: 'USER_OR_EMAIL_REQUIRED' });
  const member = await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: req.params.id, userId } },
    update: { role: body.role },
    create: { groupId: req.params.id, userId, role: body.role },
    include: { user: true }
  });
  res.status(201).json(member);
}));

router.delete('/groups/:groupId/members/:userId', asyncHandler(async (req, res) => {
  const actor = await currentUser(req);
  await assertGroupMember(req.params.groupId, actor.id);
  await prisma.groupMember.delete({ where: { groupId_userId: { groupId: req.params.groupId, userId: req.params.userId } } });
  res.status(204).end();
}));

const payerSchema = z.object({ userId: z.string(), amount: z.number().positive() });
const splitSchema = z.object({ userId: z.string(), amount: z.number().nonnegative(), rawValue: z.number().optional() });
const expenseSchema = z.object({
  groupId: z.string().optional(), title: z.string().min(1), category: z.string().default('general'), description: z.string().optional(),
  total: z.number().positive(), currency: z.string().default('EUR'), splitKind: z.enum(['equal','exact','percentage','shares','adjustment']),
  date: z.string().datetime().optional(), payers: z.array(payerSchema).min(1), splits: z.array(splitSchema).min(1), receiptUrl: z.string().optional()
}).refine(v => Math.abs(v.payers.reduce((a, p) => a + p.amount, 0) - v.total) < 0.02, 'Payers must sum to total')
  .refine(v => Math.abs(v.splits.reduce((a, s) => a + s.amount, 0) - v.total) < 0.05, 'Splits must sum to total');

router.post('/expenses', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const body = expenseSchema.parse(req.body);
  await assertGroupMember(body.groupId, user.id);
  const expense = await prisma.expense.create({ data: {
    groupId: body.groupId, title: body.title, category: body.category, description: body.description,
    total: cents(body.total), currency: body.currency, splitKind: body.splitKind, receiptUrl: body.receiptUrl, date: body.date ? new Date(body.date) : new Date(),
    payers: { create: body.payers.map(p => ({ userId: p.userId, amount: cents(p.amount) })) },
    splits: { create: body.splits.map(s => ({ userId: s.userId, amount: cents(s.amount), rawValue: s.rawValue })) }
  }, include: { payers: { include: { user: true } }, splits: { include: { user: true } }, group: true }});
  void notifyGroupMembers(body.groupId, user.id, {
    title: 'Nuova spesa nel gruppo',
    body: `${user.name} ha aggiunto: ${body.title} · ${body.total.toFixed(2)} ${body.currency}`,
    url: '/',
    tag: `expense-${expense.id}`
  });
  res.status(201).json(normalizeExpense(expense));
}));

router.get('/expenses', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const q = String(req.query.q ?? '').toLowerCase();
  const groupId = req.query.groupId ? String(req.query.groupId) : undefined;
  if (groupId) await assertGroupMember(groupId, user.id);
  const groupIds = groupId ? [groupId] : await userGroupIds(user.id);
  const rows = await prisma.expense.findMany({
    where: { status: 'active', groupId: { in: groupIds }, ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { category: { contains: q, mode: 'insensitive' as const } }, { description: { contains: q, mode: 'insensitive' as const } }] } : {}) },
    include: { payers: { include: { user: true } }, splits: { include: { user: true } }, group: true },
    orderBy: { date: 'desc' }
  });
  res.json(rows.map(normalizeExpense));
}));

router.get('/expenses/:id', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const e = await prisma.expense.findUniqueOrThrow({ where: { id: req.params.id }, include: { payers: { include: { user: true } }, splits: { include: { user: true } }, group: true, comments: { include: { user: true }, orderBy: { createdAt: 'desc' } } } });
  await assertGroupMember(e.groupId, user.id);
  res.json(normalizeExpense(e));
}));

router.put('/expenses/:id', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const body = expenseSchema.parse(req.body);
  await assertGroupMember(body.groupId, user.id);
  const expense = await prisma.$transaction(async tx => {
    await tx.expensePayer.deleteMany({ where: { expenseId: req.params.id } });
    await tx.expenseSplit.deleteMany({ where: { expenseId: req.params.id } });
    return tx.expense.update({ where: { id: req.params.id }, data: {
      groupId: body.groupId, title: body.title, category: body.category, description: body.description,
      total: cents(body.total), currency: body.currency, splitKind: body.splitKind, receiptUrl: body.receiptUrl, date: body.date ? new Date(body.date) : new Date(),
      payers: { create: body.payers.map(p => ({ userId: p.userId, amount: cents(p.amount) })) },
      splits: { create: body.splits.map(s => ({ userId: s.userId, amount: cents(s.amount), rawValue: s.rawValue })) }
    }, include: { payers: { include: { user: true } }, splits: { include: { user: true } }, group: true }});
  });
  res.json(normalizeExpense(expense));
}));

router.delete('/expenses/:id', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const existing = await prisma.expense.findUniqueOrThrow({ where: { id: req.params.id } });
  await assertGroupMember(existing.groupId, user.id);
  await prisma.expense.update({ where: { id: req.params.id }, data: { status: 'deleted' } });
  res.status(204).end();
}));

router.post('/expenses/:id/comments', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const body = z.object({ body: z.string().min(1) }).parse(req.body);
  const comment = await prisma.comment.create({ data: { expenseId: req.params.id, userId: user.id, body: body.body }, include: { user: true } });
  res.status(201).json(comment);
}));

router.post('/settlements', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const body = z.object({ groupId: z.string().optional(), fromUserId: z.string(), toUserId: z.string(), amount: z.number().positive(), currency: z.string().default('EUR'), note: z.string().optional() }).parse(req.body);
  await assertGroupMember(body.groupId, user.id);
  const settlement = await prisma.settlement.create({
    data: {
      amount: cents(body.amount),
      currency: body.currency,
      note: body.note,
      group: body.groupId ? { connect: { id: body.groupId } } : undefined,
      fromUser: { connect: { id: body.fromUserId } },
      toUser: { connect: { id: body.toUserId } }
    },
    include: { fromUser: true, toUser: true, group: true }
  });
  void notifyGroupMembers(body.groupId, user.id, {
    title: 'Pagamento segnato come saldato',
    body: `${user.name} ha segnato pagato ${body.amount.toFixed(2)} ${body.currency}`,
    url: '/',
    tag: `settlement-${settlement.id}`
  });
  res.status(201).json({ ...settlement, amount: money(settlement.amount) });
}));

router.get('/settlements', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const groupId = req.query.groupId ? String(req.query.groupId) : undefined;
  if (groupId) await assertGroupMember(groupId, user.id);
  const groupIds = groupId ? [groupId] : await userGroupIds(user.id);
  const rows = await prisma.settlement.findMany({ where: { groupId: { in: groupIds } }, include: { fromUser: true, toUser: true, group: true }, orderBy: { date: 'desc' } });
  res.json(rows.map(s => ({ ...s, amount: money(s.amount) })));
}));

router.delete('/settlements/:id', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const existing = await prisma.settlement.findUniqueOrThrow({ where: { id: req.params.id } });
  await assertGroupMember(existing.groupId, user.id);
  await prisma.settlement.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

router.get('/groups/:id/balances', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const isMember = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: req.params.id, userId: user.id } } });
  if (!isMember) return res.status(403).json({ error: 'NOT_A_GROUP_MEMBER' });
  const group = await prisma.group.findUniqueOrThrow({ where: { id: req.params.id } });
  const expenses = await prisma.expense.findMany({ where: { groupId: req.params.id, status: 'active' }, include: { payers: true, splits: true } });
  const settlements = await prisma.settlement.findMany({ where: { groupId: req.params.id } });
  res.json(calculateSimplified(expenses, settlements, group.simplifyDebts));
}));

router.get('/balances', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const groupIds = await userGroupIds(user.id);
  const expenses = await prisma.expense.findMany({ where: { groupId: { in: groupIds }, status: 'active' }, include: { payers: true, splits: true } });
  const settlements = await prisma.settlement.findMany({ where: { groupId: { in: groupIds } } });
  res.json(calculateSimplified(expenses, settlements, true));
}));

router.get('/analytics', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const groupId = req.query.groupId ? String(req.query.groupId) : undefined;
  if (groupId) await assertGroupMember(groupId, user.id);
  const groupIds = groupId ? [groupId] : await userGroupIds(user.id);
  const rows = await prisma.expense.groupBy({ by: ['category','currency'], where: { status: 'active', groupId: { in: groupIds } }, _sum: { total: true }, orderBy: { _sum: { total: 'desc' } } });
  res.json(rows.map(r => ({ category: r.category, currency: r.currency, total: money(r._sum.total ?? 0) })));
}));

router.post('/tools/convert', asyncHandler(async (req, res) => {
  await currentUser(req);
  const body = z.object({ amount: z.number(), from: z.string(), to: z.string() }).parse(req.body);
  res.json(await convert(body.amount, body.from, body.to));
}));

router.post('/tools/scan-receipt', asyncHandler(async (req, res) => {
  await currentUser(req);
  res.json(await scanReceipt(String(req.body.imageBase64 ?? '')));
}));


router.get('/receipts', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const groupId = req.query.groupId ? String(req.query.groupId) : undefined;
  if (groupId) await assertGroupMember(groupId, user.id);
  const groupIds = groupId ? [groupId] : await userGroupIds(user.id);
  const rows = await prisma.receiptArchive.findMany({
    where: { groupId: { in: groupIds } },
    include: { uploader: true, group: true, expense: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(rows.map(normalizeReceipt));
}));

router.post('/receipts', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const body = z.object({
    groupId: z.string(),
    imageDataUrl: z.string().min(50),
    fileName: z.string().optional(),
    mimeType: z.string().default('image/jpeg'),
    note: z.string().optional(),
    expenseId: z.string().optional()
  }).parse(req.body);
  await assertGroupMember(body.groupId, user.id);
  if (body.expenseId) {
    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: body.expenseId } });
    if (expense.groupId !== body.groupId) return res.status(400).json({ error: 'EXPENSE_NOT_IN_GROUP' });
    await assertGroupMember(expense.groupId, user.id);
  }
  const receipt = await prisma.receiptArchive.create({
    data: { groupId: body.groupId, uploaderId: user.id, imageDataUrl: body.imageDataUrl, fileName: body.fileName, mimeType: body.mimeType, note: body.note, expenseId: body.expenseId },
    include: { uploader: true, group: true, expense: true }
  });
  void notifyGroupMembers(body.groupId, user.id, {
    title: 'Nuovo scontrino archiviato',
    body: `${user.name} ha aggiunto una scansione scontrino${receipt.expense ? ` per ${receipt.expense.title}` : ''}`,
    url: '/',
    tag: `receipt-${receipt.id}`
  });
  res.status(201).json(normalizeReceipt(receipt));
}));

router.delete('/receipts/:id', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const receipt = await prisma.receiptArchive.findUniqueOrThrow({ where: { id: req.params.id } });
  await assertGroupMember(receipt.groupId, user.id);
  await prisma.receiptArchive.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));


router.get('/export/expenses.csv', asyncHandler(async (req, res) => {
  const user = await currentUser(req);
  const groupIds = await userGroupIds(user.id);
  const rows = await prisma.expense.findMany({ where: { status: 'active', groupId: { in: groupIds } }, include: { group: true }, orderBy: { date: 'desc' } });
  res.type('text/csv').send(toCsv(rows.map(e => ({ id: e.id, title: e.title, category: e.category, total: money(e.total), currency: e.currency, group: e.group?.name ?? '', date: e.date.toISOString() }))));
}));
