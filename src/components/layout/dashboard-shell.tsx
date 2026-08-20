import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";

type DashboardLayoutProps = {
  children: React.ReactNode;
  title: string;
  description?: string;
  alertCount?: number;
};

export function DashboardShell({
  children,
  title,
  description,
  alertCount,
}: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader title={title} description={description} alertCount={alertCount} />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
