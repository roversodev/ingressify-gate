import { api } from '@/api';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useUser } from '@clerk/clerk-expo';
import { useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EventDashboardScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { width, height } = useWindowDimensions();

  const isTablet = Math.min(width, height) >= 768;
  const isLandscape = width > height;

  // Queries
  const event = useQuery(api.events.getEventBasicInfo, { eventId: eventId as Id<"events"> });
  const availability = useQuery(
      api.events.getEventAvailability,
      eventId ? { eventId: eventId as Id<"events"> } : "skip"
    );
  
  const imageUrl = useQuery(
    api.storage.getUrl,
    event?.imageStorageId ? { storageId: event.imageStorageId } : "skip"
  );

  const permission = useQuery(api.validators.canValidateTickets, {
    eventId: eventId as Id<"events">,
    userId: user?.id || "",
  });

  const promoter = useQuery(
    api.promoters.getPromoterByUserAndEvent,
    user?.id ? { userId: user.id, eventId: eventId as Id<"events"> } : "skip"
  );

  const isPromoterLoaded = promoter !== undefined;

  if (!event || permission === undefined || !isPromoterLoaded) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#E65CFF" />
        <Text className="text-white mt-4 font-medium">Carregando painel...</Text>
      </SafeAreaView>
    );
  }

  const isAdmin = permission.isOwner || permission.role === 'admin' || permission.role === 'owner';
  const isStaff = permission.isOwner || permission.isMember || permission.role === 'staff' || isAdmin;
  const isPromoter = !!promoter && promoter.isActive !== false;

  const menuItems = [
    {
      id: 'validate',
      title: 'Validação',
      subtitle: 'Escanear QR Codes',
      icon: 'qrcode.viewfinder',
      color: '#E65CFF',
      route: `/scanner/${eventId}`,
      visible: true,
    },
    {
      id: 'search',
      title: 'Busca Manual',
      subtitle: 'Pesquisar por Email/CPF',
      icon: 'magnifyingglass',
      color: '#60a5fa',
      route: `/scanner/search?eventId=${eventId}`,
      visible: true,
    },
    {
      id: 'lists',
      title: 'Listas',
      subtitle: 'Listas de convidados',
      icon: 'list.bullet',
      color: '#4ade80',
      route: `/scanner/lists?eventId=${eventId}`,
      visible: true,
    },
    {
      id: 'validators',
      title: 'Validadores',
      subtitle: 'Gerenciar equipe',
      icon: 'person.2',
      color: '#fb923c',
      route: `/scanner/validators?eventId=${eventId}`,
      visible: isAdmin,
    },
    {
      id: 'finance',
      title: 'Financeiro',
      subtitle: 'Transações e lucros',
      icon: 'dollarsign.circle',
      color: '#22d3ee',
      route: `/scanner/finance/${eventId}`,
      visible: isAdmin,
    },
    {
      id: 'courtesy',
      title: 'Cortesias',
      subtitle: 'Enviar ingressos grátis',
      icon: 'gift',
      color: '#a78bfa',
      route: `/scanner/courtesy/${eventId}`,
      visible: isAdmin,
    },
    {
      id: 'abandoned-carts',
      title: 'Carrinhos Abandonados',
      subtitle: 'Recuperar vendas',
      icon: 'cart.badge.minus',
      color: '#f43f5e',
      route: `/scanner/abandoned-carts/${eventId}`,
      visible: isAdmin,
    },
    {
      id: 'offline',
      title: 'Vendas Offline',
      subtitle: 'Registrar venda presencial',
      icon: 'bag',
      color: '#f59e0b',
      route: `/scanner/offline/${eventId}`,
      visible: isPromoter || isAdmin,
    },
  ];

  const visibleMenuItems = menuItems.filter(item => item.visible);

  return (

      <ScrollView className="flex-1 bg-background" showsVerticalScrollIndicator={false}>
        {/* Header Image & Event Info */}
        <View className="relative">
          <View className="h-64 w-full bg-backgroundCard relative overflow-hidden">
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View className="h-full w-full items-center justify-center">
                <IconSymbol name="calendar" size={64} color="#333" />
              </View>
            )}
            <View className="absolute inset-0 bg-black/40" pointerEvents="none" />
          </View>

          <TouchableOpacity
            onPress={() => router.back()}
            className="absolute top-14 left-4 p-3 bg-black/50 rounded-full"
          >
            <IconSymbol name="arrow.left" size={20} color="white" />
          </TouchableOpacity>

          <View className="absolute bottom-6 left-6 right-6">
            <Text className="text-white text-3xl font-bold mb-2 shadow-sm">
              {event.name}
            </Text>
            <View className="flex-row items-center">
              <IconSymbol name="mappin.and.ellipse" size={14} color="#E65CFF" />
              <Text className="text-white/80 ml-2 text-sm font-medium">
                {event.location?.split('-')[0]?.trim() || 'Local não disponível'}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats Summary */}
        <View className="flex-row px-6 -mt-6 gap-4">
          <View className="flex-1 bg-backgroundCard p-4 rounded-2xl shadow-xl border border-white/5">
            <Text className="text-textSecondary text-xs font-bold uppercase mb-1">Validados</Text>
            <Text className="text-primary text-2xl font-black">
              {availability.validatedTickets || 0}
            </Text>
          </View>
          <View className="flex-1 bg-backgroundCard p-4 rounded-2xl shadow-xl border border-white/5">
            <Text className="text-textSecondary text-xs font-bold uppercase mb-1">Total</Text>
            <Text className="text-white text-2xl font-black">
              {availability?.purchasedTickets || 0}
            </Text>
          </View>
        </View>

        {/* Quick Menu */}
        <View className="px-6 py-8">
          <Text className="text-white text-lg font-bold mb-6">Ações Rápidas</Text>

          <View className="flex-row flex-wrap gap-4">
            {visibleMenuItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => router.push(item.route as any)}
                className="bg-backgroundCard rounded-2xl p-5 border border-white/5"
                style={{ width: isTablet ? (width - 64) / 3 : (width - 64) / 2 }}
                activeOpacity={1}
              >
                <View
                  className="w-12 h-12 rounded-xl items-center justify-center mb-4"
                  style={{ backgroundColor: `${item.color}20` }}
                >
                  <IconSymbol name={item.icon as any} size={24} color={item.color} />
                </View>
                <Text className="text-white font-bold text-base mb-1">{item.title}</Text>
                <Text className="text-textSecondary text-xs" numberOfLines={1}>{item.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

  );
}