import { AppShell } from "@/components/AppShell";

/** The app: home, progress, account and the drill configurators, inside the sidebar frame. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
