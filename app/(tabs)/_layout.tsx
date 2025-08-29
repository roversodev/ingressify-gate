// import { Tabs } from 'expo-router';
// import React from 'react';

import { HapticTab } from '@/components/HapticTab';
// import { IconSymbol } from '@/components/ui/IconSymbol';

// export default function TabLayout() {
//   return (
//     <Tabs
//       screenOptions={{
//         tabBarActiveTintColor: Colors.primary,
//         tabBarInactiveTintColor: Colors.textSecondary,
//         headerShown: false,
//         tabBarButton: HapticTab,
//         tabBarBackground: TabBarBackground,
//         tabBarStyle: Platform.select({
//           ios: {
//             position: 'absolute',
//             backgroundColor: Colors.card,
//             borderTopWidth: 1,
//             borderTopColor: 'rgba(255, 255, 255, 0.1)',
//             paddingTop: 8,
//             paddingBottom: 34, // Safe area para iPhone
//             height: 88,
//             shadowColor: '#000',
//             shadowOffset: {
//               width: 0,
//               height: -2,
//             },
//             shadowOpacity: 0.25,
//             shadowRadius: 8,
//             elevation: 8,
//           },
//           default: {
//             backgroundColor: Colors.card,
//             borderTopWidth: 1,
//             borderTopColor: 'rgba(255, 255, 255, 0.1)',
//             paddingTop: 8,
//             paddingBottom: 8,
//             height: 64,
//             shadowColor: '#000',
//             shadowOffset: {
//               width: 0,
//               height: -2,
//             },
//             shadowOpacity: 0.25,
//             shadowRadius: 8,
//             elevation: 8,
//           },
//         }),
//         tabBarLabelStyle: {
//           fontSize: 12,
//           fontWeight: '600',
//           marginTop: 4,
//         },
//         tabBarItemStyle: {
//           paddingVertical: 4,
//         },
//       }}>
//       <Tabs.Screen
//         name="index"
//         options={{
//           title: 'Eventos',
//           tabBarIcon: ({ color, focused }) => (
//             <IconSymbol 
//               size={focused ? 26 : 24} 
//               name={focused ? "calendar.badge.plus" : "calendar"} 
//               color={color} 
//             />
//           ),
//         }}
//       />
//       <Tabs.Screen
//         name="profile"
//         options={{
//           title: 'Perfil',
//           tabBarIcon: ({ color, focused }) => (
//             <IconSymbol 
//               size={focused ? 26 : 24} 
//               name={focused ? "person.crop.circle.fill" : "person.crop.circle"} 
//               color={color} 
//             />
//           ),
//         }}
//       />
//     </Tabs>
//   );
// }




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

