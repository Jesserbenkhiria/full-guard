import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { fr } from "@/lib/i18n/fr";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Shield className="size-6" />
          </div>
          <CardTitle className="leading-tight">
            <span className="block">{fr.app.brandLine1}</span>
            <span className="block text-base font-medium">{fr.app.brandLine2}</span>
          </CardTitle>
          <CardDescription>{fr.login.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">{fr.login.hint}</p>
          <Link
            href="/dashboard"
            className={cn(buttonVariants(), "inline-flex w-full justify-center")}
          >
            {fr.login.continue}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
