import { api } from '@/api';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useUser } from '@clerk/clerk-expo';
import { useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Linking,
    RefreshControl,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AbandonedCartsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { user } = useUser();
  
  const event = useQuery(api.events.getById, { eventId: eventId as Id<"events"> });
  const [refreshing, setRefreshing] = useState(false);

  // Buscar carrinhos abandonados
  const carts = useQuery(
    api.organizations.getOrganizationAbandonedCarts,
    (user?.id && event?.organizationId) 
      ? { 
          organizationId: event.organizationId, 
          userId: user.id,
          eventId: eventId as Id<"events"> 
        } 
      : "skip"
  );

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // O Convex atualiza automaticamente, mas simulamos um delay para UX
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleWhatsApp = (cart: any) => {
    if (!cart.customerPhone) return;
    
    // Formatar telefone (remover caracteres não numéricos)
    const phone = cart.customerPhone.replace(/\D/g, '');
    const firstName = cart.customerName?.split(' ')[0] || 'Cliente';
    const eventName = event?.name || 'nosso evento';
    
    const message = `Olá ${firstName}! Notamos que você não finalizou sua compra para o ${eventName}. Precisa de alguma ajuda para garantir seus ingressos?`;
    
    Linking.openURL(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`);
  };

  const handleEmail = (cart: any) => {
    if (!cart.customerEmail) return;
    
    const firstName = cart.customerName?.split(' ')[0] || 'Cliente';
    const eventName = event?.name || 'nosso evento';
    
    const subject = `Não perca seus ingressos para ${eventName}`;
    const body = `Olá ${firstName},\n\nNotamos que você iniciou uma compra para o ${eventName} mas não finalizou.\n\nSeus ingressos ainda estão disponíveis. Clique aqui para retomar sua compra.\n\nQualquer dúvida, estamos à disposição!\n\nAtenciosamente,\nEquipe ${eventName}`;
    
    Linking.openURL(`mailto:${cart.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d atrás`;
    if (hours > 0) return `${hours}h atrás`;
    return `${minutes}min atrás`;
  };

  if (!event || carts === undefined) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#E65CFF" />
        <Text className="text-white mt-4 font-medium">Carregando carrinhos...</Text>
      </SafeAreaView>
    );
  }

  const activeCarts = carts.filter((c: any) => c.status === 'active');

  const renderCartItem = ({ item }: { item: any }) => (
    <View className="bg-backgroundCard p-4 rounded-2xl mb-3 border border-white/5">
      <View className="flex-row justify-between items-start mb-3">
        <View>
          <Text className="text-white font-bold text-base">
            {item.customerName || 'Cliente sem nome'}
          </Text>
          <Text className="text-textSecondary text-xs">
            {item.customerEmail}
          </Text>
          {item.customerPhone && (
            <Text className="text-textSecondary text-xs">
              {item.customerPhone}
            </Text>
          )}
        </View>
        <View className="items-end">
          <Text className="text-primary font-bold text-base">
            {formatCurrency(item.totalAmount)}
          </Text>
          <Text className="text-textSecondary text-[10px] uppercase">
            {formatTimeAgo(item.lastUpdatedAt)}
          </Text>
        </View>
      </View>

      <View className="bg-background p-3 rounded-xl mb-4 border border-white/5">
        <Text className="text-textSecondary text-[10px] uppercase mb-1">Itens do Carrinho</Text>
        {item.ticketSelections?.map((selection: any, index: number) => (
          <Text key={index} className="text-white text-xs">
            {selection.quantity}x {selection.ticketTypeName || 'Ingresso'}
          </Text>
        ))}
      </View>

      <View className="flex-row gap-3">
        <TouchableOpacity 
          onPress={() => handleWhatsApp(item)}
          disabled={!item.customerPhone}
          className={`flex-1 flex-row items-center justify-center p-3 rounded-xl ${item.customerPhone ? 'bg-[#25D366]/20 border border-[#25D366]/50' : 'bg-white/5 border border-white/5 opacity-50'}`}
        >
          <IconSymbol name="message.fill" size={16} color={item.customerPhone ? "#25D366" : "#ffffff50"} />
          <Text className={`font-bold ml-2 ${item.customerPhone ? 'text-[#25D366]' : 'text-white/50'}`}>WhatsApp</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => handleEmail(item)}
          disabled={!item.customerEmail}
          className={`flex-1 flex-row items-center justify-center p-3 rounded-xl ${item.customerEmail ? 'bg-blue-500/20 border border-blue-500/50' : 'bg-white/5 border border-white/5 opacity-50'}`}
        >
          <IconSymbol name="envelope.fill" size={16} color={item.customerEmail ? "#60a5fa" : "#ffffff50"} />
          <Text className={`font-bold ml-2 ${item.customerEmail ? 'text-blue-400' : 'text-white/50'}`}>E-mail</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center border-b border-white/5">
        <TouchableOpacity 
          onPress={() => router.back()}
          className="p-2 -ml-2"
        >
          <IconSymbol name="arrow.left" size={24} color="#E65CFF" />
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg ml-2 flex-1" numberOfLines={1}>
          Carrinhos Abandonados
        </Text>
      </View>

      <FlatList
        data={activeCarts}
        keyExtractor={(item) => item._id}
        renderItem={renderCartItem}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E65CFF" />
        }
        ListHeaderComponent={() => (
          <View className="mb-6">
            <View className="bg-backgroundCard p-6 rounded-2xl border border-white/5 shadow-xl mb-2">
              <Text className="text-textSecondary text-xs font-bold uppercase mb-2">Receita Potencial</Text>
              <Text className="text-primary text-3xl font-black">
                {formatCurrency(activeCarts.reduce((acc: number, curr: any) => acc + curr.totalAmount, 0))}
              </Text>
              <Text className="text-white mt-2 font-medium">
                {activeCarts.length} {activeCarts.length === 1 ? 'cliente pendente' : 'clientes pendentes'}
              </Text>
            </View>
            <Text className="text-textSecondary text-xs mt-4 mb-2 text-center">
              Recupere vendas entrando em contato diretamente com os clientes.
            </Text>
          </View>
        )}
        ListEmptyComponent={() => (
          <View className="items-center justify-center py-20">
            <IconSymbol name="cart.badge.minus" size={48} color="#333" />
            <Text className="text-textSecondary mt-4 text-center">
              Nenhum carrinho abandonado encontrado.
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}