import { api } from '@/api';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from 'convex/react';
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
  useWindowDimensions,
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
  const [isDeleting, setIsDeleting] = useState(false);
  const excludeUser = useMutation(api.users.excludeUser);

  // Responsividade: dimensões e escalas
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 768;
  const isLandscape = width > height;

  const headingFont = isTablet ? 30 : undefined;

  const avatarSize = isTablet ? (isLandscape ? 110 : 120) : 96; // 24 * 4 = 96 padrão
  const badgeSize = isTablet ? 36 : 32;
  const badgeIconSize = Math.round(badgeSize * 0.5);

  const nameFont = isTablet ? 22 : 20;
  const emailFont = isTablet ? 18 : 16;

  const itemPaddingV = isTablet ? 16 : 12;
  const itemPaddingH = isTablet ? 24 : 24;
  const iconCircleSize = isTablet ? 44 : 40;
  const menuIconSize = isTablet ? 24 : 20;
  const menuTitleFont = isTablet ? 18 : 16;
  const chevronSize = isTablet ? 22 : 20;

  const signoutPaddingV = isTablet ? 16 : 12;
  const signoutIconSize = isTablet ? 22 : 20;
  const signoutFont = isTablet ? 18 : 16;

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
          // Apenas desloga; o redirecionamento fica por conta do layout raiz
          signOut();
        },
      },
    ]
  );
};

// Fluxo de exclusão de conta: NÃO navegar manualmente após deletar
const handleDeleteAccount = () => {
  Alert.alert(
    'Excluir conta',
    'Esta ação é permanente e removerá sua conta e dados associados. Deseja continuar?',
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsDeleting(true);
            await excludeUser({ userId: user?.id as string });
            await user?.delete?.();
            // Não chamar router.replace aqui
          } catch (err) {
            console.error('Erro ao excluir conta', err);
            Alert.alert('Erro', 'Não foi possível excluir a conta. Tente novamente.');
          } finally {
            setIsDeleting(false);
          }
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
        'Ingressify App Leitor v1.0.2\n\nSistema de validação de ingressos para eventos.\n\n© 2025 Ingressify. Todos os direitos reservados.'
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
    case 'delete':
      handleDeleteAccount();
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
  {
    id: 'delete',
    title: isDeleting ? 'Excluindo...' : 'Excluir Conta',
    icon: 'trash-outline' as const,
    color: '#ef4444',
  },
];

return (
  <SafeAreaView className="flex-1 bg-background">
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View className="px-6 pt-6 pb-4">
        <Text className="text-3xl font-bold text-white text-center" style={{ fontSize: headingFont }}>
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
                    className="rounded-full"
                    style={{ width: avatarSize, height: avatarSize }}
                    onError={() => setImageError(true)}
                  />
                  <View
                    className="absolute -bottom-1 -right-1 bg-primary items-center justify-center border-2 border-backgroundCard"
                    style={{ width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }}
                  >
                    <Ionicons name="checkmark" size={badgeIconSize} color="white" />
                  </View>
                </View>
              ) : (
                <View
                  className="rounded-full bg-primary items-center justify-center shadow-lg"
                  style={{ width: avatarSize, height: avatarSize }}
                >
                  <Text className="font-bold text-white" style={{ fontSize: isTablet ? 28 : 24 }}>
                    {getUserInitials()}
                  </Text>
                </View>
              )}
            </View>

            {/* User Details */}
            <Text className="font-semibold text-white mb-1" style={{ fontSize: nameFont }}>
              {getUserName()}
            </Text>

            <Text className="text-textSecondary mb-4" style={{ fontSize: emailFont }}>
              {user?.emailAddresses?.[0]?.emailAddress}
            </Text>

            {/* Real Stats */}
            {/* <View className="flex-row justify-around w-full pt-4 border-t border-gray-700">
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
            </View> */}
          </View>
        </View>
      </View>

      {/* Menu Items */}
      <View className="mx-6 mb-8">
        <View className="bg-backgroundCard rounded-2xl shadow-lg overflow-hidden">
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              className={`flex-row items-center active:bg-gray-800 ${index < menuItems.length - 1 ? 'border-b border-gray-700' : ''}`}
              onPress={() => handleMenuPress(item.id)}
              activeOpacity={0.7}
              style={{ paddingVertical: itemPaddingV, paddingHorizontal: itemPaddingH }}
            >
              <View
                className="rounded-full bg-gray-800 items-center justify-center mr-4"
                style={{ width: iconCircleSize, height: iconCircleSize }}
              >
                <Ionicons name={item.icon} size={menuIconSize} color={item.color} />
              </View>

              <Text className="flex-1 text-white font-medium" style={{ fontSize: menuTitleFont }}>
                {item.title}
              </Text>

              <Ionicons name="chevron-forward" size={chevronSize} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Sign Out Button */}
      <View className="mx-6 mb-8">
        <TouchableOpacity
          className="bg-red-600 rounded-2xl px-6 shadow-lg active:bg-red-700"
          onPress={handleSignOut}
          activeOpacity={0.8}
          style={{ paddingVertical: signoutPaddingV }}
        >
          <View className="flex-row items-center justify-center">
            <Ionicons name="log-out-outline" size={signoutIconSize} color="white" />
            <Text className="text-white font-semibold ml-2" style={{ fontSize: signoutFont }}>
              Sair da Conta
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* App Version */}
      <View className="items-center pb-8 mb-12">
        <Text className="text-textSecondary" style={{ fontSize: isTablet ? 14 : 12 }}>
          Ingressify App Leitor v1.0.2
        </Text>
      </View>
    </ScrollView>
  </SafeAreaView>
);
}