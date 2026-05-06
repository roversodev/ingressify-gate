import { useAuth, useUser } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

// ── Icons ─────────────────────────────────────────────────────────────────────

function Icon({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">{children}</Svg>;
}

const icons = {
  password: (c: string) => (
    <Icon><Path stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M12 14a1 1 0 100 2 1 1 0 000-2zM5 11V7a7 7 0 0114 0v4M3 11h18v10H3V11z" /></Icon>
  ),
  settings: (c: string) => (
    <Icon><Path stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></Icon>
  ),
  help: (c: string) => (
    <Icon><Path stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" /><Circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.8" /></Icon>
  ),
  info: (c: string) => (
    <Icon><Circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.8" /><Path stroke={c} strokeWidth="1.8" strokeLinecap="round" d="M12 8h.01M12 12v4" /></Icon>
  ),
  shield: (c: string) => (
    <Icon><Path stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Icon>
  ),
  doc: (c: string) => (
    <Icon><Path stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" /></Icon>
  ),
  logout: (c: string) => (
    <Icon><Path stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></Icon>
  ),
  chevron: (c: string) => (
    <Icon size={18}><Path stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" /></Icon>
  ),
  person: (c: string) => (
    <Icon size={36}><Path stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" /></Icon>
  ),
  scan: (c: string) => (
    <Icon><Path stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10M12 7v10" /></Icon>
  ),
};

interface MenuItem {
  id: string;
  label: string;
  icon: (color: string) => React.ReactNode;
  color: string;
  onPress: () => void;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export default function ProfileScreen() {
  const { signOut, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [imageError, setImageError] = useState(false);

  const handleSignOut = () => {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await new Promise(r => setTimeout(r, 300));
          await signOut();
        },
      },
    ]);
  };

  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) return `${user.firstName[0]}${user.lastName[0]}`;
    if (user?.firstName) return user.firstName[0];
    return user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? '?';
  };

  const getUserName = () => {
    if (user?.firstName && user?.lastName) return `${user.firstName} ${user.lastName}`;
    if (user?.firstName) return user.firstName;
    return user?.emailAddresses?.[0]?.emailAddress ?? 'Usuário';
  };

  const menuGroups: MenuGroup[] = [
    {
      title: 'Conta',
      items: [
        {
          id: 'password',
          label: 'Alterar senha',
          icon: icons.password,
          color: '#E65CFF',
          onPress: () => router.push('/change-password'),
        },
        {
          id: 'settings',
          label: 'Configurações',
          icon: icons.settings,
          color: '#60a5fa',
          onPress: () => router.push('/settings'),
        },
      ],
    },
    {
      title: 'Suporte',
      items: [
        {
          id: 'help',
          label: 'Ajuda e Suporte',
          icon: icons.help,
          color: '#4ade80',
          onPress: () => {
            Alert.alert('Ajuda e Suporte', 'Precisa de ajuda? Entre em contato conosco.', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Enviar E-mail', onPress: () => Linking.openURL('mailto:contato@ingressify.com.br?subject=Suporte%20-%20App%20Leitor') },
            ]);
          },
        },
        {
          id: 'about',
          label: 'Sobre o App',
          icon: icons.info,
          color: '#a78bfa',
          onPress: () =>
            Alert.alert('Ingressify', 'Ingressify App Leitor v2.4\n\nSistema de validação de ingressos.\n\n© 2026 Ingressify. Todos os direitos reservados.'),
        },
      ],
    },
    {
      title: 'Legal',
      items: [
        {
          id: 'privacy',
          label: 'Política de Privacidade',
          icon: icons.shield,
          color: '#fb923c',
          onPress: () =>
            Alert.alert('Política de Privacidade', 'Deseja acessar nossa Política de Privacidade?', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Acessar', onPress: () => Linking.openURL('https://www.ingressify.com.br/privacidade') },
            ]),
        },
        {
          id: 'terms',
          label: 'Termos de Uso',
          icon: icons.doc,
          color: '#22d3ee',
          onPress: () =>
            Alert.alert('Termos de Uso', 'Deseja acessar nossos Termos de Uso?', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Acessar', onPress: () => Linking.openURL('https://www.ingressify.com.br/termos') },
            ]),
        },
      ],
    },
  ];

  if (!isLoaded) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: '#232323' }} />;
  }

  if (!isSignedIn || !user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#232323' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#E65CFF20', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            {icons.person('#E65CFF')}
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Faça login</Text>
          <Text style={{ color: '#A3A3A3', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 32, maxWidth: 260 }}>
            Entre na sua conta para acessar o sistema de validação
          </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/sign-in')} style={{ width: '100%', marginBottom: 12 }}>
            <LinearGradient colors={['#E65CFF', '#C040E0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>Entrar</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(auth)/sign-up')}
            style={{ width: '100%', borderWidth: 1.5, borderColor: '#2E2E2E', borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
            <Text style={{ color: '#A3A3A3', fontWeight: '600', fontSize: 15 }}>Criar conta</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#232323' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Título */}
        <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>Perfil</Text>
        </View>

        {/* Card do usuário */}
        <View style={{ marginHorizontal: 24, marginBottom: 24, borderRadius: 20, overflow: 'hidden' }}>
          <LinearGradient colors={['#1E1E1E', '#181818']} style={{ padding: 24, alignItems: 'center' }}>
            {/* Avatar */}
            <View style={{ marginBottom: 16 }}>
              {user?.imageUrl && !imageError ? (
                <>
                  <View style={{ padding: 3, borderRadius: 52, backgroundColor: '#E65CFF30' }}>
                    <Image
                      source={{ uri: user.imageUrl }}
                      style={{ width: 96, height: 96, borderRadius: 48 }}
                      onError={() => setImageError(true)}
                    />
                  </View>
                  <View style={{ position: 'absolute', bottom: 2, right: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: '#E65CFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#181818' }}>
                    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                      <Path stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
                    </Svg>
                  </View>
                </>
              ) : (
                <LinearGradient colors={['#E65CFF', '#C040E0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#FFF', fontSize: 32, fontWeight: '700' }}>{getUserInitials()}</Text>
                </LinearGradient>
              )}
            </View>

            {/* Nome e email */}
            <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginBottom: 4 }}>
              {getUserName()}
            </Text>
            <Text style={{ color: '#A3A3A3', fontSize: 13, marginBottom: 16 }}>
              {user?.emailAddresses?.[0]?.emailAddress}
            </Text>

            {/* Badge validador */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#E65CFF18', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E65CFF30' }}>
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
                <Path stroke="#E65CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10M12 7v10" />
              </Svg>
              <Text style={{ color: '#E65CFF', fontSize: 12, fontWeight: '600' }}>Validador de Ingressos</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Grupos de menu */}
        {menuGroups.map((group) => (
          <View key={group.title} style={{ marginHorizontal: 24, marginBottom: 16 }}>
            <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 8, marginLeft: 4 }}>
              {group.title.toUpperCase()}
            </Text>
            <View style={{ backgroundColor: '#181818', borderRadius: 16, overflow: 'hidden' }}>
              {group.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingVertical: 14, paddingHorizontal: 16,
                    borderBottomWidth: idx < group.items.length - 1 ? 1 : 0,
                    borderBottomColor: '#232323',
                  }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${item.color}18`, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                    {item.icon(item.color)}
                  </View>
                  <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '500' }}>
                    {item.label}
                  </Text>
                  {icons.chevron('#4B5563')}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Botão Sair */}
        <View style={{ marginHorizontal: 24, marginTop: 8 }}>
          <TouchableOpacity
            onPress={handleSignOut}
            activeOpacity={0.8}
            style={{ backgroundColor: '#1A0A0A', borderWidth: 1, borderColor: '#7F1D1D', borderRadius: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
          >
            {icons.logout('#F87171')}
            <Text style={{ color: '#F87171', fontWeight: '600', fontSize: 15, marginLeft: 10 }}>
              Sair da conta
            </Text>
          </TouchableOpacity>
        </View>

        {/* Versão */}
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <Text style={{ color: '#374151', fontSize: 12 }}>Ingressify Leitor v2.4</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
