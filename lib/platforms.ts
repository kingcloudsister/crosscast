import type { PlatformKey } from "@/components/types";

export const allowedPlatforms = new Set<PlatformKey>(["rednote", "threads", "linkedin"]);

export function isPlatformKey(value: string): value is PlatformKey {
  return allowedPlatforms.has(value as PlatformKey);
}
