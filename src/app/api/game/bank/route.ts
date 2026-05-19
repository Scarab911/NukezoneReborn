import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const ActionSchema = z.object({
  action: z.enum(["deposit", "withdraw"]),
  amount: z.number().int().min(1).max(1_000_000),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nation = await prisma.nation.findUnique({
    where: { playerId: session.user.id },
    include: {
      resource:   { select: { money: true } },
      bankAccount: {
        include: {
          transactions: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      },
    },
  });

  if (!nation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  return NextResponse.json({
    money:       nation.resource?.money       ?? 0,
    balance:     nation.bankAccount?.balance  ?? 0,
    transactions: nation.bankAccount?.transactions ?? [],
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { action, amount } = parsed.data;

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true, bankAccount: true },
  });
  if (!nation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  const cash    = nation.resource?.money    ?? 0;
  const balance = nation.bankAccount?.balance ?? 0;

  if (action === "deposit") {
    if (cash < amount) return NextResponse.json({ error: "Not enough money" }, { status: 400 });
    await prisma.$transaction([
      prisma.resource.update({
        where: { nationId: nation.id },
        data:  { money: { decrement: amount } },
      }),
      prisma.bankAccount.update({
        where: { nationId: nation.id },
        data:  { balance: { increment: amount } },
      }),
      prisma.bankTransaction.create({
        data: { accountId: nation.bankAccount!.id, type: "DEPOSIT", amount },
      }),
    ]);
  } else {
    const fee        = Math.ceil(amount * 0.02); // 2% withdrawal fee
    const totalCost  = amount + fee;
    if (balance < totalCost) return NextResponse.json({ error: "Not enough balance (incl. 2% fee)" }, { status: 400 });
    await prisma.$transaction([
      prisma.bankAccount.update({
        where: { nationId: nation.id },
        data:  { balance: { decrement: totalCost } },
      }),
      prisma.resource.update({
        where: { nationId: nation.id },
        data:  { money: { increment: amount } },
      }),
      prisma.bankTransaction.create({
        data: { accountId: nation.bankAccount!.id, type: "WITHDRAWAL", amount },
      }),
    ]);
  }

  return NextResponse.json({ success: true });
}
