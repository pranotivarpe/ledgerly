import { PrismaPg } from '@prisma/adapter-pg';
import { seedDemo } from '../src/demo/seed-demo.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

console.log('Seeding demo workspace…');
seedDemo(prisma, console.log)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
