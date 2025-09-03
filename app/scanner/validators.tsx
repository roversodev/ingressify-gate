import { api } from '@/api';
import { useUser } from '@clerk/clerk-expo';
import { useMutation, useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import CustomAlert from '@/components/CustomAlert';
import { IconSymbol } from '@/components/ui/IconSymbol';

export default function ValidatorsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { user } = useUser();

  const [email, setEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  
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

  const inviteValidator = useMutation(api.validators.inviteValidator);
  const removeValidator = useMutation(api.validators.removeValidator);

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
                      {item.status === "pending" && (
                        <TouchableOpacity 
                          className="bg-primary/10 rounded-lg"
                          onPress={() => handleCopyInviteLink(item.inviteToken)}
                          style={{ padding: isTablet ? 10 : 8 }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <IconSymbol name="doc.on.doc" size={iconSize} color="#E65CFF" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity 
                        className="bg-red-500/10 rounded-lg"
                        onPress={() => confirmRemoveValidator(item._id as Id<"ticketValidators">, item.email)}
                        style={{ padding: isTablet ? 10 : 8 }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}