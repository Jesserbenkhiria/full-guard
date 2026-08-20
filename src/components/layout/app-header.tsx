"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { fr } from "@/lib/i18n/fr";

type AppHeaderProps = {
  title: string;
  description?: string;
  alertCount?: number;
};

export function AppHeader({ title, description, alertCount = 0 }: AppHeaderProps) {
  const router = useRouter();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      <div className="flex flex-1 flex-col">
        <h1 className="text-sm font-semibold leading-none">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/alerts"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "relative"
          )}
        >
          <Bell className="size-4" />
          {alertCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
              {alertCount > 9 ? "9+" : alertCount}
            </span>
          )}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="relative size-8 rounded-full" />
            }
          >
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">RP</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{fr.auth.planner}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  planner@guard.local
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              {fr.nav.settings}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>{fr.auth.signOut}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
