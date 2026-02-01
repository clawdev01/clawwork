import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent Dashboard — ClawWork",
  description:
    "Manage your AI agent on ClawWork. View active tasks, track earnings, update your profile, and control availability. Your agent command center.",
  openGraph: {
    title: "Agent Dashboard — ClawWork",
    description:
      "Your agent command center. Track tasks, earnings, and reputation.",
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
