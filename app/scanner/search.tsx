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
    View
} from 'react-native';

export default function SearchTicketsScreen() {
    const { eventId } = useLocalSearchParams<{ eventId: string }>();
    const router = useRouter();
    const { user } = useUser();

    const [searchType, setSearchType] = useState<'email' | 'cpf'>('email');
    const [searchValue, setSearchValue] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    
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

            if (result.success) {
                showAlert(
                    'success',
                    'Ingresso Válido',
                    `Tipo: ${result.ticketType?.name || 'N/A'} | Qtd: ${result.ticket?.quantity || 1}`
                );
                
                // Atualizar a lista após validação bem-sucedida
                // Não é necessário chamar handleSearch() novamente, pois o useQuery já atualiza automaticamente
            } else {
                let alertTitle = 'Ingresso Inválido';
                let alertMessage = 'Este ingresso não é válido para este evento.';
                let alertType = 'error';

                // Personalizar mensagens baseadas no tipo de erro
                if (result.ticket.status === 'used') {
                    alertTitle = 'Ingresso Já Utilizado';
                    alertMessage = 'Este ingresso já foi utilizado anteriormente.';
                    alertType = 'warning';
                } else if (result.ticket.status === 'refunded') {
                    alertTitle = 'Ingresso Reembolsado';
                    alertMessage = 'Este ingresso foi reembolsado e não é mais válido.';
                } else if (result.ticket.status === 'cancelled') {
                    alertTitle = 'Ingresso Cancelado';
                    alertMessage = 'Este ingresso foi cancelado.';
                } else if (!result.success && result.event._id !== eventId) {
                    alertTitle = 'Evento Incorreto';
                    alertMessage = 'Este ingresso não pertence a este evento.';
                }

                showAlert(alertType as 'error' | 'warning', alertTitle, alertMessage);
            }
        } catch (error: any) {
            console.error('Erro ao validar ingresso:', error);
            showAlert(
                'error',
                'Erro de Conexão',
                'Não foi possível validar o ingresso. Verifique sua conexão e tente novamente.'
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
                }}
            >
                <View className="flex-1">
                    <Text className="text-white text-base font-bold mb-1">
                        {item.user?.name || 'Nome não disponível'}
                    </Text>
                    <Text className="text-gray-300 text-sm mb-0.5">
                        {item.user?.email || 'Email não disponível'}
                    </Text>
                    <Text className="text-gray-300 text-sm mb-0.5">
                        CPF: {item.user?.cpf || 'Não disponível'}
                    </Text>
                    <Text className="text-gray-300 text-sm mb-1">
                        Tipo: <Text className="text-primary font-bold">{item.ticketType?.name || 'Não disponível'}</Text>
                    </Text>
                    <View className="flex-row items-center mt-1">
                        <Text 
                            className={`text-xs mr-1.5 ${
                                isUsed ? 'text-yellow-500' : 
                                isInvalid ? 'text-red-500' : 
                                'text-green-500'
                            }`}
                        >
                            ●
                        </Text>
                        <Text className="text-white text-sm font-bold">
                            {item.status === 'used' ? 'Utilizado' :
                            item.status === 'refunded' ? 'Reembolsado' :
                            item.status === 'cancelled' ? 'Cancelado' : 'Disponível'}
                        </Text>
                    </View>
                </View>

                {!isUsed && !isInvalid && (
                    <TouchableOpacity
                        className="bg-primary px-4 py-2 rounded-lg"
                        onPress={() => handleValidateTicket(item._id)}
                    >
                        <Text className="text-white text-sm font-bold">Validar</Text>
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
            <View className="flex-row items-center px-4 py-3 bg-backgroundDark border-b border-gray-700">
                <TouchableOpacity onPress={() => router.back()} className="mr-4">
                    <Text className="text-primary text-base">← Voltar</Text>
                </TouchableOpacity>
                <Text className="text-white text-lg font-semibold flex-1">
                    {event?.name ? `Buscar Ingressos: ${event.name}` : 'Buscar Ingressos'}
                </Text>
            </View>

            {/* Search Container */}
            <View className="p-4 bg-backgroundDark mb-2 border-b border-gray-700">
                {/* Search Type Buttons */}
                <View className="flex-row mb-3">
                    <TouchableOpacity
                        className={`flex-1 py-2 items-center border-b-2 ${
                            searchType === 'email' ? 'border-b-primary' : 'border-b-transparent'
                        }`}
                        onPress={() => setSearchType('email')}
                    >
                        <Text className={`text-base ${
                            searchType === 'email' ? 'text-primary' : 'text-gray-400'
                        }`}>
                            Email
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        className={`flex-1 py-2 items-center border-b-2 ${
                            searchType === 'cpf' ? 'border-b-primary' : 'border-b-transparent'
                        }`}
                        onPress={() => setSearchType('cpf')}
                    >
                        <Text className={`text-base ${
                            searchType === 'cpf' ? 'text-primary' : 'text-gray-400'
                        }`}>
                            CPF
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Search Input */}
                <TextInput
                    className="bg-zinc-700 text-white rounded-lg px-4 py-3 text-base mb-3"
                    placeholder={searchType === 'email' ? 'Digite o email do comprador' : 'Digite o CPF do comprador'}
                    placeholderTextColor="#999"
                    value={searchValue}
                    onChangeText={setSearchValue}
                    keyboardType={searchType === 'email' ? 'email-address' : 'numeric'}
                    autoCapitalize="none"
                />

                {/* Search Button */}
                <TouchableOpacity
                    className="bg-primary py-3 rounded-lg items-center"
                    onPress={handleSearch}
                    disabled={isSearching}
                >
                    {isSearching ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Text className="text-white text-base font-bold">Buscar</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Results List */}
            <FlatList
                data={getTicketsWithDetails || []}
                renderItem={renderTicketItem}
                keyExtractor={(item) => item._id}
                className="px-4"
                ListEmptyComponent={() => (
                    !isSearching && searchValue.trim().length > 0 ? (
                        <View className="items-center justify-center py-8">
                            <Text className="text-white text-base font-bold mb-2">Nenhum resultado encontrado</Text>
                            <Text className="text-gray-300 text-sm">Tente outro email ou CPF</Text>
                        </View>
                    ) : !isSearching ? (
                        <View className="items-center justify-center py-8">
                            <Text className="text-white text-base font-bold mb-2">Busque por ingressos</Text>
                            <Text className="text-gray-300 text-sm">Digite um email ou CPF para buscar</Text>
                        </View>
                    ) : null
                )}
            />
        </SafeAreaView>
    );
}