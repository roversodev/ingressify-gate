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

  if (!event || validators === undefined) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#E65CFF" />
        <Text className="text-white mt-4 text-base font-medium">Carregando...</Text>
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
        <View className="flex-row items-center px-4 py-3 border-b border-backgroundCard">
          <TouchableOpacity 
            className="p-2 -ml-2" 
            onPress={() => router.back()}
          >
            <IconSymbol name="arrow.left" size={24} color="#E65CFF" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-bold ml-2 flex-1" numberOfLines={1}>
            Validadores - {event.name}
          </Text>
        </View>

        {/* Formulário para convidar validadores */}
        <View className="mx-4 mt-6 p-5 bg-backgroundCard rounded-xl shadow-lg">
          <View className="flex-row items-center mb-4">
            <IconSymbol name="person.badge.plus" size={20} color="#E65CFF" />
            <Text className="text-white text-base font-semibold ml-2">
              Convidar Validador
            </Text>
          </View>
          
          <View className="flex-row items-center gap-3">
            <TextInput
              className="flex-1 bg-progressBar rounded-lg px-4 py-3.5 text-white text-base"
              placeholder="Email do validador"
              placeholderTextColor="#A3A3A3"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity 
              className={`px-6 py-3.5 rounded-lg justify-center items-center min-w-[90px] ${
                isInviting ? 'bg-primary/70' : 'bg-primary'
              }`}
              onPress={handleInvite}
              disabled={isInviting}
            >
              {isInviting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-sm">Convidar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Lista de validadores */}
        <View className="flex-1 px-4 mt-6">
          <View className="flex-row items-center mb-4">
            <IconSymbol name="person.2" size={20} color="#E65CFF" />
            <Text className="text-white text-base font-semibold ml-2">
              Validadores ({validators.length})
            </Text>
          </View>
          
          {validators.length === 0 ? (
            <View className="bg-backgroundCard rounded-xl p-8 items-center justify-center">
              <IconSymbol name="person.2" size={48} color="#A3A3A3" />
              <Text className="text-textSecondary text-base mt-3 font-medium">
                Nenhum validador convidado
              </Text>
              <Text className="text-textSecondary text-sm mt-1 text-center">
                Convide validadores para ajudar na verificação dos ingressos
              </Text>
            </View>
          ) : (
            <FlatList
              data={validators}
              keyExtractor={(item) => item._id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View className="bg-backgroundCard rounded-xl p-4 mb-3 shadow-sm">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <Text className="text-white text-base font-medium mb-2">
                        {item.email}
                      </Text>
                      {renderValidatorStatus(item.status)}
                    </View>
                    <View className="flex-row items-center gap-2">
                      {item.status === "pending" && (
                        <TouchableOpacity 
                          className="p-2.5 bg-primary/10 rounded-lg"
                          onPress={() => handleCopyInviteLink(item.inviteToken)}
                        >
                          <IconSymbol name="doc.on.doc" size={18} color="#E65CFF" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity 
                        className="p-2.5 bg-red-500/10 rounded-lg"
                        onPress={() => confirmRemoveValidator(item._id as Id<"ticketValidators">, item.email)}
                      >
                        <IconSymbol name="trash" size={18} color="#EF4444" />
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