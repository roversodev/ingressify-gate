import { api } from '@/api';
import CustomAlert from '@/components/CustomAlert';
import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useUser } from '@clerk/clerk-expo';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    SafeAreaView,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View
} from 'react-native';

export default function ListValidationScreen() {
    const params = useLocalSearchParams<{ validationUrl?: string | string[] }>();
    const rawValidationUrl = params.validationUrl;
    const validationUrlStr = Array.isArray(rawValidationUrl) ? rawValidationUrl[0] : rawValidationUrl;
    const safeValidationUrl =
        typeof validationUrlStr === 'string' && validationUrlStr.trim().length > 0
            ? validationUrlStr
            : null;
    const router = useRouter();
    const { isLoaded, isSignedIn, user } = useUser();
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;
    const isTablet = ((Platform as any).isPad === true) || Math.min(width, height) >= 768;

    const headerIconSize = isTablet ? 28 : 24;
    const headerTitleSize = isTablet ? 20 : 18;

    const infoIconSize = isTablet ? 24 : 20;
    const infoTitleSize = isTablet ? 20 : 16;
    const infoSubtitleSize = isTablet ? 16 : 14;

    const statNumberSize = isTablet ? 28 : 24;
    const statLabelSize = isTablet ? 14 : 12;

    const inputFontSize = isTablet ? 18 : 16;
    const searchButtonSize = isTablet ? 56 : 48;

    const participantNameSize = isTablet ? 18 : 16;
    const participantMetaSize = isTablet ? 14 : 12;

    const badgeIconSize = isTablet ? 20 : 16;
    const badgeFontSize = isTablet ? 14 : 12;

    const actionButtonFontSize = isTablet ? 16 : 14;

    const containerMaxWidth = isTablet ? 900 : undefined;
    // Estado para o alerta personalizado
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

    // Função para mostrar alerta personalizado
    const showAlert = (
        type: 'success' | 'warning' | 'error' | 'info',
        title: string,
        message: string,
        actions: Array<{ text: string; onPress: () => void }> = []
    ) => {
        setAlert({
            visible: true,
            type,
            title,
            message,
            actions
        });
    };

    // Mutations
    const updateValidatorUserId = useMutation(api.eventLists.updateValidatorUserId);

    // Queries
    const eventList = useQuery(
        api.eventLists.getEventListByValidationUrl,
        safeValidationUrl ? { validationUrl: safeValidationUrl } : "skip"
    );

    const event = useQuery(
        api.events.getById,
        eventList ? { eventId: eventList.eventId } : "skip"
    );

    const listSubscriptions = useQuery(
        api.eventLists.getListSubscriptions,
        eventList ? { listId: eventList._id } : "skip"
    );

    // Verificar permissão do usuário
    const validatorPermission = useQuery(
        api.eventLists.checkValidatorPermission,
        isSignedIn && user && safeValidationUrl
            ? { validationUrl: safeValidationUrl, userId: user.id }
            : "skip"
    );

    // Mutations
    const checkInParticipant = useMutation(api.eventLists.checkInParticipant);

    // Atualizar o userId do validador quando ele acessar a página
    useEffect(() => {
        if (isSignedIn && user && user.primaryEmailAddress && safeValidationUrl) {
            updateValidatorUserId({
                validationUrl: safeValidationUrl,
                email: user.primaryEmailAddress.emailAddress,
                userId: user.id,
            }).catch(error => {
                console.error("Erro ao atualizar userId do validador:", error);
            });
        }
    }, [isSignedIn, user, safeValidationUrl, updateValidatorUserId]);

    if (!isLoaded) {
        return (
            <View className="flex-1 bg-background justify-center items-center">
                <ActivityIndicator size="large" color="#E65CFF" />
            </View>
        );
    }

    // Param inválido/ausente: não dá para procurar a lista
    if (!safeValidationUrl) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-700">
                    <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 justify-center items-center">
                        <IconSymbol name="arrow.left" size={24} color="#E65CFF" />
                    </TouchableOpacity>
                    <Text className="text-lg font-semibold text-white">Validação de Lista</Text>
                    <View className="w-10" />
                </View>
                <View className="flex-1 justify-center items-center px-6">
                    <View className="bg-backgroundCard rounded-2xl p-8 items-center max-w-sm w-full">
                        <View className="w-16 h-16 bg-red-500/10 rounded-full items-center justify-center mb-4">
                            <IconSymbol name="exclamationmark.triangle" size={32} color="#EF4444" />
                        </View>
                        <Text className="text-xl font-bold text-white text-center mb-2">Página não encontrada</Text>
                        <Text className="text-textSecondary text-center mb-6 leading-5">
                            A URL de validação é inválida ou está ausente.
                        </Text>
                        <TouchableOpacity 
                            onPress={() => router.push('/')} 
                            className="bg-primary px-6 py-3 rounded-xl w-full"
                        >
                            <Text className="text-white text-center font-semibold">Voltar ao início</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    // Carregando dados da lista/evento
    if (eventList === undefined || event === undefined) {
        return (
            <View className="flex-1 bg-background justify-center items-center">
                <ActivityIndicator size="large" color="#E65CFF" />
            </View>
        );
    }

    // Não encontrado de fato
    if (eventList === null || event === null) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-700">
                    <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 justify-center items-center">
                        <IconSymbol name="arrow.left" size={24} color="#E65CFF" />
                    </TouchableOpacity>
                    <Text className="text-lg font-semibold text-white">Validação de Lista</Text>
                    <View className="w-10" />
                </View>
                <View className="flex-1 justify-center items-center px-6">
                    <View className="bg-backgroundCard rounded-2xl p-8 items-center max-w-sm w-full">
                        <View className="w-16 h-16 bg-red-500/10 rounded-full items-center justify-center mb-4">
                            <IconSymbol name="exclamationmark.triangle" size={32} color="#EF4444" />
                        </View>
                        <Text className="text-xl font-bold text-white text-center mb-2">Página não encontrada</Text>
                        <Text className="text-textSecondary text-center mb-6 leading-5">
                            A página de validação que você está procurando não existe ou foi removida.
                        </Text>
                        <TouchableOpacity 
                            onPress={() => router.push('/')} 
                            className="bg-primary px-6 py-3 rounded-xl w-full"
                        >
                            <Text className="text-white text-center font-semibold">Voltar ao início</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    if (!isSignedIn) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-700">
                    <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 justify-center items-center">
                        <IconSymbol name="arrow.left" size={24} color="#E65CFF" />
                    </TouchableOpacity>
                    <Text className="text-lg font-semibold text-white">Validação de Lista</Text>
                    <View className="w-10" />
                </View>
                <View className="flex-1 justify-center items-center px-6">
                    <View className="bg-backgroundCard rounded-2xl p-8 items-center max-w-sm w-full">
                        <View className="w-16 h-16 bg-yellow-500/10 rounded-full items-center justify-center mb-4">
                            <IconSymbol name="person.crop.circle.badge.exclamationmark" size={32} color="#F59E0B" />
                        </View>
                        <Text className="text-xl font-bold text-white text-center mb-2">Login necessário</Text>
                        <Text className="text-textSecondary text-center mb-6 leading-5">
                            Você precisa estar logado para validar participantes nesta lista.
                        </Text>
                        <TouchableOpacity 
                            onPress={() => router.push('/')} 
                            className="bg-primary px-6 py-3 rounded-xl w-full"
                        >
                            <Text className="text-white text-center font-semibold">Fazer login</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    // Verificar permissão após login
    if (validatorPermission && !validatorPermission.hasPermission) {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-700">
                    <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 justify-center items-center">
                        <IconSymbol name="arrow.left" size={24} color="#E65CFF" />
                    </TouchableOpacity>
                    <Text className="text-lg font-semibold text-white">Validação de Lista</Text>
                    <View className="w-10" />
                </View>
                <View className="flex-1 justify-center items-center px-6">
                    <View className="bg-backgroundCard rounded-2xl p-8 items-center max-w-sm w-full">
                        <View className="w-16 h-16 bg-red-500/10 rounded-full items-center justify-center mb-4">
                            <IconSymbol name="lock" size={32} color="#EF4444" />
                        </View>
                        <Text className="text-xl font-bold text-white text-center mb-2">Acesso negado</Text>
                        <Text className="text-textSecondary text-center mb-6 leading-5">
                            {validatorPermission.message || "Você não tem permissão para acessar esta página de validação."}
                        </Text>
                        <TouchableOpacity 
                            onPress={() => router.push('/')} 
                            className="bg-primary px-6 py-3 rounded-xl w-full"
                        >
                            <Text className="text-white text-center font-semibold">Voltar ao início</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    const filteredParticipants = listSubscriptions?.filter((sub: { userId: string; userName: string; }) => {
        return sub.userId.toLowerCase().includes(searchTerm.toLowerCase()) || 
               (sub.userName && sub.userName.toLowerCase().includes(searchTerm.toLowerCase()));
    }) || [];

    const handleSearch = () => {
        setIsSearching(true);
        // A filtragem já é feita acima, então aqui apenas atualizamos o estado
        setTimeout(() => setIsSearching(false), 500);
    };

    const handleCheckIn = async (participantId: string) => {
        try {
            await checkInParticipant({
                listId: eventList._id,
                participantId,
                validatorId: user.id,
            });

            showAlert(
                'success',
                'Check-in realizado!',
                'O participante foi validado com sucesso.',
                [{
                    text: 'OK',
                    onPress: () => setAlert(prev => ({ ...prev, visible: false }))
                }]
            );

            // Atualizar a lista de participantes (será feito automaticamente pelo Convex)
            setSelectedParticipant(null);
        } catch (error: any) {
            console.error("Erro ao realizar check-in:", error);
            showAlert(
                'error',
                'Erro!',
                'Ocorreu um erro ao validar o participante. Tente novamente.',
                [{
                    text: 'OK',
                    onPress: () => setAlert(prev => ({ ...prev, visible: false }))
                }]
            );
        }
    };

    const validatedCount = filteredParticipants.filter((p: { checkedIn: any; }) => p.checkedIn).length;
    const totalCount = filteredParticipants.length;

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
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-700">
                <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 justify-center items-center">
                    <IconSymbol name="arrow.left" size={headerIconSize} color="#E65CFF" />
                </TouchableOpacity>
                <Text className="text-lg font-semibold text-white" style={{ fontSize: headerTitleSize }}>
                    Validação de Lista
                </Text>
                <View className="w-10" />
            </View>

            <View className="flex-1 p-4" style={{ maxWidth: containerMaxWidth, alignSelf: 'center', width: '100%' }}>
                {/* Informações da Lista */}
                <View className="bg-backgroundCard rounded-2xl p-6 mb-4 shadow-lg">
                    <View className="flex-row items-center mb-3">
                        <View className="w-10 h-10 bg-primary/10 rounded-full items-center justify-center mr-3">
                            <IconSymbol name="list.bullet" size={infoIconSize} color="#E65CFF" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-lg font-bold text-white mb-1" style={{ fontSize: infoTitleSize }}>
                                {eventList.name}
                            </Text>
                            <Text className="text-textSecondary text-sm" style={{ fontSize: infoSubtitleSize }}>
                                {event.name}
                            </Text>
                        </View>
                    </View>
                    
                    {/* Estatísticas */}
                    <View className="flex-row justify-between pt-4 border-t border-gray-700">
                        <View className="items-center">
                            <Text className="text-2xl font-bold text-primary" style={{ fontSize: statNumberSize }}>
                                {validatedCount}
                            </Text>
                            <Text className="text-textSecondary text-xs" style={{ fontSize: statLabelSize }}>
                                Validados
                            </Text>
                        </View>
                        <View className="items-center">
                            <Text className="text-2xl font-bold text-white" style={{ fontSize: statNumberSize }}>
                                {totalCount}
                            </Text>
                            <Text className="text-textSecondary text-xs" style={{ fontSize: statLabelSize }}>
                                Total
                            </Text>
                        </View>
                        <View className="items-center">
                            <Text className="text-2xl font-bold text-yellow-500" style={{ fontSize: statNumberSize }}>
                                {totalCount - validatedCount}
                            </Text>
                            <Text className="text-textSecondary text-xs" style={{ fontSize: statLabelSize }}>
                                Pendentes
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Barra de Busca */}
                <View className="flex-row mb-4">
                    <View className="flex-1 bg-backgroundCard rounded-xl mr-3 shadow-sm">
                        <TextInput
                            className="px-4 py-3 text-white text-base"
                            placeholder="Buscar participante..."
                            placeholderTextColor="#6B7280"
                            value={searchTerm}
                            onChangeText={setSearchTerm}
                            style={{ fontSize: inputFontSize }}
                        />
                    </View>
                    <TouchableOpacity 
                        className={`rounded-xl items-center justify-center shadow-sm ${
                            isSearching ? 'bg-primary/50' : 'bg-primary'
                        }`}
                        onPress={handleSearch} 
                        disabled={isSearching}
                        style={{ width: searchButtonSize, height: searchButtonSize }}
                    >
                        {isSearching ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <IconSymbol name="magnifyingglass" size={isTablet ? 22 : 20} color="#FFF" />
                        )}
                    </TouchableOpacity>
                </View>

                {/* Lista de Participantes */}
                <View className="flex-1 bg-backgroundCard rounded-2xl shadow-lg overflow-hidden">
                    <FlatList
                        data={filteredParticipants}
                        keyExtractor={(item) => item._id}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item, index }) => (
                            <TouchableOpacity 
                                className={`flex-row justify-between items-center p-4 ${
                                    index !== filteredParticipants.length - 1 ? 'border-b border-gray-700' : ''
                                } active:bg-gray-700/30`}
                                onPress={() => setSelectedParticipant(item)}
                            >
                                <View className="flex-1 mr-3">
                                    <Text className="text-white font-medium text-base mb-1" style={{ fontSize: participantNameSize }}>
                                        {item.userName || item.userId}
                                    </Text>
                                    <Text className="text-textSecondary text-sm" style={{ fontSize: participantMetaSize }}>
                                        {new Date(item.subscribedAt).toLocaleString('pt-BR')}
                                    </Text>
                                </View>
                                
                                {item.checkedIn ? (
                                    <View className="flex-row items-center bg-green-500/10 px-3 py-2 rounded-lg">
                                        <IconSymbol name="checkmark.circle.fill" size={badgeIconSize} color="#10B981" />
                                        <Text className="text-green-500 text-sm font-medium ml-2" style={{ fontSize: badgeFontSize }}>
                                            Validado
                                        </Text>
                                    </View>
                                ) : (
                                    <HapticTab
                                        className="bg-primary px-4 py-2 rounded-lg shadow-sm active:bg-primary/80"
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            handleCheckIn(item.userId);
                                        }}
                                    >
                                        <Text className="text-white text-sm font-semibold" style={{ fontSize: actionButtonFontSize }}>
                                            Validar
                                        </Text>
                                    </HapticTab>
                                )}
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={() => (
                            <View className="flex-1 justify-center items-center py-16">
                                <View className="w-16 h-16 bg-gray-600/20 rounded-full items-center justify-center mb-4">
                                    <IconSymbol name="person.3" size={isTablet ? 36 : 32} color="#6B7280" />
                                </View>
                                <Text className="text-textSecondary text-center text-base" style={{ fontSize: participantNameSize }}>
                                    {searchTerm ? 'Nenhum participante encontrado' : 'Nenhum participante inscrito'}
                                </Text>
                                {searchTerm && (
                                    <Text className="text-textSecondary text-center text-sm mt-1" style={{ fontSize: participantMetaSize }}>
                                        Tente buscar por outro termo
                                    </Text>
                                )}
                            </View>
                        )}
                    />
                </View>

                {/* Detalhes do Participante Selecionado */}
                {selectedParticipant && (
                    <View className="absolute inset-0 bg-black/50 justify-end">
                        <View className="bg-background rounded-t-3xl p-6 max-h-96">
                            <View className="flex-row items-center justify-between mb-6">
                                <View className="flex-row items-center">
                                    <View className="w-10 h-10 bg-primary/10 rounded-full items-center justify-center mr-3">
                                        <IconSymbol name="person.circle" size={isTablet ? 28 : 24} color="#E65CFF" />
                                    </View>
                                    <Text className="text-lg font-bold text-white" style={{ fontSize: isTablet ? 20 : 18 }}>
                                        Detalhes do Participante
                                    </Text>
                                </View>
                                <TouchableOpacity 
                                    onPress={() => setSelectedParticipant(null)}
                                    className="w-8 h-8 items-center justify-center"
                                >
                                    <IconSymbol name="xmark" size={isTablet ? 22 : 20} color="#6B7280" />
                                </TouchableOpacity>
                            </View>
                            
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-textSecondary text-sm mb-1">Nome/ID do Participante</Text>
                                    <Text className="text-white text-base font-medium">
                                        {selectedParticipant.userName || selectedParticipant.userId}
                                    </Text>
                                </View>
                                
                                <View>
                                    <Text className="text-textSecondary text-sm mb-1">Data de Inscrição</Text>
                                    <Text className="text-white text-base">
                                        {new Date(selectedParticipant.subscribedAt).toLocaleString('pt-BR')}
                                    </Text>
                                </View>
                                
                                <View>
                                    <Text className="text-textSecondary text-sm mb-2">Status</Text>
                                    <View className="flex-row items-center">
                                        {selectedParticipant.checkedIn ? (
                                            <>
                                                <View className="w-3 h-3 bg-green-500 rounded-full mr-3" />
                                                <View>
                                                    <Text className="text-green-500 font-medium">Validado</Text>
                                                    <Text className="text-textSecondary text-sm">
                                                        {selectedParticipant.checkedInAt ? 
                                                            `em ${new Date(selectedParticipant.checkedInAt).toLocaleString('pt-BR')}` : 
                                                            'Data não disponível'
                                                        }
                                                    </Text>
                                                </View>
                                            </>
                                        ) : (
                                            <>
                                                <View className="w-3 h-3 bg-yellow-500 rounded-full mr-3" />
                                                <Text className="text-yellow-500 font-medium">Aguardando validação</Text>
                                            </>
                                        )}
                                    </View>
                                </View>

                                {!selectedParticipant.checkedIn && (
                                    <TouchableOpacity 
                                        className="bg-primary py-4 rounded-xl mt-4 shadow-sm active:bg-primary/80"
                                        onPress={() => handleCheckIn(selectedParticipant.userId)}
                                    >
                                        <Text className="text-white text-center font-bold text-base">
                                            Validar Participante
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}