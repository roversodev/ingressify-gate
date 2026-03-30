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
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CourtesyScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { width } = useWindowDimensions();

  // Estados do formulário
  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isSending, setIsSending] = useState(false);
  const [selectedType, setSelectedType] = useState<any>(null);

  // Estado do Alerta
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

  // Queries e Mutations
  const event = useQuery(api.events.getById, { eventId: eventId as Id<"events"> });
  const ticketTypesForCourtesy = useQuery(api.ticketTypes.getEventTicketTypesForCourtesy, { eventId: eventId as Id<"events"> });
  const generateCourtesy = useMutation(api.events.generateCourtesyTickets);
  
  const checkUserExists = useQuery(
    api.users.checkUserExistsByEmail,
    (email && email.includes('@') && email.includes('.')) ? { email: email.trim() } : "skip"
  );

  const isUserValid = checkUserExists?.exists === true;
  // Lista completa: cortesias em destaque; todos podem ser usados para envio
  const allTicketTypes = ticketTypesForCourtesy ?? [];
  const courtesyTypes = allTicketTypes.filter((t: { isCourtesy?: boolean }) => t.isCourtesy);

  const showAlert = useCallback((type: 'success' | 'warning' | 'error' | 'info', title: string, message: string) => {
    setAlert({ visible: true, type, title, message });
  }, []);

  const handleSendCourtesy = async () => {
    if (!email.trim() || !isUserValid) {
      showAlert('warning', 'Usuário inválido', 'Por favor, insira um e-mail de um usuário cadastrado.');
      return;
    }
    if (!selectedType) {
      showAlert('warning', 'Selecione o ingresso', 'Por favor, escolha um tipo de cortesia.');
      return;
    }

    setIsSending(true);
    try {
      await generateCourtesy({
        eventId: eventId as Id<"events">,
        userEmail: email.trim(),
        quantity: quantity,
        generatedBy: user?.id || "",
        ticketTypeId: selectedType?._id || undefined,
      });

      showAlert('success', 'Sucesso!', `Enviado ${quantity} cortesia(s) para ${email}`);
      setEmail("");
      setQuantity(1);
      setSelectedType(null);
    } catch (err: any) {
      showAlert('error', 'Erro ao enviar', err.message || 'Ocorreu um erro inesperado.');
    } finally {
      setIsSending(false);
    }
  };

  if (!event || ticketTypesForCourtesy === undefined) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#E65CFF" />
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
        <View className="px-6 py-4 flex-row items-center border-b border-white/5">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <IconSymbol name="arrow.left" size={24} color="#E65CFF" />
          </TouchableOpacity>
          <Text className="text-white font-bold text-lg ml-2">Nova Cortesia</Text>
        </View>

        <ScrollView 
          className="flex-1" 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        >
          {/* Card Principal de Destinatário */}
          <View className="bg-backgroundCard rounded-3xl p-6 border border-white/5 mb-6 shadow-sm">
            <Text className="text-textSecondary text-[10px] font-bold uppercase mb-4 tracking-widest">Destinatário</Text>
            
            <View className="flex-row items-center bg-background p-4 rounded-2xl border border-white/10">
              <IconSymbol name="envelope" size={18} color="#555" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="email@exemplo.com"
                placeholderTextColor="#444"
                className="flex-1 ml-3 text-white text-base"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {email.length > 5 && checkUserExists !== undefined && (
              <View className="flex-row items-center mt-3 ml-1">
                <IconSymbol 
                  name={isUserValid ? "checkmark.circle.fill" : "xmark.circle.fill"} 
                  size={14} 
                  color={isUserValid ? "#10b981" : "#ef4444"} 
                />
                <Text className={`text-xs ml-2 font-medium ${isUserValid ? 'text-green-500/80' : 'text-red-500/80'}`}>
                  {isUserValid ? `✓ ${checkUserExists.user?.name}` : "✗ Usuário não cadastrado"}
                </Text>
              </View>
            )}
          </View>

          {/* Seleção de Ingresso — todos os tipos (cortesia em destaque) */}
          <View className="mb-6">
            <Text className="text-textSecondary text-[10px] font-bold uppercase mb-4 ml-2 tracking-widest">Tipo de Cortesia</Text>
            <View className="gap-3">
              {allTicketTypes.map((type: { _id: string; name: string; isCourtesy?: boolean; dayName?: string | null; lotName?: string | null }) => {
                const isCourtesy = type.isCourtesy === true;
                const isSelected = selectedType?._id === type._id;
                return (
                  <TouchableOpacity
                    key={type._id}
                    onPress={() => setSelectedType(type)}
                    className={`p-4 rounded-2xl border flex-row items-center justify-between ${isSelected ? 'bg-primary/10 border-primary' : isCourtesy ? 'bg-primary/5 border-primary/40' : 'bg-backgroundCard border-white/5'}`}
                    activeOpacity={1}
                  >
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center flex-wrap gap-2">
                        <View className={`w-8 h-8 rounded-lg items-center justify-center ${isSelected ? 'bg-primary/20' : isCourtesy ? 'bg-primary/15' : 'bg-white/5'}`}>
                          <IconSymbol name="calendar" size={16} color={isSelected ? '#E65CFF' : isCourtesy ? '#E65CFF' : '#444'} />
                        </View>
                        <Text className={`font-bold text-sm flex-shrink-0 ${isSelected ? 'text-primary' : isCourtesy ? 'text-primary' : 'text-white'}`}>
                          {type.name}
                        </Text>
                        {isCourtesy && (
                          <View className="bg-primary/20 px-2 py-0.5 rounded-full">
                            <Text className="text-primary text-[10px] font-bold uppercase">Cortesia</Text>
                          </View>
                        )}
                      </View>
                      {(type.dayName || type.lotName) && (
                        <View className="flex-row flex-wrap gap-x-3 mt-1.5 ml-10">
                          {type.dayName && (
                            <Text className="text-textSecondary text-xs">Dia: {type.dayName}</Text>
                          )}
                          {type.lotName && (
                            <Text className="text-textSecondary text-xs">Setor/Lote: {type.lotName}</Text>
                          )}
                        </View>
                      )}
                    </View>
                    {isSelected && (
                      <IconSymbol name="checkmark.circle.fill" size={20} color="#E65CFF" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Controle de Quantidade */}
          <View className="bg-backgroundCard rounded-3xl p-6 border border-white/5 mb-8 flex-row items-center justify-between">
            <View>
              <Text className="text-textSecondary text-[10px] font-bold uppercase mb-1 tracking-widest">Quantidade</Text>
              <Text className="text-white font-bold text-lg">{quantity}x</Text>
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

          {/* Botão de Envio */}
          <TouchableOpacity
            onPress={handleSendCourtesy}
            disabled={isSending || !isUserValid || !selectedType}
            className={`h-16 rounded-2xl items-center justify-center shadow-xl ${isSending || !isUserValid || !selectedType ? 'bg-white/5 opacity-50' : 'bg-primary shadow-primary/20'}`}
          >
            {isSending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Enviar Ingressos</Text>
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