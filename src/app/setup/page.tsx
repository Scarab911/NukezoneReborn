import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDestroyedEnclaveName, hasLivingEnclave } from "@/server/services/nation.service";
import { SetupForm } from "./SetupForm";

export default async function SetupPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (await hasLivingEnclave(session.user.id)) redirect("/dashboard");

  const destroyedName = await getDestroyedEnclaveName(session.user.id);
  return <SetupForm destroyedName={destroyedName} />;
}
