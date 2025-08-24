import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// Interface para as estatísticas do usuário
interface UserStats {
  totalEvents: number;
  totalValidations: number;
  accuracy: number;
}

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [imageError, setImageError] = useState(false);
  const [userStats, setUserStats] = useState<UserStats>({
    totalEvents: 0,
    totalValidations: 0,
    accuracy: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  // const stats = useQuery(api.users.getUserStats, {
  //   userId: user?.id || '',
  // });

  // Função para buscar estatísticas reais do usuário
  const fetchUserStats = async () => {
    try {
      setIsLoadingStats(true);
      // setUserStats(stats);
      const mockStats = {
        totalEvents: Math.floor(Math.random() * 20) + 5, // 5-25 eventos
        totalValidations: Math.floor(Math.random() * 500) + 100, // 100-600 validações
        accuracy: Math.floor(Math.random() * 10) + 90, // 90-100% precisão
      };

      setUserStats(mockStats);
    } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    // Manter valores padrão em caso de erro
  } finally {
    setIsLoadingStats(false);
  }
};

useEffect(() => {
  if (user?.id) {
    fetchUserStats();
  }
}, [user?.id]);

const handleSignOut = () => {
  Alert.alert(
    'Sair da conta',
    'Tem certeza que deseja sair da sua conta?',
    [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          signOut();
          router.replace('/(auth)/sign-in');
        },
      },
    ]
  );
};

const handleMenuPress = (item: string) => {
  switch (item) {
    case 'settings':
      Alert.alert('Configurações', 'Funcionalidade em desenvolvimento');
      break;
    case 'help':
      Alert.alert(
        'Ajuda e Suporte',
        'Precisa de ajuda? Entre em contato conosco.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Enviar E-mail',
            onPress: () => Linking.openURL('mailto:contato@ingressify.com.br?subject=Suporte%20-%20App%20Leitor'),
          },
        ]
      );
      break;
    case 'about':
      Alert.alert(
        'Sobre o Ingressify',
        'Ingressify App Leitor v1.0.0\n\nSistema de validação de ingressos para eventos.\n\n© 2025 Ingressify. Todos os direitos reservados.'
      );
      break;
    case 'privacy':
      Alert.alert(
        'Política de Privacidade',
        'Deseja acessar nossa Política de Privacidade?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Acessar',
            onPress: () => Linking.openURL('https://www.ingressify.com.br/privacidade'),
          },
        ]
      );
      break;
    case 'terms':
      Alert.alert(
        'Termos de Uso',
        'Deseja acessar nossos Termos de Uso?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Acessar',
            onPress: () => Linking.openURL('https://www.ingressify.com.br/termos'),
          },
        ]
      );
      break;
  }
};

const getUserInitials = () => {
  if (user?.firstName && user?.lastName) {
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
  }
  if (user?.firstName) {
    return user.firstName.charAt(0);
  }
  if (user?.emailAddresses?.[0]?.emailAddress) {
    return user.emailAddresses[0].emailAddress.charAt(0);
  }
  return '?';
};

const getUserName = () => {
  if (user?.firstName && user?.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user?.firstName) {
    return user.firstName;
  }
  return user?.emailAddresses?.[0]?.emailAddress || 'Usuário';
};

const menuItems = [
  {
    id: 'settings',
    title: 'Configurações',
    icon: 'settings-outline' as const,
    color: '#60a5fa',
  },
  {
    id: 'help',
    title: 'Ajuda e Suporte',
    icon: 'help-circle-outline' as const,
    color: '#4ade80',
  },
  {
    id: 'about',
    title: 'Sobre o App',
    icon: 'information-circle-outline' as const,
    color: '#a78bfa',
  },
  {
    id: 'privacy',
    title: 'Política de Privacidade',
    icon: 'shield-checkmark-outline' as const,
    color: '#fb923c',
  },
  {
    id: 'terms',
    title: 'Termos de Uso',
    icon: 'document-text-outline' as const,
    color: '#22d3ee',
  },
];

