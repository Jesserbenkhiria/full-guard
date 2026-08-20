import { getSiteColorStyle } from "@/lib/site-colors";
import { cn } from "@/lib/utils";

export function SiteLabel({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const style = getSiteColorStyle(name);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        style.badgeClass,
        className
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", style.dotClass)} />
      {style.shortLabel}
    </span>
  );
}
