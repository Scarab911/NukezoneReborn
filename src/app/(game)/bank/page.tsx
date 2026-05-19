import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BankContent } from "./BankContent";

export default async function BankPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: {
      resource:    { select: { money: true } },
      bankAccount: { include: { transactions: { orderBy: { createdAt: "desc" }, take: 20 } } },
    },
  });
  if (!nation) redirect("/setup");

  return (
    <BankContent
      money={nation.resource?.money ?? 0}
      balance={nation.bankAccount?.balance ?? 0}
      transactions={(nation.bankAccount?.transactions ?? []).map((t) => ({
        id: t.id, type: t.type, amount: t.amount, createdAt: t.createdAt.toISOString(),
      }))}
    />
  );
}
