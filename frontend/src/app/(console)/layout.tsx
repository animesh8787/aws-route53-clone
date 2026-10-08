import { ConsoleShell } from "@/components/layout/ConsoleShell";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
