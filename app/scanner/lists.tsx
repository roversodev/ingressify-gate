import { api } from '@/api';
import CustomAlert from '@/components/CustomAlert';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useUser } from '@clerk/clerk-expo';
import { useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    SafeAreaView,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View
} from 'react-native';

export default function EventListsScreen() {
    const { eventId } = useLocalSearchParams<{ eventId: string }>();
    const router = useRouter();
    const { isLoaded, isSignedIn, user } = useUser();

    const [alert, setAlert] = useState<{
        visible: boolean;
        type: 'success' | 'warning' | 'error' | 'info';
        title: string;
        message: string;
        actions: Array<{ text: string; onPress: () => void }>;
    }>({
        visible: false,
        type: 'info',
        title: '',
        message: '',
        actions: []
    });

    // Responsividade (iPad / landscape)
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;
    const isTablet = ((Platform as any).isPad === true) || Math.min(width, height) >= 768;

    const containerMaxWidth = isTablet ? 900 : undefined;

    const headerIconSize = isTablet ? 28 : 24;
    const headerTitleSize = isTablet ? 20 : 18;

    const eventIconSize = isTablet ? 24 : 20;
    const eventTitleSize = isTablet ? 20 : 18;
    const eventSubtitleSize = isTablet ? 16 : 14;

    const sectionIconSize = isTablet ? 22 : 20;
    const sectionTitleSize = isTablet ? 18 : 16;

    const listNameSize = isTablet ? 18 : 16;
    const listTypeSize = isTablet ? 16 : 14;
    const listCountIconSize = isTablet ? 16 : 14;
    const listCountTextSize = isTablet ? 13 : 12;

    const pillFontSize = isTablet ? 13 : 12;
    const chevronSize = isTablet ? 18 : 16;

    const emptyIconSize = isTablet ? 56 : 48;
    const emptyTitleSize = isTablet ? 17 : 16;
    const emptySubtitleSize = isTablet ? 14 : 13;

    const event = useQuery(api.events.getById, { eventId: eventId as Id<"events"> });
    
    const eventLists = useQuery(
        api.eventLists.getEventLists, 
        { eventId: eventId as Id<"events"> }
    );

    if (!isLoaded || !event || !eventLists) {
        return (
            <SafeAreaView className="flex-1 justify-center items-center bg-background">
                <ActivityIndicator size="large" color="#E65CFF" />
                <Text className="text-white mt-4 text-base font-medium">Carregando...</Text>
            </SafeAreaView>
        );
    }

    const handleListSelect = (validationUrl: string) => {
        router.push(`/scanner/list-validation?validationUrl=${validationUrl}`);
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <CustomAlert
                visible={alert.visible}
                type={alert.type}
                title={alert.title}
                message={alert.message}
                actions={alert.actions.length > 0 ? alert.actions : [
                    {
                        text: 'OK',
                        onPress: () => setAlert(prev => ({ ...prev, visible: false }))
                    }
                ]} 
                onClose={() => {}} 
            />

            {/* Header */}
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-backgroundCard">
                <TouchableOpacity 
                    onPress={() => router.back()} 
                    className="w-10 h-10 justify-center items-center -ml-2"
                >
                    <IconSymbol name="arrow.left" size={headerIconSize} color="#E65CFF" />
                </TouchableOpacity>
                <Text className="text-white text-lg font-semibold flex-1 text-center" style={{ fontSize: headerTitleSize }}>
                    Listas do Evento
                </Text>
                <View className="w-10" />
            </View>

            <View className="flex-1 p-4" style={{ maxWidth: containerMaxWidth, alignSelf: 'center', width: '100%' }}>
                {/* Event Info */}
                <View className="mb-6 p-5 bg-backgroundCard rounded-xl shadow-lg">
                    <View className="flex-row items-center mb-2">
                        <IconSymbol name="calendar" size={eventIconSize} color="#E65CFF" />
                        <Text className="text-white text-lg font-semibold ml-2" style={{ fontSize: eventTitleSize }}>
                            {event.name}
                        </Text>
                    </View>
                    <Text className="text-textSecondary text-sm" style={{ fontSize: eventSubtitleSize }}>
                        Selecione uma lista para validar participantes
                    </Text>
                </View>

                {/* Lists Container */}
                <View className="flex-1">
                    <View className="flex-row items-center mb-4">
                        <IconSymbol name="list.bullet" size={sectionIconSize} color="#E65CFF" />
                        <Text className="text-white text-base font-semibold ml-2" style={{ fontSize: sectionTitleSize }}>
                            Listas Disponíveis ({eventLists.length})
                        </Text>
                    </View>

                    {eventLists.length > 0 ? (
                        <FlatList
                            data={eventLists}
                            keyExtractor={(item) => item._id}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item }) => (
                                <TouchableOpacity 
                                    className={`bg-backgroundCard rounded-xl p-4 mb-3 shadow-sm ${
                                        !item.validationUrl ? 'opacity-50' : ''
                                    }`}
                                    onPress={() => handleListSelect(item.validationUrl)}
                                    disabled={!item.validationUrl}
                                >
                                    <View className="flex-row items-center justify-between">
                                        <View className="flex-1 mr-3">
                                            <Text className="text-white text-base font-medium mb-1" style={{ fontSize: listNameSize }}>
                                                {item.name}
                                            </Text>
                                            <Text className="text-textSecondary text-sm mb-2" style={{ fontSize: listTypeSize }}>
                                                {item.listType}
                                            </Text>
                                            <View className="flex-row items-center">
                                                <IconSymbol name="person.2" size={listCountIconSize} color="#A3A3A3" />
                                                <Text className="text-textSecondary text-xs ml-1" style={{ fontSize: listCountTextSize }}>
                                                    {item.subscriptionsCount || 0} participantes
                                                </Text>
                                            </View>
                                        </View>
                                        <View className="items-end">
                                            <View className={`px-3 py-1.5 rounded-full ${
                                                item.isActive 
                                                    ? 'bg-green-500/20' 
                                                    : 'bg-red-500/20'
                                            }`}>
                                                <Text className={`text-xs font-medium ${
                                                    item.isActive 
                                                        ? 'text-green-500' 
                                                        : 'text-red-500'
                                                }`} style={{ fontSize: pillFontSize }}>
                                                    {item.isActive ? 'Ativa' : 'Inativa'}
                                                </Text>
                                            </View>
                                            {item.validationUrl && (
                                                <View className="mt-2">
                                                    <IconSymbol name="chevron.right" size={chevronSize} color="#E65CFF" />
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={() => (
                                <View className="bg-backgroundCard rounded-xl p-8 items-center justify-center">
                                    <IconSymbol name="list.bullet" size={emptyIconSize} color="#A3A3A3" />
                                    <Text className="text-textSecondary text-base mt-3 font-medium" style={{ fontSize: emptyTitleSize }}>
                                        Nenhuma lista encontrada
                                    </Text>
                                    <Text className="text-textSecondary text-sm mt-1 text-center" style={{ fontSize: emptySubtitleSize }}>
                                        As listas do evento aparecerão aqui quando disponíveis
                                    </Text>
                                </View>
                            )}
                        />
                    ) : (
                        <View className="bg-backgroundCard rounded-xl p-8 items-center justify-center">
                            <IconSymbol name="list.bullet" size={emptyIconSize} color="#A3A3A3" />
                            <Text className="text-textSecondary text-base mt-3 font-medium" style={{ fontSize: emptyTitleSize }}>
                                Nenhuma lista encontrada
                            </Text>
                            <Text className="text-textSecondary text-sm mt-1 text-center" style={{ fontSize: emptySubtitleSize }}>
                                As listas do evento aparecerão aqui quando disponíveis
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
}