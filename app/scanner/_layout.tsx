import { Stack } from 'expo-router';
import React from 'react';

export default function ScannerLayout() {
  return (
    <Stack 
      screenOptions={{ 
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="[eventId]" />
      <Stack.Screen name="search" />
      <Stack.Screen name="validators" />
      <Stack.Screen name="lists" />
      <Stack.Screen name="list-validation" />
    </Stack>
  );
}