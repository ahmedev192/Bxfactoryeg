import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.globalSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || (isProduction ? '' : 'admin@company.com');
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (isProduction ? '' : 'admin123');

  if (isProduction && (!adminEmail || !adminPassword || adminPassword.length < 12)) {
    console.log('Production seed skipped: set SEED_ADMIN_EMAIL and a strong SEED_ADMIN_PASSWORD to create the initial admin.');
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        passwordHash,
        name: process.env.SEED_ADMIN_NAME || 'مدير النظام',
        role: UserRole.ADMIN,
        passwordChangedAt: new Date(),
      },
      update: {},
    });
  }

  if (!isProduction) {
    await prisma.user.upsert({
      where: { email: 'planner@company.com' },
      create: {
        email: 'planner@company.com',
        passwordHash: await bcrypt.hash('planner123', 10),
        name: 'مخطط العمليات',
        role: UserRole.PLANNER,
        passwordChangedAt: new Date(),
      },
      update: {},
    });
  }

  const factoryCount = await prisma.factory.count();
  if (factoryCount === 0) {
    await prisma.factory.createMany({
      data: [
        { name: 'مصنع القاهرة', processingDays: 5, costPerUnit: 45, fixedCost: 200, confidencePct: 85, isSplittable: true },
        { name: 'مصنع الإسكندرية', processingDays: 7, costPerUnit: 38, fixedCost: 150, confidencePct: 78, isSplittable: false },
      ],
    });
    await prisma.printingPlace.createMany({
      data: [
        { name: 'مطبعة النيل', processingDays: 2, costPerUnit: 8, fixedCost: 100, confidencePct: 90 },
        { name: 'مطبعة الدلتا', processingDays: 3, costPerUnit: 6, fixedCost: 80, confidencePct: 82, isSplittable: true },
      ],
    });
    await prisma.fabricSupplier.createMany({
      data: [
        { name: 'مورد الأقمشة 1', processingDays: 4, costPerUnit: 25, fixedCost: 50, confidencePct: 88, moq: 100 },
        { name: 'مورد الأقمشة 2', processingDays: 6, costPerUnit: 20, fixedCost: 40, confidencePct: 75, isSplittable: true },
      ],
    });
  }

  console.log(isProduction ? 'Seed complete.' : 'Seed complete. Dev login: admin@company.com / admin123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
