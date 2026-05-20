import { PrismaClient } from '@prisma/client';
import { cents } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
const prisma = new PrismaClient();
async function main() {
  await prisma.settlement.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hashPassword('password123');
  const alice = await prisma.user.create({ data: { name: 'Alice', email: 'alice@example.com', passwordHash } });
  const bob = await prisma.user.create({ data: { name: 'Bob', email: 'bob@example.com', passwordHash } });
  const carla = await prisma.user.create({ data: { name: 'Carla', email: 'carla@example.com', passwordHash } });
  const davide = await prisma.user.create({ data: { name: 'Davide', email: 'davide@example.com', passwordHash } });

  const roma = await prisma.group.create({ data: { name: 'Weekend a Roma', type: 'trip', currency: 'EUR', members: { create: [
    { userId: alice.id, role: 'OWNER' }, { userId: bob.id }, { userId: carla.id }
  ] } } });
  await prisma.expense.create({ data: {
    groupId: roma.id, title: 'Cena Trastevere', category: 'food', total: cents(90), currency: 'EUR', splitKind: 'equal',
    payers: { create: [{ userId: alice.id, amount: cents(90) }] },
    splits: { create: [{ userId: alice.id, amount: cents(30) }, { userId: bob.id, amount: cents(30) }, { userId: carla.id, amount: cents(30) }] }
  }});
  await prisma.expense.create({ data: {
    groupId: roma.id, title: 'Taxi stazione', category: 'transport', total: cents(36), currency: 'EUR', splitKind: 'exact',
    payers: { create: [{ userId: bob.id, amount: cents(36) }] },
    splits: { create: [{ userId: alice.id, amount: cents(12) }, { userId: bob.id, amount: cents(12) }, { userId: carla.id, amount: cents(12) }] }
  }});
  await prisma.expense.create({ data: {
    groupId: roma.id, title: 'Museo', category: 'travel', total: cents(54), currency: 'EUR', splitKind: 'equal',
    payers: { create: [{ userId: carla.id, amount: cents(54) }] },
    splits: { create: [{ userId: alice.id, amount: cents(18) }, { userId: bob.id, amount: cents(18) }, { userId: carla.id, amount: cents(18) }] }
  }});

  const casa = await prisma.group.create({ data: { name: 'Casa Milano', type: 'home', currency: 'EUR', members: { create: [
    { userId: bob.id, role: 'OWNER' }, { userId: davide.id }
  ] } } });
  await prisma.expense.create({ data: {
    groupId: casa.id, title: 'Spesa supermercato', category: 'food', total: cents(64.80), currency: 'EUR', splitKind: 'equal',
    payers: { create: [{ userId: davide.id, amount: cents(64.80) }] },
    splits: { create: [{ userId: bob.id, amount: cents(32.40) }, { userId: davide.id, amount: cents(32.40) }] }
  }});

  console.log({ demoLogin: 'alice@example.com / password123', otherLogin: 'bob@example.com / password123', roma: roma.id, casa: casa.id });
}
main().finally(() => prisma.$disconnect());
