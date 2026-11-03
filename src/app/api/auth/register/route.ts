import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();
  const parsed = RegisterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  const existing = await prisma.player.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered." }, { status: 409 });
  }

  const passwordHash = await hash(password, 12);

  await prisma.player.create({
    data: {
      email,
      passwordHash,
    },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
