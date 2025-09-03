import { api } from '@/api';
import CustomAlert from '@/components/CustomAlert';
import { useUser } from '@clerk/clerk-expo';
import { useMutation, useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    FlatList,
    SafeAreaView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Platform,
    useWindowDimensions
} from 'react-native';

export default function SearchTicketsScreen() {
    const { eventId } = useLocalSearchParams<{ eventId: string }>();
    const router = useRouter();
    const { user } = useUser();

    const [searchType, setSearchType] = useState<'email' | 'cpf'>('email');
    const [searchValue, setSearchValue] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    // Responsividade: detectar iPad/orientação e ajustar escalas de UI
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;
    const isTablet = Math.min(width, height) >= 768;
    const maxContentWidth = isTablet ? (isLandscape ? 900 : 720) : undefined;
    const spacing = isTablet ? (isLandscape ? 20 : 24) : 16;

    const listItemPadding = isTablet ? (isLandscape ? 16 : 20) : 12;
    const titleFont = isTablet ? (isLandscape ? 18 : 20) : 16;       // Nome do usuário
    const subFont = isTablet ? (isLandscape ? 14 : 16) : 12;         // Email/CPF/Tipo/Status
    const headerFont = isTablet ? (isLandscape ? 20 : 22) : 18;      // Título do header
    const buttonFont = isTablet ? (isLandscape ? 16 : 18) : 14;      // Texto do botão
    const inputFont = isTablet ? (isLandscape ? 16 : 18) : 14;       // Texto do input
    const statusDotSize = isTablet ? (isLandscape ? 12 : 14) : 10;
    
    // Estado para o alerta personalizado
    const [alert, setAlert] = useState({
        visible: false,
        type: 'info' as 'success' | 'warning' | 'error' | 'info',
        title: '',
        message: '',
        actions: []
    });

    // Função para mostrar alerta personalizado
    const showAlert = (type: 'success' | 'warning' | 'error' | 'info', title: string, message: string, actions = []) => {
        setAlert({
            visible: true,
            type,
            title,
            message,
            actions
        });
    };

    const event = useQuery(api.events.getById, { eventId: eventId as Id<"events"> });
    const validateTicketMutation = useMutation(api.tickets.validateTicket);

    // Função para formatar CPF
    const formatCpf = (cpf: string) => {
        // Remove caracteres não numéricos
        const numbers = cpf.replace(/[^0-9]/g, '');
    
        // Verifica se tem 11 dígitos
        if (numbers.length !== 11) return cpf;

        // Formata no padrão XXX.XXX.XXX-XX
        return numbers.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    };

    // Hooks para buscar ingressos com detalhes completos
    const getTicketsWithDetails = useQuery(
        api.tickets.getTicketsWithDetailsByEmailOrCpf,
        searchValue ? {
            ...(searchType === 'email' ? { email: searchValue.trim() } : {}),
            ...(searchType === 'cpf' ? { cpf: formatCpf(searchValue.trim()) } : {}),
            eventId: eventId as Id<"events">
        } : "skip"
    );

    // Função para buscar ingressos
    const handleSearch = async () => {
        if (!searchValue.trim()) {
            showAlert('warning', 'Atenção', 'Por favor, insira um valor para busca');
            return;
        }

        setIsSearching(true);

        try {
        } catch (error: any) {
            console.error('Erro ao buscar ingressos:', error);
            showAlert(
                'error',
                'Erro na busca',
                'Não foi possível buscar os ingressos. Verifique sua conexão e tente novamente.'
            );
        } finally {
            setIsSearching(false);
        }
    };

    // Efeito para buscar automaticamente quando o valor mudar
    useEffect(() => {
        if (searchValue.trim().length > 0) {
            const debounceTimer = setTimeout(() => {
                handleSearch();
            }, 500); // Aguarda 500ms após o usuário parar de digitar
            
            return () => clearTimeout(debounceTimer);
        }
    }, [searchValue, searchType]);

    // Função para validar um ingresso
    const handleValidateTicket = async (ticketId: string) => {
        try {
            const result = await validateTicketMutation({
                ticketId: ticketId as Id<"tickets">,
                eventId: eventId as Id<"events">,
                userId: user?.id ?? ''
            });
    
            // Sempre verificar o resultado estruturado
            if (result && result.success) {
                showAlert(
                    'success',
                    'Ingresso Válido',
                    `Tipo: ${result.ticketType?.name || 'N/A'} | Qtd: ${result.ticket?.quantity || 1}`
                );
            } else {
                let alertTitle = 'Ingresso Inválido';
                let alertMessage = 'Este ingresso não é válido para este evento.';
                let alertType = 'error';
    
                // Usar o resultado estruturado
                if (result && result.ticket) {
                    switch (result.ticket.status) {
                        case 'used':
                            alertTitle = 'Ingresso Já Utilizado';
                            alertMessage = 'Este ingresso já foi utilizado anteriormente.';
                            alertType = 'warning';
                            break;
                        case 'refunded':
                            alertTitle = 'Ingresso Reembolsado';
                            alertMessage = 'Este ingresso foi reembolsado e não é mais válido.';
                            break;
                        case 'cancelled':
                            alertTitle = 'Ingresso Cancelado';
                            alertMessage = 'Este ingresso foi cancelado.';
                            break;
                        default:
                            if (result.event && result.event._id !== eventId) {
                                alertTitle = 'Evento Incorreto';
                                alertMessage = 'Este ingresso não pertence a este evento.';
                            }
                            break;
                    }
                } else if (result && result.errorType) {
                    switch (result.errorType) {
                        case 'TICKET_NOT_FOUND':
                            alertTitle = 'Ingresso Não Encontrado';
                            alertMessage = 'Este ingresso não foi encontrado no sistema.';
                            break;
                        case 'EVENT_MISMATCH':
                            alertTitle = 'Evento Incorreto';
                            alertMessage = 'Este ingresso não pertence a este evento.';
                            break;
                        case 'ALREADY_USED':
                            alertTitle = 'Ingresso Já Utilizado';
                            alertMessage = 'Este ingresso já foi utilizado anteriormente.';
                            alertType = 'warning';
                            break;
                        case 'INVALID_STATUS':
                            alertTitle = 'Status Inválido';
                            alertMessage = 'Este ingresso não pode ser validado devido ao seu status atual.';
                            break;
                        default:
                            alertTitle = 'Erro de Validação';
                            alertMessage = result.message || 'Não foi possível validar o ingresso.';
                            break;
                    }
                }
    
                showAlert(alertType as 'error' | 'warning', alertTitle, alertMessage);
            }
        } catch (error: any) {
            console.error('Erro ao validar ingresso:', error);
            
            // Fallback simples para erros de rede/servidor
            showAlert(
                'error',
                'Erro de Conexão',
                'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.'
            );
        }
    };

    // Renderizar item da lista de resultados
    const renderTicketItem = ({ item }: { item: any }) => {
        const isUsed = item.status === 'used';
        const isInvalid = ['refunded', 'cancelled'].includes(item.status);

        return (
            <Animated.View 
                className={`bg-backgroundCard rounded-lg p-4 mb-3 flex-row justify-between items-center shadow-lg ${
                    isUsed ? 'border-l-4 border-l-yellow-500' : 
                    isInvalid ? 'border-l-4 border-l-red-500' : ''
                }`}
                style={{
                    opacity: new Animated.Value(1),
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 2,
                    padding: listItemPadding,
                }}
            >
                <View className="flex-1">
                    <Text className="text-white font-bold mb-1" style={{ fontSize: titleFont }}>
                        {item.user?.name || 'Nome não disponível'}
                    </Text>
                    <Text className="text-gray-300 mb-0.5" style={{ fontSize: subFont }}>
                        {item.user?.email || 'Email não disponível'}
                    </Text>
                    <Text className="text-gray-300 mb-0.5" style={{ fontSize: subFont }}>
                        CPF: {item.user?.cpf || 'Não disponível'}
                    </Text>
                    <Text className="text-gray-300 mb-1" style={{ fontSize: subFont }}>
                        Tipo: <Text className="text-primary font-bold" style={{ fontSize: subFont }}>{item.ticketType?.name || 'Não disponível'}</Text>
                    </Text>
                    <View className="flex-row items-center mt-1">
                        <Text 
                            className={`mr-1.5 ${
                                isUsed ? 'text-yellow-500' : 
                                isInvalid ? 'text-red-500' : 
                                'text-green-500'
                            }`}
                            style={{ fontSize: statusDotSize, lineHeight: statusDotSize }}
                        >
                            ●
                        </Text>
                        <Text className="text-white font-bold" style={{ fontSize: subFont }}>
                            {item.status === 'used' ? 'Utilizado' :
                            item.status === 'refunded' ? 'Reembolsado' :
                            item.status === 'cancelled' ? 'Cancelado' : 'Disponível'}
                        </Text>
                    </View>
                </View>

                {!isUsed && !isInvalid && (
                    <TouchableOpacity
                        className="bg-primary rounded-lg"
                        onPress={() => handleValidateTicket(item._id)}
                        style={{
                            paddingVertical: isTablet ? 10 : 8,
                            paddingHorizontal: isTablet ? 16 : 12,
                        }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                        <Text className="text-white font-bold" style={{ fontSize: buttonFont }}>Validar</Text>
                    </TouchableOpacity>
                )}
            </Animated.View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <CustomAlert 
                visible={alert.visible}
                type={alert.type}
                title={alert.title}
                message={alert.message}
                actions={alert.actions}
                onClose={() => setAlert(prev => ({ ...prev, visible: false }))}
            />
            
            {/* Header */}
            <View
                className="flex-row items-center bg-backgroundDark border-b border-gray-700"
                style={{ paddingHorizontal: spacing, paddingVertical: isTablet ? 14 : 12 }}
            >
                <TouchableOpacity onPress={() => router.back()} className="mr-4" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text className="text-primary" style={{ fontSize: subFont }}>← Voltar</Text>
                </TouchableOpacity>
                <Text className="text-white font-semibold flex-1" style={{ fontSize: headerFont }}>
                    {event?.name ? `Buscar Ingressos: ${event.name}` : 'Buscar Ingressos'}
                </Text>
            </View>

            {/* Search Container */}
            <View
                className="bg-backgroundDark mb-2 border-b border-gray-700"
                style={{
                    paddingHorizontal: spacing,
                    paddingVertical: isTablet ? 16 : 12,
                    alignSelf: 'center',
                    width: '100%',
                    maxWidth: maxContentWidth,
                }}
            >
                {/* Search Type Buttons */}
                <View className="flex-row mb-3">
                    <TouchableOpacity
                        className={`flex-1 items-center border-b-2 ${searchType === 'email' ? 'border-b-primary' : 'border-b-transparent'}`}
                        onPress={() => setSearchType('email')}
                        style={{ paddingVertical: isTablet ? 10 : 8 }}
                    >
                        <Text
                            style={{ fontSize: inputFont }}
                            className={`${searchType === 'email' ? 'text-primary' : 'text-gray-400'}`}
                        >
                            Email
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        className={`flex-1 items-center border-b-2 ${searchType === 'cpf' ? 'border-b-primary' : 'border-b-transparent'}`}
                        onPress={() => setSearchType('cpf')}
                        style={{ paddingVertical: isTablet ? 10 : 8 }}
                    >
                        <Text
                            style={{ fontSize: inputFont }}
                            className={`${searchType === 'cpf' ? 'text-primary' : 'text-gray-400'}`}
                        >
                            CPF
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Search Input */}
                <TextInput
                    className="bg-zinc-700 text-white rounded-lg mb-3"
                    placeholder={searchType === 'email' ? 'Digite o email do comprador' : 'Digite o CPF do comprador'}
                    placeholderTextColor="#999"
                    value={searchValue}
                    onChangeText={setSearchValue}
                    keyboardType={searchType === 'email' ? 'email-address' : (Platform.OS === 'ios' ? 'number-pad' : 'numeric')}
                    autoCapitalize="none"
                    style={{
                        fontSize: inputFont,
                        paddingVertical: isTablet ? 14 : 12,
                        paddingHorizontal: 16,
                    }}
                />

                {/* Search Button */}
                <TouchableOpacity
                    className="bg-primary rounded-lg items-center"
                    onPress={handleSearch}
                    disabled={isSearching}
                    style={{
                        paddingVertical: isTablet ? 14 : 12,
                    }}
                >
                    {isSearching ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Text className="text-white font-bold" style={{ fontSize: buttonFont }}>Buscar</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Results List */}
            <FlatList
                data={getTicketsWithDetails || []}
                renderItem={renderTicketItem}
                keyExtractor={(item) => item._id}
                className="px-4"
                contentContainerStyle={{
                    alignSelf: 'center',
                    width: '100%',
                    maxWidth: maxContentWidth,
                    paddingHorizontal: spacing,
                    paddingBottom: isTablet ? 24 : 16,
                }}
                ListEmptyComponent={() => (
                    !isSearching && searchValue.trim().length > 0 ? (
                        <View className="items-center justify-center py-8">
                            <Text className="text-white font-bold mb-2" style={{ fontSize: titleFont }}>Nenhum resultado encontrado</Text>
                            <Text className="text-gray-300" style={{ fontSize: subFont }}>Tente outro email ou CPF</Text>
                        </View>
                    ) : !isSearching ? (
                        <View className="items-center justify-center py-8">
                            <Text className="text-white font-bold mb-2" style={{ fontSize: titleFont }}>Busque por ingressos</Text>
                            <Text className="text-gray-300" style={{ fontSize: subFont }}>Digite um email ou CPF para buscar</Text>
                        </View>
                    ) : null
                )}
            />
        </SafeAreaView>
    );
}