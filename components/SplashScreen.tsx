import cocoa from '@/assets/lotties/teste2.json';
import { ResizeMode, Video } from 'expo-av';
import LottieView from 'lottie-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

type SplashType = 'lottie' | 'video';

interface SplashScreenProps {
    onFinish?: (isCancelled: boolean) => void;
    type?: SplashType; // Permite escolher entre lottie ou video
}

export default function SplashScreenComponent({
    onFinish = (isCancelled) => { },
    type = 'lottie'
}: SplashScreenProps) {
    const [videoStatus, setVideoStatus] = useState({});

    const handleVideoStatusUpdate = (status: any) => {
        setVideoStatus(status);
        if (status.didJustFinish) {
            onFinish(false);
        }
    };

    if (type === 'video') {
        return (
            <View style={styles.container}>
                <Video
                    source={require('@/assets/videos/splash.mp4')} // Você precisará adicionar o vídeo aqui
                    style={styles.video}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay
                    isLooping={false}
                    onPlaybackStatusUpdate={handleVideoStatusUpdate}
                />
            </View>
        );
    }

    // Versão Lottie (atual)
    return (
        <View style={styles.container}>
            <LottieView
                source={cocoa}
                autoPlay
                loop={false}
                style={{ flex: 1, width: "100%" }}
                resizeMode='cover'
                onAnimationFinish={onFinish}
                // Otimizações adicionais
                renderMode="HARDWARE" // Use renderização por hardware
                cacheComposition={true} // Cache a composição
                speed={1.0} // Controle de velocidade
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#232323',
    },
    lottie: {
        flex: 1,
        width: '100%',
    },
    video: {
        flex: 1,
        width: '100%',
    },
});
