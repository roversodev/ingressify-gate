import React from 'react';
import { Image, Text, View } from 'react-native';

interface HeaderProps {
  title?: string;
  showLogo?: boolean;
}

export default function Header({ title, showLogo = true }: HeaderProps) {
  return (
    <View className="px-6 pt-6 pb-4 bg-background fixed">
      {showLogo && (
        <View className="items-center mb-4">
          <Image
            source={require('../assets/images/logo.png')}
            className="w-[220px] h-[36px]"
            resizeMode="contain"
          />
        </View>
      )}
      {title && (
        <Text className="text-3xl font-bold text-white text-center">
          {title}
        </Text>
      )}
    </View>
  );
}