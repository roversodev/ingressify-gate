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
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

// Importe o componente CustomAlert
import CustomAlert from '@/components/CustomAlert';
import { IconSymbol } from '@/components/ui/IconSymbol';

export default function ValidatorsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { user } = useUser();

  const [email, setEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  
  // Estado para o alerta personalizado
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

  // Buscar detalhes do evento
  const event = useQuery(api.events.getById, { eventId: eventId as Id<"events"> });
  
  // Buscar validadores do evento
  const validators = useQuery(
    api.validators.getEventValidators, 
    user?.id ? { eventId: eventId as Id<"events">, userId: user.id } : "skip"
  );

  // Mutations para convidar e remover validadores
  const inviteValidator = useMutation(api.validators.inviteValidator);
  const removeValidator = useMutation(api.validators.removeValidator);

  // Função para mostrar alerta personalizado
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

  // Função para enviar convite
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

  // Função para confirmar e remover validador
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

  // Função para remover validador
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

  // Renderizar status do validador
  const renderValidatorStatus = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <View style={[styles.statusBadge, styles.pendingBadge]}>
            <IconSymbol name="clock" size={12} color="#F59E0B" />
            <Text style={styles.pendingText}>Pendente</Text>
          </View>
        );
      case "accepted":
        return (
          <View style={[styles.statusBadge, styles.acceptedBadge]}>
            <IconSymbol name="checkmark.circle" size={12} color="#10B981" />
            <Text style={styles.acceptedText}>Aceito</Text>
          </View>
        );
      case "rejected":
        return (
          <View style={[styles.statusBadge, styles.rejectedBadge]}>
            <IconSymbol name="xmark.circle" size={12} color="#EF4444" />
            <Text style={styles.rejectedText}>Rejeitado</Text>
          </View>
        );
      default:
        return null;
    }
  };

  // Função para copiar o link de convite
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
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E65CFF" />
        <Text style={styles.loadingText}>Carregando...</Text>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <IconSymbol name="chevron.left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Validadores - {event.name}</Text>
        </View>

        {/* Formulário para convidar validadores */}
        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>
            <IconSymbol name="person.badge.plus" size={18} color="#E65CFF" style={styles.sectionIcon} />
            Convidar Validador
          </Text>
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email do validador"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity 
              style={styles.inviteButton}
              onPress={handleInvite}
              disabled={isInviting}
            >
              {isInviting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.inviteButtonText}>Convidar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Lista de validadores */}
        <View style={styles.validatorsContainer}>
          <Text style={styles.sectionTitle}>
            <IconSymbol name="person.2" size={18} color="#E65CFF" style={styles.sectionIcon} />
            Validadores ({validators.length})
          </Text>
          
          {validators.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Nenhum validador convidado</Text>
            </View>
          ) : (
            <FlatList
              data={validators}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <View style={styles.validatorItem}>
                  <View style={styles.validatorInfo}>
                    <Text style={styles.validatorEmail}>{item.email}</Text>
                    {renderValidatorStatus(item.status)}
                  </View>
                  <View style={styles.actionButtons}>
                    {item.status === "pending" && (
                      <TouchableOpacity 
                        style={styles.copyButton}
                        onPress={() => handleCopyInviteLink(item.inviteToken)}
                      >
                        <IconSymbol name="doc.on.doc" size={18} color="#E65CFF" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                      style={styles.removeButton}
                      onPress={() => confirmRemoveValidator(item._id as Id<"ticketValidators">, item.email)}
                    >
                      <IconSymbol name="trash" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </View>

        {/* Alerta personalizado */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  formContainer: {
    padding: 16,
    backgroundColor: '#1E1E1E',
    margin: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIcon: {
    marginRight: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    marginRight: 8,
  },
  inviteButton: {
    backgroundColor: '#E65CFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  validatorsContainer: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    padding: 16,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
  },
  validatorItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  validatorInfo: {
    flex: 1,
  },
  validatorEmail: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  pendingBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  pendingText: {
    color: '#F59E0B',
    fontSize: 12,
    marginLeft: 4,
  },
  acceptedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  acceptedText: {
    color: '#10B981',
    fontSize: 12,
    marginLeft: 4,
  },
  rejectedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  rejectedText: {
    color: '#EF4444',
    fontSize: 12,
    marginLeft: 4,
  },
  removeButton: {
    padding: 8,
  },
  copyButton: {
    padding: 8,
    marginRight: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});