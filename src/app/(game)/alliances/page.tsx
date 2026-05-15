import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AlliancesContent } from "./AlliancesContent";

export default async function AlliancesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { allianceMember: { include: { alliance: { include: { members: { include: { nation: { select: { id: true, name: true, color: true, totalUnits: true } } } }, treasury: true } } } } },
  });
  if (!nation) redirect("/setup");

  const alliances = await prisma.alliance.findMany({
    where:   { worldId: "world_01", status: "ACTIVE" },
    include: {
      members:  { include: { nation: { select: { id: true, name: true, color: true, totalUnits: true } } } },
      treasury: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <AlliancesContent
      myNationId={nation.id}
      myAlliance={nation.allianceMember?.alliance
        ? {
            id:       nation.allianceMember.alliance.id,
            name:     nation.allianceMember.alliance.name,
            tag:      nation.allianceMember.alliance.tag,
            role:     nation.allianceMember.role,
            treasury: nation.allianceMember.alliance.treasury?.gold ?? 0,
            members:  nation.allianceMember.alliance.members.map((m) => ({
              nationId:   m.nation.id,
              name:       m.nation.name,
              color:      m.nation.color,
              totalUnits: m.nation.totalUnits,
              role:       m.role,
            })),
          }
        : null}
      alliances={alliances.map((a) => ({
        id:          a.id,
        name:        a.name,
        tag:         a.tag,
        memberCount: a.members.length,
        treasury:    a.treasury?.gold ?? 0,
        totalUnits:  a.members.reduce((s, m) => s + m.nation.totalUnits, 0),
      }))}
    />
  );
}
