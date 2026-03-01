import { api } from '@/api';
import { useUser } from '@clerk/clerk-expo';
import { useMutation, useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CustomAlert from '@/components/CustomAlert';
import { IconSymbol } from '@/components/ui/IconSymbol';

export default function ValidatorsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { user } = useUser();

  const [email, setEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [isUpdatingPermissions, setIsUpdatingPermissions] = useState(false);
  const [permissionsModalVisible, setPermissionsModalVisible] = useState(false);
  const [selectedValidator, setSelectedValidator] = useState<any>(null);
  const [localPermissions, setLocalPermissions] = useState<{
    dayIds: Id<"eventDays">[];
    lotIds: Id<"ticketLots">[];
    ticketTypeIds: Id<"ticketTypes">[];
  }>({
    dayIds: [],
    lotIds: [],
    ticketTypeIds: []
  });

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

  const event = useQuery(api.events.getById, { eventId: eventId as Id<"events"> });

  const validators = useQuery(
    api.validators.getEventValidators,
    user?.id ? { eventId: eventId as Id<"events">, userId: user.id } : "skip"
  );

  const daysAndLots = useQuery(api.ticketTypes.getEventDaysAndLots, { eventId: eventId as Id<"events"> });
  const allTicketTypes = useQuery(api.ticketTypes.getAllEventTicketTypes, { eventId: eventId as Id<"events"> });

  const inviteValidator = useMutation(api.validators.inviteValidator);
  const removeValidator = useMutation(api.validators.removeValidator);
  const updatePermissions = useMutation(api.validators.updateValidatorPermissions);

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

  const handleInvite = async () => {
    if (!email.trim()) {
      showAlert('error', 'Erro', 'Por favor, informe um email válido');
      return;
    }

    setIsInviting(true);

    try {
      await inviteValidator({
        eventId: eventId as Id<"events">,
        email: email.trim(),
        userId: user?.id || ""
      });

      showAlert('success', 'Convite enviado', `Convite enviado para ${email}`);
      setEmail("");
    } catch (err: any) {
      showAlert('error', 'Erro', err.message || "Erro ao enviar convite");
    } finally {
      setIsInviting(false);
    }
  };

  const confirmRemoveValidator = (validatorId: Id<"ticketValidators">, validatorEmail: string) => {
    Alert.alert(
      "Remover validador",
      `Tem certeza que deseja remover ${validatorEmail} como validador deste evento?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: () => handleRemoveValidator(validatorId)
        }
      ]
    );
  };

  const handleRemoveValidator = async (validatorId: Id<"ticketValidators">) => {
    try {
      await removeValidator({
        validatorId,
        userId: user?.id || ""
      });

      showAlert('success', 'Validador removido', "O validador foi removido com sucesso.");
    } catch (err: any) {
      showAlert('error', 'Erro', err.message || "Erro ao remover validador");
    }
  };

  const handleOpenPermissions = (validator: any) => {
    setSelectedValidator(validator);
    setLocalPermissions({
      dayIds: (validator.allowedDayIds || []) as Id<"eventDays">[],
      lotIds: (validator.allowedLotIds || []) as Id<"ticketLots">[],
      ticketTypeIds: (validator.allowedTicketTypeIds || []) as Id<"ticketTypes">[]
    });
    setPermissionsModalVisible(true);
  };

  const togglePermission = (type: 'dayIds' | 'lotIds' | 'ticketTypeIds', id: any) => {
    setLocalPermissions(prev => {
      const current = prev[type];
      const exists = current.includes(id);
      if (exists) {
        return { ...prev, [type]: current.filter(i => i !== id) };
      } else {
        return { ...prev, [type]: [...current, id] };
      }
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedValidator || !user?.id) return;

    setIsUpdatingPermissions(true);
    try {
      const result = await updatePermissions({
        validatorId: selectedValidator._id,
        eventId: eventId as Id<"events">,
        userId: user.id,
        dayIds: localPermissions.dayIds,
        lotIds: localPermissions.lotIds,
        ticketTypeIds: localPermissions.ticketTypeIds
      });

      if (result.success) {
        setPermissionsModalVisible(false);
        showAlert('success', 'Sucesso', 'Permissões atualizadas com sucesso');
      } else {
        showAlert('error', 'Erro', result.message || 'Erro ao atualizar permissões');
      }
    } catch (err: any) {
      showAlert('error', 'Erro', err.message || 'Erro ao atualizar permissões');
    } finally {
      setIsUpdatingPermissions(false);
    }
  };

  const filteredLots = useMemo(() => {
    if (!daysAndLots?.lots) return [];
    if (localPermissions.dayIds.length === 0) return daysAndLots.lots;

    // Se tiver dias selecionados, filtramos os lotes que pertencem a esses dias
    // Note: This logic depends on whether lots are linked to days in the schema.
    // Based on the web code, it seems they might be. 
    // Let's check the ticketLots table schema if possible, or just show all for now.
    return daysAndLots.lots;
  }, [daysAndLots?.lots, localPermissions.dayIds]);

  const filteredTicketTypes = useMemo(() => {
    if (!allTicketTypes) return [];

    let filtered = allTicketTypes;

    if (localPermissions.dayIds.length > 0) {
      filtered = filtered.filter((tt: { dayId: any; }) => tt.dayId && localPermissions.dayIds.includes(tt.dayId as any));
    }

    if (localPermissions.lotIds.length > 0) {
      filtered = filtered.filter((tt: { lotId: any; }) => tt.lotId && localPermissions.lotIds.includes(tt.lotId as any));
    }

    return filtered;
  }, [allTicketTypes, localPermissions.dayIds, localPermissions.lotIds]);

  const renderValidatorStatus = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <View className="flex-row items-center px-3 py-1.5 bg-yellow-500/20 rounded-full">
            <IconSymbol name="clock" size={12} color="#F59E0B" />
            <Text className="text-yellow-500 text-xs ml-1.5 font-medium">Pendente</Text>
          </View>
        );
      case "accepted":
        return (
          <View className="flex-row items-center px-3 py-1.5 bg-green-500/20 rounded-full">
            <IconSymbol name="checkmark.circle" size={12} color="#10B981" />
            <Text className="text-green-500 text-xs ml-1.5 font-medium">Aceito</Text>
          </View>
        );
      case "rejected":
        return (
          <View className="flex-row items-center px-3 py-1.5 bg-red-500/20 rounded-full">
            <IconSymbol name="xmark.circle" size={12} color="#EF4444" />
            <Text className="text-red-500 text-xs ml-1.5 font-medium">Rejeitado</Text>
          </View>
        );
      default:
        return null;
    }
  };

  const handleCopyInviteLink = (token: string) => {
    const inviteLink = `https://ingressify.com.br/convite/${token}`;
    Clipboard.setString(inviteLink);

    showAlert(
      'success',
      'Link copiado!',
      'O link do convite foi copiado para a área de transferência.'
    );
  };

  // Responsividade para iPad/orientação
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 768;
  const maxContentWidth = isTablet ? (isLandscape ? 900 : 720) : undefined;
  const spacing = isTablet ? (isLandscape ? 20 : 24) : 16;

  const headerFont = isTablet ? (isLandscape ? 20 : 22) : 18;
  const sectionTitleFont = isTablet ? (isLandscape ? 16 : 18) : 14;
  const inputFont = isTablet ? (isLandscape ? 16 : 18) : 14;
  const buttonFont = isTablet ? (isLandscape ? 16 : 18) : 14;
  const cardPadding = isTablet ? (isLandscape ? 18 : 20) : 16;
  const listItemPadding = isTablet ? (isLandscape ? 14 : 16) : 12;
  const headerIconSize = isTablet ? (isLandscape ? 24 : 26) : 24;
  const iconSize = isTablet ? (isLandscape ? 18 : 20) : 16;

  if (!event || validators === undefined) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#E65CFF" />
        <Text className="text-white mt-4 font-medium" style={{ fontSize: sectionTitleFont }}>Carregando...</Text>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View
          className="flex-row items-center border-b border-backgroundCard"
          style={{ paddingHorizontal: spacing, paddingVertical: isTablet ? 14 : 12, alignSelf: 'center', width: '100%', maxWidth: maxContentWidth }}
        >
          <TouchableOpacity
            className="p-2 -ml-2"
            onPress={() => router.back()}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={1}
          >
            <IconSymbol name="arrow.left" size={headerIconSize} color="#E65CFF" />
          </TouchableOpacity>
          <Text className="text-white font-bold ml-2 flex-1" numberOfLines={1} style={{ fontSize: headerFont }}>
            Validadores - {event.name}
          </Text>
        </View>

        {/* Formulário para convidar validadores */}
        <View
          className="mx-4 mt-6 bg-backgroundCard rounded-xl shadow-lg"
          style={{ alignSelf: 'center', width: '100%', maxWidth: maxContentWidth, padding: cardPadding }}
        >
          <View className="flex-row items-center mb-4">
            <IconSymbol name="person.badge.plus" size={iconSize} color="#E65CFF" />
            <Text className="text-white font-semibold ml-2" style={{ fontSize: sectionTitleFont }}>
              Convidar Validador
            </Text>
          </View>

          <View className="flex-row items-center gap-3">
            <TextInput
              className="flex-1 bg-progressBar rounded-lg text-white"
              placeholder="Email do validador"
              placeholderTextColor="#A3A3A3"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={{
                fontSize: inputFont,
                paddingVertical: isTablet ? 14 : 12,
                paddingHorizontal: 16,
              }}
            />
            <TouchableOpacity
              className={`${isInviting ? 'bg-primary/70' : 'bg-primary'} rounded-lg justify-center items-center`}
              onPress={handleInvite}
              disabled={isInviting}
              style={{
                paddingVertical: isTablet ? 14 : 12,
                paddingHorizontal: isTablet ? 18 : 16,
                minWidth: isTablet ? 110 : 90,
              }}
              activeOpacity={1}
            >
              {isInviting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-semibold" style={{ fontSize: buttonFont }}>Convidar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Lista de validadores */}
        <View
          className="flex-1 mt-6"
          style={{ alignSelf: 'center', width: '100%', maxWidth: maxContentWidth, paddingHorizontal: spacing }}
        >
          <View className="flex-row items-center mb-4">
            <IconSymbol name="person.2" size={iconSize} color="#E65CFF" />
            <Text className="text-white font-semibold ml-2" style={{ fontSize: sectionTitleFont }}>
              Validadores ({validators.length})
            </Text>
          </View>

          {validators.length === 0 ? (
            <View
              className="bg-backgroundCard rounded-xl items-center justify-center"
              style={{ padding: isTablet ? 28 : 24 }}
            >
              <IconSymbol name="person.2" size={isTablet ? 56 : 48} color="#A3A3A3" />
              <Text className="text-textSecondary mt-3 font-medium" style={{ fontSize: sectionTitleFont }}>
                Nenhum validador convidado
              </Text>
              <Text className="text-textSecondary mt-1 text-center" style={{ fontSize: isTablet ? 14 : 12 }}>
                Convide validadores para ajudar na verificação dos ingressos
              </Text>
            </View>
          ) : (
            <FlatList
              data={validators}
              keyExtractor={(item) => item._id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: isTablet ? 24 : 16 }}
              renderItem={({ item }) => (
                <View
                  className="bg-backgroundCard rounded-xl mb-3 shadow-sm"
                  style={{ padding: listItemPadding }}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <Text className="text-white font-medium mb-2" style={{ fontSize: sectionTitleFont }}>
                        {item.email}
                      </Text>
                      {renderValidatorStatus(item.status)}
                    </View>
                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        className="bg-primary/10 rounded-lg"
                        onPress={() => handleOpenPermissions(item)}
                        style={{ padding: isTablet ? 10 : 8 }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        activeOpacity={1}
                      >
                        <IconSymbol name="slider.horizontal.3" size={iconSize} color="#E65CFF" />
                      </TouchableOpacity>
                      {item.status === "pending" && (
                        <TouchableOpacity
                          className="bg-primary/10 rounded-lg"
                          onPress={() => handleCopyInviteLink(item.inviteToken)}
                          style={{ padding: isTablet ? 10 : 8 }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          activeOpacity={1}
                        >
                          <IconSymbol name="doc.on.doc" size={iconSize} color="#E65CFF" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        className="bg-red-500/10 rounded-lg"
                        onPress={() => confirmRemoveValidator(item._id as Id<"ticketValidators">, item.email)}
                        style={{ padding: isTablet ? 10 : 8 }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        activeOpacity={1}
                      >
                        <IconSymbol name="trash" size={iconSize} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            />
          )}
        </View>

        <CustomAlert
          visible={alert.visible}
          type={alert.type}
          title={alert.title}
          message={alert.message}
          actions={alert.actions}
          onClose={() => setAlert({ ...alert, visible: false })}
        />

        {/* Modal de Permissões */}
        <Modal
          visible={permissionsModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setPermissionsModalVisible(false)}
        >
          <View className="flex-1 bg-black/60 justify-end">
            <View
              className="bg-background rounded-t-3xl overflow-hidden"
              style={{ height: height * 0.85 }}
            >
              {/* Modal Header */}
              <View className="flex-row items-center justify-between p-4 border-b border-white/10">
                <Text className="text-white font-bold text-lg">Permissões de Acesso</Text>
                <TouchableOpacity
                  onPress={() => setPermissionsModalVisible(false)}
                  className="p-2"
                  activeOpacity={1}
                >
                  <IconSymbol name="xmark" size={24} color="#A3A3A3" />
                </TouchableOpacity>
              </View>

              <ScrollView className="flex-1 p-4">
                <Text className="text-textSecondary mb-6 leading-5">
                  Configure quais dias, lotes e tipos de ingressos o validador
                  <Text className="text-white font-semibold"> {selectedValidator?.email} </Text>
                  poderá validar. Se nada for selecionado, ele terá acesso total.
                </Text>

                {/* Dias */}
                {daysAndLots?.days && daysAndLots.days.length > 0 && (
                  <View className="mb-6">
                    <Text className="text-primary text-xs font-bold uppercase mb-3">Dias</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {daysAndLots.days.map((day: any) => {
                        const isSelected = localPermissions.dayIds.includes(day._id);
                        return (
                          <TouchableOpacity
                            key={day._id}
                            onPress={() => togglePermission('dayIds', day._id)}
                            className={`px-4 py-2 rounded-full border ${isSelected
                              ? 'bg-primary border-primary'
                              : 'bg-backgroundCard border-white/10'
                              }`}
                            activeOpacity={1}
                          >
                            <Text className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-textSecondary'}`}>
                              {day.name || new Date(day.date).toLocaleDateString('pt-BR')}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Lotes */}
                {daysAndLots?.lots && daysAndLots.lots.length > 0 && (
                  <View className="mb-6">
                    <Text className="text-primary text-xs font-bold uppercase mb-3">Setores / Lotes</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {daysAndLots.lots.map((lot: any) => {
                        const isSelected = localPermissions.lotIds.includes(lot._id);
                        return (
                          <TouchableOpacity
                            key={lot._id}
                            onPress={() => togglePermission('lotIds', lot._id)}
                            className={`px-4 py-2 rounded-full border ${isSelected
                              ? 'bg-primary border-primary'
                              : 'bg-backgroundCard border-white/10'
                              }`}
                              activeOpacity={1}
                          >
                            <Text className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-textSecondary'}`}>
                              {lot.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Tipos de Ingressos */}
                {allTicketTypes && allTicketTypes.length > 0 && (
                  <View className="mb-8">
                    <Text className="text-primary text-xs font-bold uppercase mb-3">Tipos de Ingressos</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {allTicketTypes.map((type: any) => {
                        const isSelected = localPermissions.ticketTypeIds.includes(type._id);
                        return (
                          <TouchableOpacity
                            key={type._id}
                            onPress={() => togglePermission('ticketTypeIds', type._id)}
                            className={`px-4 py-2 rounded-full border ${isSelected
                              ? 'bg-primary border-primary'
                              : 'bg-backgroundCard border-white/10'
                              }`}
                              activeOpacity={1}
                          >
                            <Text className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-textSecondary'}`}>
                              {type.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Footer Actions */}
              <View className="p-4 border-t border-white/10 bg-backgroundCard">
                <TouchableOpacity
                  onPress={handleSavePermissions}
                  disabled={isUpdatingPermissions}
                  className="bg-primary h-14 rounded-xl justify-center items-center"
                >
                  {isUpdatingPermissions ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-base">Salvar Alterações</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}