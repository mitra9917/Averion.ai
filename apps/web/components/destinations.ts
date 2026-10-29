import {
  ChartLine,
  LayoutGrid,
  Library,
  MessageSquare,
  SlidersHorizontal,
  type LucideIcon
} from "lucide-react";

export type Destination = {
  href: string;
  label: string;
  crumb: string;
  icon: LucideIcon;
  shortcut: string;
};

export const destinations: Destination[] = [
  { href: "/", label: "Overview", crumb: "Overview", icon: LayoutGrid, shortcut: "1" },
  { href: "/documents", label: "Library", crumb: "Library", icon: Library, shortcut: "2" },
  { href: "/chat", label: "Ask", crumb: "Ask", icon: MessageSquare, shortcut: "3" },
  { href: "/insights", label: "Insights", crumb: "Insights", icon: ChartLine, shortcut: "4" },
  { href: "/account", label: "Settings", crumb: "Settings", icon: SlidersHorizontal, shortcut: "5" }
];

export function isDestinationActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function destinationForPath(pathname: string) {
  return (
    destinations.find((item) => isDestinationActive(pathname, item.href)) ??
    destinations[0]
  );
}
