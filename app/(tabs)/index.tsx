import { api } from '@/api';
import { useAuth, useUser } from '@clerk/clerk-expo';
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
  StyleSheet,
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
      style={styles.eventCard}
      onPress={onPress}
    >
      {imageUrl && (
        <Image
          source={{ uri: imageUrl }}
          style={styles.eventImage}
          contentFit="cover"
        />
      )}
      <View style={styles.eventHeader}>
        <Text style={styles.eventName}>{event.name}</Text>
        <Text style={styles.eventDate}>
          {new Date(event.date).toLocaleDateString('pt-BR')}
        </Text>
      </View>
      
      <Text style={styles.eventLocation}>{event.location}</Text>
      
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{validatedTickets}</Text>
          <Text style={styles.statLabel}>Validados</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{totalTickets}</Text>
          <Text style={styles.statLabel}>Vendidos</Text>
        </View>
      </View>
      
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[styles.progressFill, { width: `${progressPercentage}%` }]} 
          />
        </View>
        <Text style={styles.progressText}>{progressPercentage.toFixed(1)}%</Text>
      </View>
    </TouchableOpacity>

  );
}

export default function EventsScreen() {
  const { isLoaded } = useAuth();
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
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E65CFF" />
        <Text style={styles.loadingText}>Carregando eventos...</Text>
      </SafeAreaView>
    );
  }

  if ((!sellerEvents || sellerEvents.length === 0) && (!validatorEvents || validatorEvents.length === 0)) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Nenhum evento encontrado</Text>
        <Text style={styles.emptySubtitle}>Você não tem eventos próprios ou eventos para validar</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Eventos</Text>
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#232323', // bg-body
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    backgroundColor: '#232323', // bg-body
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  listContainer: {
    padding: 16,
  },
  eventCard: {
    backgroundColor: '#181818', // bg-card
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  eventImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 12,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  eventName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 8,
  },
  eventDate: {
    fontSize: 14,
    color: '#A3A3A3', // text-secondary
  },
  eventLocation: {
    fontSize: 14,
    color: '#A3A3A3', // text-secondary
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E65CFF', // text-destaque
  },
  statLabel: {
    fontSize: 12,
    color: '#A3A3A3', // text-secondary
    marginTop: 4,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#333333', // bg-progress-bg
    borderRadius: 4,
    marginRight: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#E65CFF', // bg-destaque
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#A3A3A3', // text-secondary
    width: 40,
    textAlign: 'right',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#232323', // bg-body
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#232323', // bg-body
    padding: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#A3A3A3', // text-secondary
    textAlign: 'center',
  },
});
