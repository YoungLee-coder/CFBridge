import type { LucideProps } from "lucide-react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  OctagonXIcon,
  PanelLeftIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

const ICONS = {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  OctagonXIcon,
  PanelLeftIcon,
  TriangleAlertIcon,
  XIcon,
} as const;

type IconName = keyof typeof ICONS;

export function IconPlaceholder({
  lucide,
  className,
  ...props
}: LucideProps & {
  lucide: string;
  tabler?: string;
  hugeicons?: string;
  phosphor?: string;
  remixicon?: string;
}) {
  const Comp = ICONS[lucide as IconName] ?? XIcon;
  return <Comp className={className} {...props} />;
}
