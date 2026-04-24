import { InfoTooltip } from "./InfoTooltip";

interface TabHeaderProps {
  title: string;
  tooltip: string;
}

export function TabHeader({ title, tooltip }: TabHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-base font-semibold text-gray-700">{title}</h2>
      <InfoTooltip text={tooltip} />
    </div>
  );
}
