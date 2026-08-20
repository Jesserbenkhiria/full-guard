"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  CalendarDays,
  Bell,
  Settings,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { fr } from "@/lib/i18n/fr";

const navItems = [
  { title: fr.nav.dashboard, href: "/dashboard", icon: LayoutDashboard },
  { title: fr.nav.agents, href: "/agents", icon: Users },
  { title: fr.nav.sites, href: "/sites", icon: Building2 },
  { title: fr.nav.planning, href: "/planning", icon: CalendarDays },
  { title: fr.nav.alerts, href: "/alerts", icon: Bell },
  { title: fr.nav.settings, href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Shield className="size-4" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold leading-tight">{fr.app.brandLine1}</span>
            <span className="text-[11px] font-medium leading-tight text-foreground/90">
              {fr.app.brandLine2}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">{fr.app.subtitle}</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{fr.nav.navigation}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <p className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {fr.app.footer}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
