import * as Tabs from "@radix-ui/react-tabs";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

interface TabNavigationProps {
  children: ReactNode;
}

export function TabNavigation({ children }: TabNavigationProps) {
  const { t } = useTranslation();

  return (
    <Tabs.Root defaultValue="scoring" className="flex-1 flex flex-col">
      <Tabs.List className="flex border-b border-gray-200 bg-white px-4 sm:px-6">
        {(["scoring", "results", "compare"] as const).map((tab) => (
          <Tabs.Trigger
            key={tab}
            value={tab}
            className="px-4 py-2.5 text-sm font-medium text-gray-500
                       border-b-2 border-transparent
                       data-[state=active]:text-blue-600
                       data-[state=active]:border-blue-600
                       hover:text-gray-700 transition-colors"
          >
            {t(`tabs.${tab}`)}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {children}
    </Tabs.Root>
  );
}

export { Content as TabContent } from "@radix-ui/react-tabs";
