import { api } from '@/api';
import { useUser } from '@clerk/clerk-expo';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View
} from 'react-native';
import { IconSymbol } from './ui/IconSymbol';

interface ValidatorInviteModalProps {
  invitation: {
    _id: string;
    eventId: string;
    email: string;
    status: string;
    createdAt: number;
    acceptedAt?: number;
    expiresAt?: number;
    inviteToken: string;
    event: {
      _id: string;
      name: string;
    };
    invitedBy: {
      userId: string;
      name: string;
      email?: string;
    };
  };
  visible: boolean;
  onClose: () => void;
}

export default function ValidatorInviteModal({ invitation, visible, onClose }: ValidatorInviteModalProps) {
  const router = useRouter();
  const { user } = useUser();
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const acceptInvitation = useMutation(api.validators.acceptInvitation);
  
  // Responsividade
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 768;
  const isLandscape = width > height;
  
  const modalWidth = isTablet ? (isLandscape ? 500 : 400) : width * 0.9;
  const titleFont = isTablet ? 22 : 18;
  const textFont = isTablet ? 16 : 14;
  const buttonFont = isTablet ? 16 : 14;

  const handleAccept = async () => {
    setIsAccepting(true);
    setError(null);
    
    try {
      const userEmail = user?.emailAddresses[0]?.emailAddress;
      if (!userEmail) {
        throw new Error("Não foi possível obter seu email. Por favor, tente novamente.");
      }
      
      const result = await acceptInvitation({ 
        token: invitation.inviteToken, 
        userEmail, 
        userId: user?.id || '' 
      });
      
      setSuccess(true);
      
    } catch (err: any) {
      const userEmail = user?.emailAddresses[0]?.emailAddress;
      if (err.message && err.message.includes("enviado para outro email")) {
        setError(`Este convite foi enviado para outro email, não para ${userEmail}. Por favor, faça login com o email correto.`);
      } else {
        setError(err.message || "Erro ao aceitar convite");
      }
    } finally {
      setIsAccepting(false);
    }
  };
  
  const handleClose = () => {
    setError(null);
    setSuccess(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-black/50 justify-center items-center px-4">
        <View 
          className="bg-backgroundCard rounded-xl shadow-lg"
          style={{ width: modalWidth, maxHeight: height * 0.8 }}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View className="p-6 border-b border-gray-700">
              <View className="flex-row items-center justify-between">
                <Text className="text-white font-bold flex-1" style={{ fontSize: titleFont }}>
                  {success ? "Convite Aceito!" : "Convite para Validar Ingressos"}
                </Text>
                <TouchableOpacity 
                  onPress={handleClose}
                  className="p-2 -mr-2"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <IconSymbol name="xmark" size={20} color="#666" />
                </TouchableOpacity>
              </View>
              <Text className="text-gray-400 mt-2" style={{ fontSize: textFont }}>
                {success
                  ? "Você agora é um validador de ingressos para este evento."
                  : "Você foi convidado para validar ingressos de um evento."}
              </Text>
            </View>

            {/* Content */}
            <View className="p-6">
              {error && (
                <View className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-4">
                  <Text className="text-red-400" style={{ fontSize: textFont }}>
                    {error}
                  </Text>
                </View>
              )}
              
              {success ? (
                <View>
                  <View className="items-center mb-6">
                    <View className="w-16 h-16 bg-green-500/20 rounded-full items-center justify-center mb-4">
                      <IconSymbol name="checkmark.circle.fill" size={32} color="#10B981" />
                    </View>
                  </View>
                  
                  <View className="bg-gray-800/50 rounded-lg p-4 mb-4">
                    <Text className="text-white font-bold mb-3" style={{ fontSize: titleFont }}>
                      {invitation.event.name}
                    </Text>
                    
                    <View className="flex-row items-center mb-2">
                      <IconSymbol name="person.fill" size={16} color="#E8B322" />
                      <Text className="text-gray-300 ml-2" style={{ fontSize: textFont }}>
                        Convidado por: {invitation.invitedBy.name}
                      </Text>
                    </View>
                  </View>
                  
                  <Text className="text-center text-gray-400 mt-4" style={{ fontSize: textFont }}>
                    Convite aceito com sucesso!
                  </Text>
                </View>
              ) : (
                <View>
                  {/* Detalhes do evento */}
                  <View className="bg-gray-800/50 rounded-lg p-4 mb-4">
                    <Text className="text-white font-bold mb-3" style={{ fontSize: titleFont }}>
                      {invitation.event.name}
                    </Text>
                    
                    <View className="flex-row items-center mb-2">
                      <IconSymbol name="person.fill" size={16} color="#E8B322" />
                      <Text className="text-gray-300 ml-2" style={{ fontSize: textFont }}>
                        Convidado por: {invitation.invitedBy.name}
                      </Text>
                    </View>
                    
                    <View className="flex-row items-center">
                      <IconSymbol name="envelope" size={16} color="#E8B322" />
                      <Text className="text-gray-300 ml-2" style={{ fontSize: textFont }}>
                        {invitation.email}
                      </Text>
                    </View>
                  </View>
                  
                  <Text className="text-gray-300 mb-4" style={{ fontSize: textFont }}>
                    Ao aceitar este convite, você poderá validar ingressos para o evento usando o leitor de QR Code.
                  </Text>
                  <Text className="text-gray-400 text-sm" style={{ fontSize: textFont - 2 }}>
                    Apenas você pode aceitá-lo.
                  </Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View className="p-6 pt-0">
              {!success && (
                <View className="flex-row gap-3">
                  <TouchableOpacity 
                    className="flex-1 bg-gray-600 py-3 rounded-lg"
                    onPress={handleClose}
                  >
                    <Text className="text-white text-center font-semibold" style={{ fontSize: buttonFont }}>
                      Recusar
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    className={`flex-1 py-3 rounded-lg ${isAccepting ? 'bg-primary/70' : 'bg-primary'}`}
                    onPress={handleAccept}
                    disabled={isAccepting}
                  >
                    {isAccepting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text className="text-white text-center font-semibold" style={{ fontSize: buttonFont }}>
                        Aceitar Convite
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              
              {success && (
                <TouchableOpacity 
                  className="bg-primary py-3 rounded-lg flex-row items-center justify-center"
                  onPress={() => {
                    onClose();
                    router.push(`/scanner/${invitation.eventId}`);
                  }}
                >
                  <IconSymbol name="qrcode" size={16} color="#fff" />
                  <Text className="text-white font-semibold ml-2" style={{ fontSize: buttonFont }}>
                    Ir para Validação
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}