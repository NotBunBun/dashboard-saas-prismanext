import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
const prisma = new PrismaClient()

async function main() {
  const password = await bcrypt.hash('admin123', 10)
  const user = await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: {},
    create: { email: 'admin@demo.local', name: 'Admin', password }
  })
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'ACME Corp', slug: 'acme' }
  })
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    update: {},
    create: { userId: user.id, tenantId: tenant.id, role: 'OWNER' }
  })
  const cust = await prisma.customer.upsert({
    where: { email: 'billing@jane.example' },
    update: { name: 'Jane Doe LLC' },
    create: { tenantId: tenant.id, name: 'Jane Doe LLC', email: 'billing@jane.example' }
  })
  await prisma.invoice.createMany({
    data: [
      { tenantId: tenant.id, customerId: cust.id, amountCents: 1999, status: 'SENT' },
      { tenantId: tenant.id, customerId: cust.id, amountCents: 4999, status: 'PAID' }
    ],
    skipDuplicates: true
  })
  const today = new Date(); today.setHours(0,0,0,0)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i)
    await prisma.metric.upsert({
      where: { tenantId_day: { tenantId: tenant.id, day: d } },
      update: {},
      create: { tenantId: tenant.id, day: d, mrrCents: 5000 + i * 150, activeUsers: 10 + i }
    })
  }
  console.log('Seed OK: admin@demo.local / admin123, tenant acme')
}
main().finally(()=>prisma.$disconnect())
