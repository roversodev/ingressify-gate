import { api } from '@/api';
import CustomAlert from '@/components/CustomAlert';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useUser } from '@clerk/clerk-expo';
import { useMutation, useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EventFinanceScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { user } = useUser();

  const event = useQuery(api.events.getById, { eventId: eventId as Id<"events"> });
  const [refreshing, setRefreshing] = useState(false);

  const orgArgs =
    user?.id && event?.organizationId
      ? {
          organizationId: event.organizationId as Id<"organizations">,
          userId: user.id,
          eventId: eventId as Id<"events">,
        }
      : "skip";

  const financialStats = useQuery(api.organizations.getOrganizationFinancialSummary, orgArgs);

  const eventTransactions = useQuery(
    api.organizations.getEventTransactionsPaginated,
    user?.id && eventId
      ? { eventId: eventId as Id<"events">, userId: user.id, limit: 50 }
      : "skip"
  );

  const ticketAvailability = useQuery(api.events.getEventAvailabilityEventPage, {
    eventId: eventId as Id<"events">,
  });

  const withdrawals = useQuery(
    api.organizations.getOrganizationWithdrawals,
    orgArgs === "skip" ? "skip" : orgArgs
  );

  const myMembership = useQuery(
    api.organizations.getMyOrganizationMembership,
    user?.id && event?.organizationId
      ? {
          organizationId: event.organizationId as Id<"organizations">,
          userId: user.id,
        }
      : "skip"
  );

  const canManageWithdrawal =
    myMembership?.role === "owner" || myMembership?.role === "admin";

  const organization = useQuery(
    api.organizations.getOrganizationById,
    event?.organizationId && canManageWithdrawal
      ? { organizationId: event.organizationId as Id<"organizations"> }
      : "skip"
  );

  const requestWithdrawal = useMutation(api.organizations.requestWithdrawal);

  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [selectedPixKeyIndex, setSelectedPixKeyIndex] = useState(0);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);

  const [alert, setAlert] = useState<{
    visible: boolean;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showAlert = useCallback(
    (type: 'success' | 'warning' | 'error' | 'info', title: string, message: string) => {
      setAlert({ visible: true, type, title, message });
    },
    []
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const totalWithdrawn = useMemo(() => {
    if (!withdrawals) return 0;
    return withdrawals
      .filter(
        (w: { status: string }) =>
          w.status === 'completed' || w.status === 'processing' || w.status === 'pending'
      )
      .reduce((sum: number, w: { amount: number }) => sum + w.amount, 0);
  }, [withdrawals]);

  const availableBalance = useMemo(() => {
    if (!financialStats) return 0;
    const card = financialStats.paymentMethodStats.card.availableAmount ?? 0;
    const pix = financialStats.paymentMethodStats.pix.availableAmount ?? 0;
    return Math.max(0, card + pix - totalWithdrawn);
  }, [financialStats, totalWithdrawn]);

  const handleWithdrawalAmountChange = (text: string) => {
    const numericValue = text.replace(/\D/g, '');
    if (numericValue === '') {
      setWithdrawalAmount('');
      return;
    }
    const amount = parseInt(numericValue, 10) / 100;
    const formatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
    setWithdrawalAmount(formatted);
  };

  const handleSubmitWithdrawal = async () => {
    if (!user?.id || !event?.organizationId) return;
    const cleanValue = withdrawalAmount.replace(/[^\d,]/g, '').replace(',', '.');
    const amountInReais = parseFloat(cleanValue);
    if (isNaN(amountInReais) || amountInReais <= 0) {
      showAlert('warning', 'Valor inválido', 'Informe um valor válido para o saque.');
      return;
    }
    if (amountInReais < 90) {
      showAlert('warning', 'Valor mínimo', 'O valor mínimo para saque é R$ 90,00.');
      return;
    }
    if (amountInReais > availableBalance + 0.01) {
      showAlert('warning', 'Saldo insuficiente', 'O valor é maior que o saldo disponível para este evento.');
      return;
    }
    if (!organization?.pixKeys?.length) {
      showAlert('error', 'PIX', 'Não há chaves PIX cadastradas na organização.');
      return;
    }

    setSubmittingWithdrawal(true);
    try {
      const result = await requestWithdrawal({
        organizationId: event.organizationId as Id<"organizations">,
        userId: user.id,
        amount: amountInReais,
        pixKeyIndex: selectedPixKeyIndex,
        eventId: eventId as Id<"events">,
      });
      if (result?.success) {
        showAlert('success', 'Solicitação enviada', 'Seu pedido de saque foi registrado e será processado em breve.');
        setWithdrawModalOpen(false);
        setWithdrawalAmount('');
      } else {
        showAlert('error', 'Não foi possível solicitar', result?.message || 'Tente novamente.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao solicitar saque.';
      showAlert('error', 'Erro', msg);
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  const loadingCore =
    !event ||
    eventTransactions === undefined ||
    financialStats === undefined ||
    ticketAvailability === undefined ||
    withdrawals === undefined ||
    myMembership === undefined ||
    (canManageWithdrawal && organization === undefined);

  if (loadingCore) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#E65CFF" />
        <Text className="text-white mt-4 font-medium">Carregando financeiro...</Text>
      </SafeAreaView>
    );
  }

  const netRevenue = financialStats.totalEarningsWithDiscount ?? 0;
  const grossSales = financialStats.totalEarnings ?? 0;
  const ticketsSold = ticketAvailability.purchasedTickets ?? 0;
  const pixKeys = organization?.pixKeys ?? [];

  const renderTransactionItem = ({ item }: { item: any }) => {
    const isPaid = item.status === 'paid';
    const pm = (item.paymentMethod || '').toLowerCase();
    const isPix = pm === 'pix';
    const isCard = pm === 'card' || pm === 'credit_card';
    const methodLabel = isPix ? 'PIX' : isCard ? 'Cartão' : item.paymentMethod || '—';

    return (
      <View className="bg-backgroundCard p-4 rounded-xl mb-3 border border-white/5 flex-row items-center">
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-4"
          style={{ backgroundColor: isPaid ? '#10b98120' : '#ef444420' }}
        >
          <IconSymbol
            name={isPix ? 'arrow.up.right.circle' : 'creditcard'}
            size={20}
            color={isPaid ? '#10b981' : '#ef4444'}
          />
        </View>

        <View className="flex-1">
          <Text className="text-white font-semibold text-sm" numberOfLines={1}>
            {item.metadata?.customerName || 'Cliente Ingressify'}
          </Text>
          <Text className="text-textSecondary text-xs mt-0.5">
            {new Date(item.createdAt).toLocaleDateString('pt-BR')} • {methodLabel}
          </Text>
        </View>

        <View className="items-end">
          <Text className={`font-bold text-sm ${isPaid ? 'text-green-500' : 'text-red-500'}`}>
            {isPaid ? '+' : ''}
            {formatCurrency(item.amount)}
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
      <View className="px-6 py-4 flex-row items-center border-b border-white/5">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <IconSymbol name="arrow.left" size={24} color="#E65CFF" />
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg ml-2 flex-1" numberOfLines={1}>
          Financeiro - {event.name}
        </Text>
        {canManageWithdrawal && (
          <TouchableOpacity
            onPress={() => {
              if (!pixKeys.length) {
                showAlert('info', 'Chave PIX', 'Cadastre uma chave PIX na organização (painel web) para solicitar saque.');
                return;
              }
              setWithdrawModalOpen(true);
            }}
            disabled={availableBalance < 1}
            className={`px-3 py-2 rounded-xl ${availableBalance >= 1 ? 'bg-primary' : 'bg-white/10 opacity-50'}`}
          >
            <Text className="text-white text-xs font-bold">Saque</Text>
          </TouchableOpacity>
        )}
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
            <View className="bg-backgroundCard p-6 rounded-2xl border border-white/5 shadow-xl mb-4">
              <Text className="text-textSecondary text-xs font-bold uppercase mb-2">
                Receita líquida (produtor)
              </Text>
              <Text className="text-primary text-3xl font-black">{formatCurrency(netRevenue)}</Text>
              <View className="flex-row items-center mt-4 pt-4 border-t border-white/5">
                <View className="flex-1">
                  <Text className="text-textSecondary text-[10px] uppercase mb-1">Faturamento bruto</Text>
                  <Text className="text-white font-bold text-lg">{formatCurrency(grossSales)}</Text>
                </View>
                <View className="w-[1px] h-8 bg-white/5 mx-4" />
                <View className="flex-1">
                  <Text className="text-textSecondary text-[10px] uppercase mb-1">Ingressos vendidos</Text>
                  <Text className="text-white font-bold text-lg">{ticketsSold}</Text>
                </View>
              </View>
            </View>

            <View className="bg-backgroundCard p-4 rounded-2xl border border-white/5 mb-4">
              <Text className="text-textSecondary text-[10px] font-bold uppercase mb-3">Por método (líquido)</Text>
              <View className="flex-row">
                <View className="flex-1">
                  <Text className="text-textSecondary text-xs mb-1">Cartão</Text>
                  <Text className="text-white font-semibold">
                    {formatCurrency(financialStats.paymentMethodStats.card.amount ?? 0)}
                  </Text>
                  <Text className="text-textSecondary text-[10px] mt-1">
                    {financialStats.paymentMethodStats.card.count ?? 0} trans.
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-textSecondary text-xs mb-1">PIX</Text>
                  <Text className="text-white font-semibold">
                    {formatCurrency(financialStats.paymentMethodStats.pix.amount ?? 0)}
                  </Text>
                  <Text className="text-textSecondary text-[10px] mt-1">
                    {financialStats.paymentMethodStats.pix.count ?? 0} trans.
                  </Text>
                </View>
              </View>
            </View>

            {canManageWithdrawal && (
              <View className="bg-backgroundCard p-4 rounded-2xl border border-white/5 mb-6">
                <Text className="text-textSecondary text-[10px] font-bold uppercase mb-2">
                  Saldo disponível (evento)
                </Text>
                <Text className="text-green-500 text-2xl font-black">{formatCurrency(availableBalance)}</Text>
                <Text className="text-textSecondary text-xs mt-2">
                  Já solicitado em saques: {formatCurrency(totalWithdrawn)}
                </Text>
                {availableBalance < 1 && (
                  <Text className="text-amber-500/90 text-xs mt-2">
                    Sem saldo disponível para novo saque neste evento.
                  </Text>
                )}
              </View>
            )}

            {(financialStats.chargebackCount ?? 0) > 0 && (
              <View className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl mb-4">
                <Text className="text-amber-400 text-sm font-semibold">
                  {financialStats.chargebackCount} transação(ões) em chargeback
                </Text>
              </View>
            )}

            <Text className="text-white text-lg font-bold mb-4">Transações recentes</Text>
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

      <Modal
        visible={withdrawModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => !submittingWithdrawal && setWithdrawModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end bg-black/60"
        >
          <View className="bg-background rounded-t-3xl border border-white/10 p-6 max-h-[85%]">
            <Text className="text-white text-lg font-bold mb-1">Solicitar saque</Text>
            <Text className="text-textSecondary text-sm mb-4">
              Mínimo R$ 90,00 • Saldo: {formatCurrency(availableBalance)}
            </Text>

            <Text className="text-textSecondary text-xs font-bold uppercase mb-2">Chave PIX</Text>
            <ScrollView className="max-h-32 mb-4" nestedScrollEnabled>
              {pixKeys.map((pk: { key: string; keyType: string; description?: string; isDefault?: boolean }, idx: number) => (
                <TouchableOpacity
                  key={`${pk.key}-${idx}`}
                  onPress={() => setSelectedPixKeyIndex(idx)}
                  className={`p-3 rounded-xl mb-2 border ${selectedPixKeyIndex === idx ? 'border-primary bg-primary/10' : 'border-white/10 bg-backgroundCard'}`}
                >
                  <Text className="text-white font-mono text-sm" numberOfLines={1}>
                    {pk.key}
                  </Text>
                  <Text className="text-textSecondary text-xs">
                    {String(pk.keyType).toUpperCase()}
                    {pk.isDefault ? ' • Padrão' : ''}
                    {pk.description ? ` • ${pk.description}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text className="text-textSecondary text-xs font-bold uppercase mb-2">Valor (R$)</Text>
            <TextInput
              value={withdrawalAmount}
              onChangeText={handleWithdrawalAmountChange}
              placeholder="R$ 0,00"
              placeholderTextColor="#666"
              keyboardType="numeric"
              className="bg-backgroundCard border border-white/10 rounded-xl px-4 py-3 text-white text-lg mb-6"
            />

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setWithdrawModalOpen(false)}
                disabled={submittingWithdrawal}
                className="flex-1 py-4 rounded-xl bg-white/10 items-center"
              >
                <Text className="text-white font-semibold">Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmitWithdrawal}
                disabled={submittingWithdrawal}
                className="flex-1 py-4 rounded-xl bg-primary items-center"
              >
                {submittingWithdrawal ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold">Enviar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CustomAlert
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        onClose={() => setAlert((a) => ({ ...a, visible: false }))}
        actions={[{ text: 'OK', onPress: () => setAlert((a) => ({ ...a, visible: false })) }]}
      />
    </SafeAreaView>
  );
}
