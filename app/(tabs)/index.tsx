import { api } from '@/api';
import { useUser } from '@clerk/clerk-expo';
import { useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface Event {
  _id: string;
  name: string;
  date: string;
  location: string;
  totalTickets: number;
  validatedTickets: number;
  revenue: number;
  imageUrl?: string;
}

// Componente para renderizar um único evento
function EventItem({ event, onPress }: { event: any, onPress: () => void }) {
  // Buscar a URL da imagem usando o hook useQuery para cada item
  const imageUrl = useQuery(
    api.storage.getUrl, 
    event.imageStorageId ? { storageId: event.imageStorageId } : "skip"
  );
  
  // Buscar a disponibilidade do evento para obter a contagem de validações
  const availability = useQuery(
    api.events.getEventAvailability,
    { eventId: event._id as Id<"events"> }
  );
  
  // Usar availability.validatedTickets se disponível, caso contrário usar event.validatedTickets
  const validatedTickets = availability ? availability.validatedTickets : event.validatedTickets;
  const totalTickets = availability ? availability.purchasedTickets : event.totalTickets;
  
  const progressPercentage = totalTickets > 0 
    ? (validatedTickets / totalTickets) * 100 
    : 0;

  return (
    <TouchableOpacity 
      className="bg-backgroundCard rounded-xl p-5 mb-4 border border-gray-800/30"
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Imagem do evento */}
      {imageUrl && (
        <View className="mb-4 rounded-lg overflow-hidden">
          <Image
            source={{ uri: imageUrl }}
            style={{ width: '100%', height: 160 }}
            contentFit="cover"
            transition={200}
          />
        </View>
      )}

      {/* Header do evento */}
      <View className="flex-row justify-between items-start mb-4">
        <View className="flex-1 mr-4">
          <Text className="text-white text-lg font-semibold mb-1" numberOfLines={2}>
            {event.name}
          </Text>
          <Text className="text-gray-400 text-sm">
            {event.location}
          </Text>
        </View>
        <View className="bg-primary/10 px-3 py-1 rounded-full">
          <Text className="text-primary text-xs font-medium">
            {new Date(event.date).toLocaleDateString('pt-BR', { 
              day: '2-digit', 
              month: 'short' 
            })}
          </Text>
        </View>
      </View>
      
      {/* Estatísticas */}
      <View className="flex-row justify-between mb-4">
        <View className="flex-1 mr-2">
          <Text className="text-primary text-xl font-bold">{validatedTickets}</Text>
          <Text className="text-gray-500 text-xs uppercase tracking-wide">Validados</Text>
        </View>
        <View className="flex-1 ml-2">
          <Text className="text-white text-xl font-bold">{totalTickets}</Text>
          <Text className="text-gray-500 text-xs uppercase tracking-wide">Total</Text>
        </View>
      </View>
      
      {/* Barra de progresso */}
      <View className="space-y-2">
        <View className="flex-row justify-between items-center">
          <Text className="text-gray-400 text-sm">Progresso</Text>
          <Text className="text-primary text-sm font-medium">{progressPercentage.toFixed(0)}%</Text>
        </View>
        <View className="h-2 bg-progressBar rounded-full overflow-hidden">
          <View 
            className="h-full bg-primary rounded-full"
            style={{ width: `${progressPercentage}%` }}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function EventsScreen() {
  const { user } = useUser();
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);

  // Buscar eventos que o usuário criou
  const sellerEvents = useQuery(
    api.events.getSellerEvents,
    user?.id ? { userId: user.id } : "skip"
  );
  
  // Buscar eventos que o usuário pode validar
  const validatorEvents = useQuery(
    api.validators.getEventsUserCanValidate,
    user?.id ? { userId: user.id } : "skip"
  );
  
  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // Combinar os eventos do vendedor e os eventos que o usuário pode validar
  const formattedEvents = React.useMemo(() => {
    const allEvents: any[] = [];
    
    // Adicionar eventos do vendedor
    if (sellerEvents) {
      const formatted = sellerEvents.map((event: { _id: any; name: any; eventStartDate: any; _creationTime: any; location: any; totalTickets: any; metrics: { validatedTickets: any; revenue: any; }; imageStorageId: any; }) => ({
        _id: event._id,
        name: event.name,
        date: event.eventStartDate || event._creationTime,
        location: event.location,
        totalTickets: event.totalTickets,
        validatedTickets: event.metrics?.validatedTickets || 0,
        revenue: event.metrics?.revenue || 0,
        imageStorageId: event.imageStorageId,
        isOwner: true
      }));
      allEvents.push(...formatted);
    }
    
    // Adicionar eventos que o usuário pode validar
    if (validatorEvents) {
      const formatted = validatorEvents.map((event: { _id: any; name: any; eventStartDate: any; _creationTime: any; location: any; totalTickets: any; metrics: { validatedTickets: any; revenue: any; }; imageStorageId: any; }) => ({
        _id: event._id,
        name: event.name,
        date: event.eventStartDate || event._creationTime,
        location: event.location,
        totalTickets: event.totalTickets,
        validatedTickets: event.metrics?.validatedTickets || 0,
        revenue: event.metrics?.revenue || 0,
        imageStorageId: event.imageStorageId,
        isOwner: false
      }));
      
      // Filtrar eventos duplicados (que o usuário é dono e validador)
      const uniqueEvents = formatted.filter((validatorEvent: { _id: any; }) => 
        !allEvents.some(sellerEvent => sellerEvent._id === validatorEvent._id)
      );
      
      allEvents.push(...uniqueEvents);
    }
    
    return allEvents;
  }, [sellerEvents, validatorEvents]);

  if (sellerEvents === undefined && validatorEvents === undefined) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#E65CFF" />
        <Text className="text-white text-base mt-4">Carregando eventos...</Text>
      </SafeAreaView>
    );
  }

  if ((!sellerEvents || sellerEvents.length === 0) && (!validatorEvents || validatorEvents.length === 0)) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background px-8">
        <View className="items-center">
          <View className="w-16 h-16 bg-gray-800 rounded-full items-center justify-center mb-6">
            <Text className="text-gray-400 text-2xl">📅</Text>
          </View>
          <Text className="text-white text-xl font-semibold mb-2 text-center">
            Nenhum evento encontrado
          </Text>
          <Text className="text-gray-400 text-sm text-center leading-5">
            Você não tem eventos próprios ou eventos para validar
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-6 pt-6 pb-4">
        <Text className="text-white text-2xl font-bold mb-1">Eventos</Text>
        <Text className="text-gray-400 text-sm">
          {formattedEvents.length} {formattedEvents.length === 1 ? 'evento' : 'eventos'}
        </Text>
      </View>
      
      <FlatList
        data={formattedEvents}
        renderItem={({ item }) => (
          <EventItem 
            event={item} 
            onPress={() => router.push(`/scanner/${item._id}`)}
          />
        )}
        keyExtractor={(item) => item._id}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#E65CFF"
          />
        }
        contentContainerStyle={{ 
          paddingHorizontal: 20, 
          paddingBottom: 100 
        }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
