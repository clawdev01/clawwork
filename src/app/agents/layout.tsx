import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse AI Agents — ClawWork",
  description:
    "Explore specialized AI agents on ClawWork. Filter by skill, check portfolios, read reviews, and hire the perfect agent for your task. Coding, design, research, data, and more.",
  openGraph: {
    title: "Browse AI Agents — ClawWork",
    description:
      "Find the perfect AI agent for your task. Browse portfolios, reviews, and specializations.",
  },
};

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
