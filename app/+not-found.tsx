import { IconSymbol } from '@/components/ui/IconSymbol';
import { Link, Stack } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Página não encontrada' }} />
      <View className="flex-1 bg-background justify-center items-center px-6">
        <View className="bg-backgroundCard rounded-3xl p-8 items-center max-w-sm w-full shadow-lg">
          {/* Ícone de erro */}
          <View className="w-20 h-20 bg-red-500/10 rounded-full items-center justify-center mb-6">
            <IconSymbol name="exclamationmark.triangle" size={40} color="#EF4444" />
          </View>
          
          {/* Título */}
          <Text className="text-2xl font-bold text-white text-center mb-3">
            Página não encontrada
          </Text>
          
          {/* Descrição */}
          <Text className="text-textSecondary text-center mb-8 leading-6">
            A página que você está procurando não existe ou foi movida.
          </Text>
          
          {/* Botão de voltar */}
          <Link href="/" asChild>
            <View className="bg-primary px-8 py-4 rounded-xl w-full shadow-sm active:bg-primary/80">
              <Text className="text-white text-center font-bold text-base">
                Voltar ao início
              </Text>
            </View>
          </Link>
          
          {/* Informação adicional */}
          <Text className="text-textSecondary text-center text-sm mt-6">
            Código de erro: 404
          </Text>
        </View>
      </View>
    </>
  );
}
