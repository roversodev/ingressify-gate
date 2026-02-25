import { api } from '@/api';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Image,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface MinimalEventCardProps {
  event: any;
}

export default function MinimalEventCard({ event }: MinimalEventCardProps) {
  const router = useRouter();
  
  // Buscar a URL da imagem
  const imageUrl = useQuery(
    api.storage.getUrl, 
    event.imageStorageId ? { storageId: event.imageStorageId } : "skip"
  );

  // Formata as datas para exibição 
  const formatDate = (date: number | string) => { 
    const eventDate = new Date(date); 
    return { 
      day: eventDate.getDate().toString().padStart(2, '0'), 
      month: eventDate.toLocaleDateString('pt-BR', { month: 'long' }), 
      weekday: eventDate.toLocaleDateString('pt-BR', { weekday: 'long' }), 
      time: eventDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) 
    }; 
  }; 

  const dateInfo = formatDate(event.date); 
  const location = event.location?.split('-')[0]?.trim() || 'Local a definir'; 

  const handleEventPress = () => { 
    router.push(`/scanner/${event._id}`); 
  }; 

  return ( 
    <TouchableOpacity 
      onPress={handleEventPress} 
      className="flex-row gap-1 rounded-lg border border-zinc-700 bg-[#181818] p-1 mb-2 mx-1" 
      activeOpacity={0.8} 
    > 
      {/* Imagem do Evento */} 
      <View className="w-[68px] h-[68px] shrink-0"> 
        <View className="flex items-center aspect-square"> 
          {imageUrl ? ( 
            <Image 
              source={{ uri: imageUrl }} 
              className="h-full w-full rounded object-cover" 
              style={{ width: 68, height: 68 }} 
            /> 
          ) : ( 
            <View className="flex h-[68px] w-[68px] items-center justify-center rounded bg-[#232323]"> 
              <Ionicons name="ticket-outline" size={32} color="#E8B322" /> 
            </View> 
          )} 
        </View> 
      </View> 
      
      {/* Informações do evento */} 
      <View className="min-w-0 flex-grow justify-center"> 
        <View className="flex-row items-center justify-between gap-3 px-2"> 
          <View className="min-w-0 flex-1"> 
            <View className="relative z-10 flex flex-col items-start justify-center"> 
              <Text 
                className="text-base font-semibold leading-5 text-white" 
                numberOfLines={1} 
              > 
                {event.name} 
              </Text> 
              <Text className="text-sm font-medium leading-4 text-[#E8B322] capitalize mt-1"> 
                {dateInfo.weekday}, {dateInfo.day} de {dateInfo.month} 
              </Text> 
              <Text 
                className="text-sm font-normal leading-4 text-zinc-500 mt-1" 
                numberOfLines={1} 
              > 
                {location} 
              </Text> 
            </View> 
          </View> 
          
          <View className="mr-1 flex items-center"> 
            <Ionicons name="chevron-forward" size={12} color="#6B7280" /> 
          </View> 
        </View> 
      </View> 
    </TouchableOpacity> 
  ); 
}