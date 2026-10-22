import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/shell/WorkspaceShell";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <WorkspaceShell eventId={eventId} />;
}
