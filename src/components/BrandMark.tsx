import { Pickaxe } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <div className={cn("logo-tile", size === "lg" ? "h-16 w-16" : "h-11 w-11")}>
      <Pickaxe className={size === "lg" ? "h-8 w-8" : "h-5 w-5"} />
    </div>
  );
}
