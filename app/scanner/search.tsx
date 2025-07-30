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
    StyleSheet,
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
                    `Tipo: ${result.ticketType?.name || 'N/A'}\nQuantidade: ${result.ticket?.quantity || 1}`
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
                style={[
                    styles.ticketItem, 
                    isUsed && styles.usedTicket, 
                    isInvalid && styles.invalidTicket,
                    { opacity: new Animated.Value(1) }
                ]}
            >
                <View style={styles.ticketInfo}>
                    <Text style={styles.ticketName}>{item.user?.name || 'Nome não disponível'}</Text>
                    <Text style={styles.ticketDetail}>{item.user?.email || 'Email não disponível'}</Text>
                    <Text style={styles.ticketDetail}>CPF: {item.user?.cpf || 'Não disponível'}</Text>
                    <Text style={styles.ticketDetail}>Tipo: {item.ticketType?.name || 'Não disponível'}</Text>
                    <Text style={styles.ticketStatus}>
                        <Text style={[styles.statusDot, 
                            isUsed ? styles.usedDot : 
                            isInvalid ? styles.invalidDot : 
                            styles.validDot
                        ]}>●</Text> 
                        {item.status === 'used' ? 'Utilizado' :
                        item.status === 'refunded' ? 'Reembolsado' :
                        item.status === 'cancelled' ? 'Cancelado' : 'Disponível'}
                    </Text>
                </View>

                {!isUsed && !isInvalid && (
                    <TouchableOpacity
                        style={styles.validateButton}
                        onPress={() => handleValidateTicket(item._id)}
                    >
                        <Text style={styles.validateButtonText}>Validar</Text>
                    </TouchableOpacity>
                )}
            </Animated.View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <CustomAlert 
                visible={alert.visible}
                type={alert.type}
                title={alert.title}
                message={alert.message}
                actions={alert.actions}
                onClose={() => setAlert(prev => ({ ...prev, visible: false }))}
            />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Text style={styles.backButtonText}>← Voltar</Text>
                </TouchableOpacity>
                <Text style={styles.title}>
                    {event?.name ? `Buscar Ingressos: ${event.name}` : 'Buscar Ingressos'}
                </Text>
            </View>

            <View style={styles.searchContainer}>
                <View style={styles.searchTypeContainer}>
                    <TouchableOpacity
                        style={[styles.searchTypeButton, searchType === 'email' && styles.searchTypeButtonActive]}
                        onPress={() => setSearchType('email')}
                    >
                        <Text style={[styles.searchTypeText, searchType === 'email' && styles.searchTypeTextActive]}>Email</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.searchTypeButton, searchType === 'cpf' && styles.searchTypeButtonActive]}
                        onPress={() => setSearchType('cpf')}
                    >
                        <Text style={[styles.searchTypeText, searchType === 'cpf' && styles.searchTypeTextActive]}>CPF</Text>
                    </TouchableOpacity>
                </View>

                <TextInput
                    style={styles.searchInput}
                    placeholder={searchType === 'email' ? 'Digite o email do comprador' : 'Digite o CPF do comprador'}
                    placeholderTextColor="#999"
                    value={searchValue}
                    onChangeText={setSearchValue}
                    keyboardType={searchType === 'email' ? 'email-address' : 'numeric'}
                    autoCapitalize="none"
                />

                <TouchableOpacity
                    style={styles.searchButton}
                    onPress={handleSearch}
                    disabled={isSearching}
                >
                    {isSearching ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Text style={styles.searchButtonText}>Buscar</Text>
                    )}
                </TouchableOpacity>
            </View>

            <FlatList
                data={getTicketsWithDetails || []}
                renderItem={renderTicketItem}
                keyExtractor={(item) => item._id}
                contentContainerStyle={styles.resultsList}
                ListEmptyComponent={() => (
                    !isSearching && searchValue.trim().length > 0 ? (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>Nenhum resultado encontrado</Text>
                            <Text style={styles.emptySubtext}>Tente outro email ou CPF</Text>
                        </View>
                    ) : !isSearching ? (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>Busque por ingressos</Text>
                            <Text style={styles.emptySubtext}>Digite um email ou CPF para buscar</Text>
                        </View>
                    ) : null
                )}
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
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#181818', // bg-card
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    backButton: {
        marginRight: 16,
    },
    backButtonText: {
        fontSize: 16,
        color: '#E65CFF', // text-destaque
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
        flex: 1,
    },
    searchContainer: {
        padding: 16,
        backgroundColor: '#181818', // bg-card
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    searchTypeContainer: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    searchTypeButton: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    searchTypeButtonActive: {
        borderBottomColor: '#E65CFF', // text-destaque
    },
    searchTypeText: {
        fontSize: 16,
        color: '#999',
    },
    searchTypeTextActive: {
        color: '#E65CFF', // text-destaque
    },
    searchInput: {
        backgroundColor: '#333',
        color: '#FFFFFF',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        marginBottom: 12,
    },
    searchButton: {
        backgroundColor: '#E65CFF', // bg-destaque
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    searchButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    resultsList: {
        padding: 16,
    },
    ticketItem: {
        backgroundColor: '#181818', // bg-card
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    usedTicket: {
        borderLeftWidth: 4,
        borderLeftColor: '#FFB800', // amarelo
    },
    invalidTicket: {
        borderLeftWidth: 4,
        borderLeftColor: '#FF4D4D', // vermelho
    },
    ticketInfo: {
        flex: 1,
    },
    ticketName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    ticketDetail: {
        fontSize: 14,
        color: '#CCCCCC',
        marginBottom: 2,
    },
    ticketStatus: {
        fontSize: 14,
        fontWeight: 'bold',
        marginTop: 4,
        color: '#FFFFFF',
    },
    statusDot: {
        fontSize: 12,
        marginRight: 6,
    },
    validDot: {
        color: '#4CAF50', // verde
    },
    usedDot: {
        color: '#FFB800', // amarelo
    },
    invalidDot: {
        color: '#FF4D4D', // vermelho
    },
    validateButton: {
        backgroundColor: '#E65CFF', // bg-destaque
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    validateButtonText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#CCCCCC',
    },
    // Estilos para o alerta personalizado
    alertContainer: {
        position: 'absolute',
        top: 60,
        left: 16,
        right: 16,
        zIndex: 1000,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    alertIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    alertContent: {
        flex: 1,
    },
    alertTitle: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 4,
    },
    alertMessage: {
        color: '#FFFFFF',
        fontSize: 14,
    },
    alertCloseButton: {
        padding: 4,
    },
    alertCloseText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
    },
});