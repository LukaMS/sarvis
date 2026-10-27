// Tab group: Impact, Scan, Search, History (SPEC › Navigation map). Styling lives in TabBar.tsx.
import { Tabs } from 'expo-router';

import { TABS, tabOptions, useTabScreenOptions } from '../../components/navigation/TabBar';

export default function TabsLayout() {
  const screenOptions = useTabScreenOptions();

  return (
    <Tabs screenOptions={screenOptions}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={tabOptions(tab)} />
      ))}
    </Tabs>
  );
}
