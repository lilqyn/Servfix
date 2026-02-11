import { BoostType } from "@prisma/client";
import type { BoostCatalogItem, PlatformSettings } from "./platform-settings.js";

export type BoostOption = BoostCatalogItem;

export const getBoostCatalog = (settings: PlatformSettings) =>
  settings.boostCatalog ?? [];

export const getBoostOption = (settings: PlatformSettings, type: BoostType) =>
  getBoostCatalog(settings).find((option) => option.type === type);
