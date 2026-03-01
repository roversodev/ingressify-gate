import { api } from '@/api';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useUser } from '@clerk/clerk-expo';
import { useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EventFinanceScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { width } = useWindowDimensions();

  const event = useQuery(api.events.getById, { eventId: eventId as Id<"events"> });
  const [refreshing, setRefreshing] = React.useState(false);

  // Buscar as últimas 50 transações deste evento específico de forma otimizada
  const eventTransactions = useQuery(
    api.organizations.getEventTransactionsPaginated,
    (user?.id && eventId) 
      ? { eventId: eventId as Id<"events">, userId: user.id, limit: 50 } 
      : "skip"
  );

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (!event || eventTransactions === undefined) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#E65CFF" />
        <Text className="text-white mt-4 font-medium">Carregando financeiro...</Text>
      </SafeAreaView>
    );
  }

  const renderTransactionItem = ({ item }: { item: any }) => {
    const isPaid = item.status === 'paid';
    const isPix = item.paymentMethod?.toUpperCase() === 'PIX';

    return (
      <View className="bg-backgroundCard p-4 rounded-xl mb-3 border border-white/5 flex-row items-center">
        <View 
          className="w-10 h-10 rounded-full items-center justify-center mr-4"
          style={{ backgroundColor: isPaid ? '#10b98120' : '#ef444420' }}
        >
          <IconSymbol 
            name={isPix ? "arrow.up.right.circle" : "creditcard"} 
            size={20} 
            color={isPaid ? "#10b981" : "#ef4444"} 
          />
        </View>
        
        <View className="flex-1">
          <Text className="text-white font-semibold text-sm" numberOfLines={1}>
            {item.metadata?.customerName || 'Cliente Ingressify'}
          </Text>
          <Text className="text-textSecondary text-xs mt-0.5">
            {new Date(item.createdAt).toLocaleDateString('pt-BR')} • {isPix ? 'PIX' : 'Cartão'}
          </Text>
        </View>

        <View className="items-end">
          <Text className={`font-bold text-sm ${isPaid ? 'text-green-500' : 'text-red-500'}`}>
            {isPaid ? '+' : ''}{formatCurrency(item.amount)}
          </Text>
          <Text className="text-textSecondary text-[10px] uppercase mt-0.5">
            {isPaid ? 'Aprovado' : 'Pendente'}
          </Text>
        </View>
      </View>
    );
  };

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
          Financeiro - {event.name}
        </Text>
      </View>

      <FlatList
        data={eventTransactions}
        keyExtractor={(item) => item._id}
        renderItem={renderTransactionItem}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E65CFF" />
        }
        ListHeaderComponent={() => (
          <View className="mb-8">
            {/* Stats Cards */}
            <View className="bg-backgroundCard p-6 rounded-2xl border border-white/5 shadow-xl mb-6">
              <Text className="text-textSecondary text-xs font-bold uppercase mb-2">Receita Líquida Estimada</Text>
              <Text className="text-primary text-3xl font-black">
                {formatCurrency(event.metrics?.revenue || 0)}
              </Text>
              <View className="flex-row items-center mt-4 pt-4 border-t border-white/5">
                <View className="flex-1">
                  <Text className="text-textSecondary text-[10px] uppercase mb-1">Vendas Totais</Text>
                  <Text className="text-white font-bold text-lg">
                    {formatCurrency(event.metrics?.grossRevenue || 0)}
                  </Text>
                </View>
                <View className="w-[1px] h-8 bg-white/5 mx-4" />
                <View className="flex-1">
                  <Text className="text-textSecondary text-[10px] uppercase mb-1">Tickets</Text>
                  <Text className="text-white font-bold text-lg">
                    {event.metrics?.soldTickets || 0}
                  </Text>
                </View>
              </View>
            </View>

            <Text className="text-white text-lg font-bold mb-4">Transações Recentes</Text>
          </View>
        )}
        ListEmptyComponent={() => (
          <View className="items-center justify-center py-20">
            <IconSymbol name="tray" size={48} color="#333" />
            <Text className="text-textSecondary mt-4 text-center">
              Nenhuma transação encontrada para este evento.
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}