import {
  Camera,
  Construction,
  Hammer,
  Mic2,
  Music,
  Paintbrush,
  Search,
  Shield,
  Shirt,
  Sparkles,
  Star,
  Truck,
  Users,
  UserCheck,
  UtensilsCrossed,
  Wrench,
  Zap,
} from "lucide-react";

export const homeIconMap = {
  Camera,
  Construction,
  Hammer,
  Mic2,
  Music,
  Paintbrush,
  Search,
  Shield,
  Shirt,
  Sparkles,
  Star,
  Truck,
  Users,
  UserCheck,
  UtensilsCrossed,
  Wrench,
  Zap,
} as const;

export type HomeIconName = keyof typeof homeIconMap;

export const HOME_ICON_NAMES = Object.keys(homeIconMap) as HomeIconName[];

export const resolveHomeIcon = (name?: string) => {
  if (!name) return homeIconMap.Sparkles;
  return homeIconMap[name as HomeIconName] ?? homeIconMap.Sparkles;
};
