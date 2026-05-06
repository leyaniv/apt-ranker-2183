import { InfoTooltip } from "./InfoTooltip";

interface TabHeaderProps {
  title: string;
  titleShort?: string;
  tooltip: string;
}

export function TabHeader({ title, titleShort, tooltip }: TabHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-base font-semibold text-gray-700">
        {titleShort ? (
          <>
            <span className="sm:hidden">{titleShort}</span>
            <span className="hidden sm:inline">{title}</span>
          </>
        ) : (
          title
        )}
      </h2>
      <InfoTooltip text={tooltip} />
    </div>
  );
}
