import { icon } from '@/constants/icon';
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { HapticTab } from './HapticTab';

interface TabBarButtonProps {
  onPress: () => void;
  onLongPress: () => void;
  isFocused: boolean;
  routeName: string;
  color: string;
  label: string;
}

const TabBarButton: React.FC<TabBarButtonProps> = ({ onPress, onLongPress, isFocused, routeName, color, label }) => {

    const scale = useSharedValue(0);

    useEffect(() => {
        scale.value = withSpring(isFocused ? 1 : 0, { duration: 350 });
    }, [scale, isFocused]);

    const animatedIconStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: interpolate(scale.value, [0, 1], [1, 1.2]) }],
            top: interpolate(scale.value, [0, 1], [0, 9]),
        };
    });

    const animatedTextStyle = useAnimatedStyle(() => {
        const opacity = interpolate(scale.value, [0, 1], [1, 0]);
        return {
            opacity
        };
    });


    // Verificar se o ícone existe antes de renderizar
    const IconComponent = icon[routeName as keyof typeof icon];

    return (
        <HapticTab
            onPress={onPress} 
            onLongPress={onLongPress} 
            style={styles.tabbarItem}
        >
            <Animated.View style={animatedIconStyle}>
                <IconComponent color={isFocused ? '#fff' : '#A3A3A3'} />
            </Animated.View>
            <Animated.Text style={[{ 
                color: isFocused ? '#E65CFF' : '#A3A3A3',
                fontSize: 12,
                fontWeight: '700'
            }, animatedTextStyle]}>
                {label}
            </Animated.Text>
        </HapticTab>
    );
};

export default TabBarButton;

const styles = StyleSheet.create({
    tabbarItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: 8,
    },
});
