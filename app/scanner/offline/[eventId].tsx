import { api } from '@/api';
import CustomAlert from '@/components/CustomAlert';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useUser } from '@clerk/clerk-expo';
import { useMutation, useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function OfflineSalesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { user } = useUser();

  const [recipientEmail, setRecipientEmail] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selectedType, setSelectedType] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [alert, setAlert] = useState<{
    visible: boolean;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
  }>({ visible: false, type: 'info', title: '', message: '' });

  const showAlert = useCallback((type: 'success' | 'warning' | 'error' | 'info', title: string, message: string) => {
    setAlert({ visible: true, type, title, message });
  }, []);

  // Promoter record para este usuário+evento (pode ser null se for organizador)
  const promoter = useQuery(
    api.promoters.getPromoterByUserAndEvent,
    user?.id ? { userId: user.id, eventId: eventId as Id<'events'> } : 'skip'
  );

  // Permissão de validador (usada para detectar se é organizador/admin)
  const permission = useQuery(
    api.validators.canValidateTickets,
    user?.id ? { eventId: eventId as Id<'events'>, userId: user.id } : 'skip'
  );

  // Tipos de ingresso permitidos para este promoter (skip se for organizador)
  const allowedTypeIds = useQuery(
    api.promoters.getPromoterAllowedTicketTypes,
    promoter?._id ? { promoterId: promoter._id as Id<'promoters'> } : 'skip'
  );

  // Todos os tipos de ingresso do evento
  const allTicketTypes = useQuery(
    api.ticketTypes.getAllEventTicketTypes,
    { eventId: eventId as Id<'events'> }
  );

  // Info básica do evento
  const event = useQuery(api.events.getEventBasicInfo, { eventId: eventId as Id<'events'> });

  // Verificação de email
  const checkUserExists = useQuery(
    api.users.checkUserExistsByEmail,
    (recipientEmail && recipientEmail.includes('@') && recipientEmail.includes('.'))
      ? { email: recipientEmail.trim().toLowerCase() }
      : 'skip'
  );

  const recordOfflineSale = useMutation(api.promoters.recordOfflineSale);
  const recordOrganizerOfflineSale = useMutation(api.promoters.recordOrganizerOfflineSale);

  const isAdmin = permission?.isOwner || permission?.role === 'admin' || permission?.role === 'owner';
  const isActivePromoter = !!promoter && promoter.isActive !== false;
  const canAccess = isActivePromoter || isAdmin;

  const isLoading = promoter === undefined || permission === undefined || !allTicketTypes || !event;

  // Filtrar tipos: nunca exibe cortesias; promoter respeita permissões, organizador vê todos
  const ticketTypes = React.useMemo(() => {
    if (!allTicketTypes) return [];
    const active = allTicketTypes.filter((t: any) => t.isActive !== false && !t.isCourtesy);
    if (isAdmin) return active;
    if (!allowedTypeIds || allowedTypeIds.length === 0) return active;
    return active.filter((t: any) => allowedTypeIds.includes(t._id));
  }, [allTicketTypes, allowedTypeIds, isAdmin]);

  const isEmailValid = checkUserExists?.exists === true;

  const handleSend = async () => {
    if (!recipientEmail.trim() || !isEmailValid) {
      showAlert('warning', 'Email inválido', 'Informe o email de um usuário cadastrado.');
      return;
    }
    if (!selectedType) {
      showAlert('warning', 'Selecione o ingresso', 'Escolha um tipo de ingresso.');
      return;
    }

    setIsSending(true);
    try {
      if (isActivePromoter && !isAdmin) {
        await recordOfflineSale({
          eventId: eventId as Id<'events'>,
          promoterId: promoter._id as Id<'promoters'>,
          ticketTypeId: selectedType._id as Id<'ticketTypes'>,
          quantity,
          recipientEmail: recipientEmail.trim().toLowerCase(),
          userId: user?.id || '',
          notes: notes.trim() || undefined,
        });
      } else {
        await recordOrganizerOfflineSale({
          eventId: eventId as Id<'events'>,
          ticketTypeId: selectedType._id as Id<'ticketTypes'>,
          quantity,
          recipientEmail: recipientEmail.trim().toLowerCase(),
          userId: user?.id || '',
          notes: notes.trim() || undefined,
        });
      }

      showAlert('success', 'Venda registrada!', `${quantity}x ${selectedType.name} enviado para ${recipientEmail.trim()}`);
      setRecipientEmail('');
      setQuantity(1);
      setSelectedType(null);
      setNotes('');
    } catch (err: any) {
      showAlert('error', 'Erro ao registrar', err.message || 'Ocorreu um erro inesperado.');
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#E65CFF" />
      </SafeAreaView>
    );
  }

  if (!canAccess) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background px-8">
        <IconSymbol name="xmark.circle" size={48} color="#ef4444" />
        <Text className="text-white text-lg font-semibold mt-4 text-center">Acesso negado</Text>
        <Text className="text-gray-400 text-sm text-center mt-2">Você não tem permissão para registrar vendas neste evento.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-6 bg-backgroundCard px-6 py-3 rounded-xl">
          <Text className="text-white font-medium">Voltar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const rawRate = promoter?.commissionRate ?? 0;
  const commissionRate = rawRate > 1 ? rawRate / 100 : rawRate;
  const estimatedCommission = selectedType && isActivePromoter && !isAdmin
    ? selectedType.currentPrice * quantity * commissionRate
    : 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-background"
    >
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-6 py-4 flex-row items-center border-b border-white/5">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <IconSymbol name="arrow.left" size={24} color="#E65CFF" />
          </TouchableOpacity>
          <View className="flex-1 ml-2">
            <Text className="text-white font-bold text-lg">Venda Offline</Text>
            <Text className="text-gray-500 text-xs" numberOfLines={1}>{event.name}</Text>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        >
          {/* Info do vendedor */}
          <View className="bg-backgroundCard rounded-2xl p-4 border border-white/5 mb-6 flex-row items-center gap-4">
            <View className={`w-10 h-10 rounded-full items-center justify-center ${isAdmin ? 'bg-primary/20' : 'bg-yellow-500/20'}`}>
              <IconSymbol name="person.fill" size={20} color={isAdmin ? '#E65CFF' : '#f59e0b'} />
            </View>
            <View className="flex-1">
              {isAdmin ? (
                <>
                  <Text className="text-white font-semibold">Organizador</Text>
                  <Text className="text-gray-500 text-xs">Venda direta — sem comissão</Text>
                </>
              ) : (
                <>
                  <Text className="text-white font-semibold">{promoter?.name}</Text>
                  <Text className="text-gray-500 text-xs">
                    Código: <Text className="text-gray-300 font-mono">{promoter?.code}</Text>
                    {commissionRate > 0 && (
                      <Text className="text-yellow-400"> · {(commissionRate * 100).toFixed(0)}% comissão</Text>
                    )}
                  </Text>
                </>
              )}
            </View>
            <View className={`px-2.5 py-1 rounded-full ${isAdmin ? 'bg-primary/15' : 'bg-yellow-500/15'}`}>
              <Text className={`text-[10px] font-bold uppercase ${isAdmin ? 'text-primary' : 'text-yellow-400'}`}>
                {isAdmin ? 'Admin' : 'Promoter'}
              </Text>
            </View>
          </View>

          {/* Destinatário */}
          <View className="bg-backgroundCard rounded-3xl p-6 border border-white/5 mb-6">
            <Text className="text-textSecondary text-[10px] font-bold uppercase mb-4 tracking-widest">Destinatário</Text>

            <View className="flex-row items-center bg-background p-4 rounded-2xl border border-white/10">
              <IconSymbol name="envelope" size={18} color="#555" />
              <TextInput
                value={recipientEmail}
                onChangeText={setRecipientEmail}
                placeholder="email@exemplo.com"
                placeholderTextColor="#444"
                className="flex-1 ml-3 text-white text-base"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {recipientEmail.length > 5 && checkUserExists !== undefined && (
              <View className="flex-row items-center mt-3 ml-1">
                <IconSymbol
                  name={isEmailValid ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                  size={14}
                  color={isEmailValid ? '#10b981' : '#ef4444'}
                />
                <Text className={`text-xs ml-2 font-medium ${isEmailValid ? 'text-green-500/80' : 'text-red-500/80'}`}>
                  {isEmailValid
                    ? `✓ ${checkUserExists.user?.name || recipientEmail}`
                    : '✗ Usuário não cadastrado'}
                </Text>
              </View>
            )}
          </View>

          {/* Tipos de ingresso */}
          <View className="mb-6">
            <Text className="text-textSecondary text-[10px] font-bold uppercase mb-4 ml-2 tracking-widest">
              Tipo de ingresso
            </Text>
            {ticketTypes.length === 0 ? (
              <View className="bg-backgroundCard rounded-2xl p-6 border border-white/5 items-center">
                <IconSymbol name="ticket" size={32} color="#555" />
                <Text className="text-gray-500 text-sm mt-3 text-center">Nenhum tipo de ingresso disponível</Text>
              </View>
            ) : (
              <View className="gap-3">
                {ticketTypes.map((type: any) => {
                  const isSelected = selectedType?._id === type._id;
                  const available = type.availableQuantity ?? 0;
                  return (
                    <TouchableOpacity
                      key={type._id}
                      onPress={() => setSelectedType(type)}
                      disabled={available < 1}
                      className={`p-4 rounded-2xl border flex-row items-center justify-between ${
                        available < 1
                          ? 'opacity-40 bg-backgroundCard border-white/5'
                          : isSelected
                          ? 'bg-primary/10 border-primary'
                          : 'bg-backgroundCard border-white/5'
                      }`}
                      activeOpacity={1}
                    >
                      <View className="flex-1 mr-2">
                        <Text className={`font-bold text-sm ${isSelected ? 'text-primary' : 'text-white'}`}>
                          {type.name}
                        </Text>
                        <Text className="text-gray-500 text-xs mt-0.5">
                          {BRL(type.currentPrice)} · {available} disponíveis
                        </Text>
                        {(type.dayName || type.lotName) && (
                          <Text className="text-gray-600 text-xs mt-0.5">
                            {[type.dayName, type.lotName].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                      </View>
                      {isSelected && <IconSymbol name="checkmark.circle.fill" size={20} color="#E65CFF" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Quantidade */}
          <View className="bg-backgroundCard rounded-3xl p-6 border border-white/5 mb-6 flex-row items-center justify-between">
            <View>
              <Text className="text-textSecondary text-[10px] font-bold uppercase mb-1 tracking-widest">Quantidade</Text>
              <Text className="text-white font-bold text-lg">{quantity}x</Text>
              {selectedType && commissionRate > 0 && (
                <Text className="text-yellow-400 text-xs mt-0.5">
                  Comissão: {BRL(estimatedCommission)}
                </Text>
              )}
            </View>

            <View className="flex-row items-center gap-3 bg-background p-1.5 rounded-2xl border border-white/5">
              <TouchableOpacity
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 items-center justify-center bg-backgroundCard rounded-xl"
                activeOpacity={1}
              >
                <Text className="text-white text-xl">-</Text>
              </TouchableOpacity>
              <Text className="text-white text-xl font-bold w-6 text-center">{quantity}</Text>
              <TouchableOpacity
                onPress={() => setQuantity(quantity + 1)}
                className="w-10 h-10 items-center justify-center bg-primary rounded-xl"
                activeOpacity={1}
              >
                <Text className="text-white text-xl">+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Observações */}
          <View className="bg-backgroundCard rounded-3xl p-6 border border-white/5 mb-8">
            <Text className="text-textSecondary text-[10px] font-bold uppercase mb-3 tracking-widest">
              Observações (opcional)
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Ex: pago em dinheiro, cliente X..."
              placeholderTextColor="#444"
              className="text-white text-sm"
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Botão */}
          <TouchableOpacity
            onPress={handleSend}
            disabled={isSending || !isEmailValid || !selectedType}
            className={`h-16 rounded-2xl items-center justify-center shadow-xl ${
              isSending || !isEmailValid || !selectedType
                ? 'bg-white/5 opacity-50'
                : 'bg-yellow-500 shadow-yellow-500/20'
            }`}
          >
            {isSending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-black font-bold text-lg">Registrar Venda</Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        <CustomAlert
          visible={alert.visible}
          type={alert.type}
          title={alert.title}
          message={alert.message}
          onClose={() => setAlert({ ...alert, visible: false })}
          actions={[{ text: 'OK', onPress: () => setAlert({ ...alert, visible: false }) }]}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
