import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { ConvexProvider, ConvexReactClient, useQuery } from 'convex/react';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import "./globals.css";


import { api } from '@/api';
import SplashScreenComponent from '@/components/SplashScreen';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useUser } from '@clerk/clerk-expo';
import React from 'react';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_live_Y2xlcmsuaW5ncmVzc2lmeS5jb20uYnIk';
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL || 'https://helpful-stingray-396.convex.cloud';

if (!publishableKey) {
  throw new Error('Missing Clerk Publishable Key');
}

if (!convexUrl) {
  throw new Error('Missing Convex URL');
}

const convex = new ConvexReactClient(convexUrl);

const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key);
    } catch (err) {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value);
    } catch (err) {
      return;
    }
  },
};

// Hook para preload de dados durante a splash
function useDataPreloader() {
  const { user } = useUser();
  const { isLoaded, isSignedIn } = useAuth();
  const [preloadComplete, setPreloadComplete] = useState(false);

  // Preload dos eventos do usuário
  const sellerEvents = useQuery(
    api.events.getSellerEvents,
    (isSignedIn && user?.id) ? { userId: user.id } : "skip"
  );
  
  const validatorEvents = useQuery(
    api.validators.getEventsUserCanValidate,
    (isSignedIn && user?.id) ? { userId: user.id } : "skip"
  );

  useEffect(() => {
    if (!isLoaded) return;

    // Se não estiver logado, marcar como completo
    if (!isSignedIn) {
      setPreloadComplete(true);
      return;
    }

    // Se estiver logado, aguardar os dados carregarem
    if (isSignedIn && user?.id) {
      // Verificar se pelo menos uma das queries foi executada
      const hasSellerData = sellerEvents !== undefined;
      const hasValidatorData = validatorEvents !== undefined;
      
      if (hasSellerData && hasValidatorData) {
        setPreloadComplete(true);
      }
    }
  }, [isLoaded, isSignedIn, user?.id, sellerEvents, validatorEvents]);

  return { preloadComplete, isSignedIn };
}

// Hook para gerenciar a inicialização do app
function useAppInitialization() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initializationProgress, setInitializationProgress] = useState(0);
  const { isLoaded } = useAuth();
  const { preloadComplete, isSignedIn } = useDataPreloader();

  useEffect(() => {
    let isMounted = true;

    const initializeApp = async () => {
      try {
        // Aguardar o Clerk carregar
        while (!isLoaded && isMounted) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!isMounted) return;

        // Etapas de inicialização
        const steps = [
          { name: 'Verificando autenticação...', duration: 300 },
          { name: 'Carregando configurações...', duration: 200 },
          { name: isSignedIn ? 'Carregando eventos...' : 'Preparando interface...', duration: 400 },
          { name: 'Finalizando...', duration: 100 },
        ];

        for (let i = 0; i < steps.length; i++) {
          if (!isMounted) return;
          
          const step = steps[i];
          
          setInitializationProgress(((i + 1) / steps.length) * 100);
          
          // Na etapa de carregamento de eventos, aguardar o preload
          if (i === 2 && isSignedIn) {
            // Aguardar o preload dos eventos completar
            while (!preloadComplete && isMounted) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } else {
            await new Promise(resolve => setTimeout(resolve, step.duration));
          }
        }

        if (isMounted) {
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('Erro na inicialização:', error);
        if (isMounted) {
          setIsInitialized(true);
        }
      }
    };

    initializeApp();

    return () => {
      isMounted = false;
    };
  }, [isLoaded, preloadComplete, isSignedIn]);

  return { isInitialized, initializationProgress };
}

function InitialLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    const inTabsGroup = segments[0] === '(tabs)';

    if (isSignedIn && !inTabsGroup) {
      router.replace('/(tabs)');
    } else if (!isSignedIn) {
      router.replace('/(auth)/sign-in');
    }
  }, [isSignedIn, isLoaded]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

// Componente principal que gerencia splash e app
function AppContent() {
  const [splashFinished, setSplashFinished] = useState(false);
  const { isInitialized } = useAppInitialization();
  const colorScheme = useColorScheme();

  // Mostrar splash até que AMBOS estejam prontos
  const shouldShowSplash = !splashFinished || !isInitialized;

  if (shouldShowSplash) {
    return (
      <SplashScreenComponent
        type='video'
        onFinish={(isCancelled) => {
          if (!isCancelled) {
            setSplashFinished(true);
          }
        }}
      />
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <InitialLayout />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Aguardar apenas as fontes carregarem
  if (!loaded) {
    return null;
  }

  // Providers são inicializados IMEDIATAMENTE
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ConvexProvider client={convex}>
        <AppContent />
      </ConvexProvider>
    </ClerkProvider>
  );
}
