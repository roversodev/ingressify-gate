import { HapticTab } from '@/components/HapticTab';
import { TabBar } from '@/components/TabBar';
import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />}
    
    screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Eventos' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}