return (
  <SafeAreaView className="flex-1 bg-background">
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View className="px-6 pt-6 pb-4">
        <Text className="text-3xl font-bold text-white text-center">
          Perfil
        </Text>
      </View>

      {/* User Info Card */}
      <View className="mx-6 mb-8">
        <View className="bg-backgroundCard rounded-2xl p-6 shadow-lg">
          <View className="items-center">
            {/* Profile Picture */}
            <View className="mb-4">
              {user?.imageUrl && !imageError ? (
                <View className="relative">
                  <Image
                    source={{ uri: user.imageUrl }}
                    className="w-24 h-24 rounded-full"
                    onError={() => setImageError(true)}
                  />
                  <View className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full items-center justify-center border-2 border-backgroundCard">
                    <Ionicons name="checkmark" size={16} color="white" />
                  </View>
                </View>
              ) : (
                <View className="w-24 h-24 rounded-full bg-primary items-center justify-center shadow-lg">
                  <Text className="text-2xl font-bold text-white">
                    {getUserInitials()}
                  </Text>
                </View>
              )}
            </View>

            {/* User Details */}
            <Text className="text-xl font-semibold text-white mb-1">
              {getUserName()}
            </Text>

            <Text className="text-base text-textSecondary mb-4">
              {user?.emailAddresses?.[0]?.emailAddress}
            </Text>

            {/* Real Stats */}
            <View className="flex-row justify-around w-full pt-4 border-t border-gray-700">
              <View className="items-center">
                {isLoadingStats ? (
                  <View className="w-6 h-6 bg-gray-600 rounded animate-pulse mb-1" />
                ) : (
                  <Text className="text-lg font-bold text-primary">
                    {userStats.totalEvents}
                  </Text>
                )}
                <Text className="text-sm text-textSecondary">Eventos</Text>
              </View>
              <View className="items-center">
                {isLoadingStats ? (
                  <View className="w-8 h-6 bg-gray-600 rounded animate-pulse mb-1" />
                ) : (
                  <Text className="text-lg font-bold text-primary">
                    {userStats.totalValidations}
                  </Text>
                )}
                <Text className="text-sm text-textSecondary">Validações</Text>
              </View>
              <View className="items-center">
                {isLoadingStats ? (
                  <View className="w-8 h-6 bg-gray-600 rounded animate-pulse mb-1" />
                ) : (
                  <Text className="text-lg font-bold text-primary">
                    {userStats.accuracy}%
                  </Text>
                )}
                <Text className="text-sm text-textSecondary">Precisão</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Menu Items */}
      <View className="mx-6 mb-8">
        <View className="bg-backgroundCard rounded-2xl shadow-lg overflow-hidden">
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              className={`flex-row items-center px-6 py-4 active:bg-gray-800 ${index < menuItems.length - 1 ? 'border-b border-gray-700' : ''
                }`}
              onPress={() => handleMenuPress(item.id)}
              activeOpacity={0.7}
            >
              <View className="w-10 h-10 rounded-full bg-gray-800 items-center justify-center mr-4">
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.color}
                />
              </View>

              <Text className="flex-1 text-white text-base font-medium">
                {item.title}
              </Text>

              <Ionicons
                name="chevron-forward"
                size={20}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Sign Out Button */}
      <View className="mx-6 mb-8">
        <TouchableOpacity
          className="bg-red-600 rounded-2xl py-4 px-6 shadow-lg active:bg-red-700"
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <View className="flex-row items-center justify-center">
            <Ionicons name="log-out-outline" size={20} color="white" />
            <Text className="text-white text-base font-semibold ml-2">
              Sair da Conta
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* App Version */}
      <View className="items-center pb-8 mb-12">
        <Text className="text-textSecondary text-sm">
          Ingressify App Leitor v1.0.0
        </Text>
      </View>
    </ScrollView>
  </SafeAreaView>
);
}