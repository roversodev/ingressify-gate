import { api } from '@/api';
import { useUser } from '@clerk/clerk-expo';
import { useMutation, useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

// Importe o componente CustomAlert
import CustomAlert from '@/components/CustomAlert';
import { IconSymbol } from '@/components/ui/IconSymbol.ios';

export default function ScannerScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const [facing, setFacing] = useState<CameraType>('back');
  const [scanned, setScanned] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScannedRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);
  const { user } = useUser();

  // Estado para o alerta personalizado - MOVIDO PARA O TOPO
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
  const validateTicket = useMutation(api.tickets.validateTicket);
  // Mova esta consulta para cá
  const availability = useQuery(api.events.getEventAvailability, {
    eventId: eventId as Id<"events">,
  });

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Função para mostrar alerta personalizado - DEFINIDA APÓS TODOS OS HOOKS
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

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Precisamos de acesso à câmera para escanear QR codes</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.button}>
          <Text style={styles.textButton}>Permitir Acesso à Câmera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarcodeScanned = async ({ type, data }: { type: string; data: string }) => {
    // Verificar se já está processando ou se é o mesmo QR code recente
    const now = Date.now();
    const timeSinceLastScan = now - lastScannedTimeRef.current;

    if (scanned || isValidating) {
      return;
    }

    // Prevenir escaneamento do mesmo código em menos de 3 segundos
    if (data === lastScannedRef.current && timeSinceLastScan < 3000) {
      return;
    }


    // Atualizar referências
    lastScannedRef.current = data;
    lastScannedTimeRef.current = now;

    setScanned(true);
    setIsValidating(true);

    try {
      // Tentar fazer parse do QR code como JSON
      let ticketData;
      try {
        ticketData = JSON.parse(data);
      } catch {
        // Se não for JSON, tratar como ID simples
        ticketData = { ticketId: data };
      }

      // Validar se tem os dados necessários
      if (!ticketData.ticketId) {
        showAlert(
          'error',
          'QR Code Inválido',
          'Este QR code não contém informações válidas de ingresso.',
          [{
            text: 'OK',
            onPress: () => {
              setScanned(false);
              setIsValidating(false);
              lastScannedRef.current = '';
            }
          }]
        );
        return;
      }

      // Chamar a função de validação no Convex
      const result = await validateTicket({
        ticketId: ticketData.ticketId,
        eventId: eventId as Id<"events">,
        userId: user?.id ?? ''
      });
  
      // Sempre verificar o resultado estruturado, não depender de exceções
      if (result && result.success) {
        showAlert(
          'success',
          'Ingresso Válido',
          `Tipo: ${result.ticketType?.name || 'N/A'} | Qtd: ${result.ticket?.quantity || 1}`,
          [
            {
              text: 'Continuar',
              onPress: () => {
                setScanned(false);
                setIsValidating(false);
                lastScannedRef.current = '';
              }
            },
          ]
        );
      } else {
        // Tratar casos de insucesso baseado no resultado estruturado
        let alertTitle = 'Ingresso Inválido';
        let alertMessage = 'Este ingresso não é válido para este evento.';
        let alertType = 'error';
  
        // Usar o resultado estruturado em vez de mensagens de erro
        if (result && result.ticket) {
          switch (result.ticket.status) {
            case 'used':
              alertTitle = 'Ingresso Já Utilizado';
              alertMessage = 'Este ingresso já foi utilizado anteriormente.';
              alertType = 'warning';
              break;
            case 'refunded':
              alertTitle = 'Ingresso Reembolsado';
              alertMessage = 'Este ingresso foi reembolsado e não é mais válido.';
              break;
            case 'cancelled':
              alertTitle = 'Ingresso Cancelado';
              alertMessage = 'Este ingresso foi cancelado.';
              break;
            default:
              // Verificar se é evento incorreto
              if (result.event && result.event._id !== eventId) {
                alertTitle = 'Evento Incorreto';
                alertMessage = 'Este ingresso não pertence a este evento.';
              }
              break;
          }
        } else if (result && result.errorType) {
          // Usar errorType se disponível
          switch (result.errorType) {
            case 'TICKET_NOT_FOUND':
              alertTitle = 'Ingresso Não Encontrado';
              alertMessage = 'Este ingresso não foi encontrado no sistema.';
              break;
            case 'EVENT_MISMATCH':
              alertTitle = 'Evento Incorreto';
              alertMessage = 'Este ingresso não pertence a este evento.';
              break;
            case 'ALREADY_USED':
              alertTitle = 'Ingresso Já Utilizado';
              alertMessage = 'Este ingresso já foi utilizado anteriormente.';
              alertType = 'warning';
              break;
            case 'INVALID_STATUS':
              alertTitle = 'Status Inválido';
              alertMessage = 'Este ingresso não pode ser validado devido ao seu status atual.';
              break;
            default:
              alertTitle = 'Erro de Validação';
              alertMessage = result.message || 'Não foi possível validar o ingresso.';
              break;
          }
        }
  
        showAlert(
          alertType as 'success' | 'warning' | 'error' | 'info',
          alertTitle,
          alertMessage,
          [{
            text: 'OK',
            onPress: () => {
              setScanned(false);
              setIsValidating(false);
              lastScannedRef.current = '';
            }
          }]
        );
      }
    } catch (error: any) {
      console.error('Erro ao validar ingresso:', error);
  
      // Tratamento simplificado para server errors
      let errorMessage = 'Oops! Algo deu errado. Tente novamente em alguns segundos.';
      let errorTitle = 'Erro Temporário';
      
      // Se não for um server error genérico, tentar extrair informações específicas
      if (error?.message && !error.message.includes('server error')) {
        if (error.message.includes('Este ingresso não pertence a este evento')) {
          errorTitle = 'Evento Incorreto';
          errorMessage = 'Este ingresso não pertence a este evento.';
        } else if (error.message.includes('Ingresso já foi utilizado')) {
          errorTitle = 'Ingresso Já Utilizado';
          errorMessage = 'Este ingresso já foi utilizado anteriormente.';
        } else if (error.message.includes('Ingresso reembolsado')) {
          errorTitle = 'Ingresso Reembolsado';
          errorMessage = 'Este ingresso foi reembolsado e não é mais válido.';
        } else if (error.message.includes('Ingresso cancelado')) {
          errorTitle = 'Ingresso Cancelado';
          errorMessage = 'Este ingresso foi cancelado.';
        } else {
          errorMessage = 'Não foi possível validar o ingresso. Verifique se o ingresso está válido e tente novamente.';
          errorTitle = 'Erro de Validação';
        }
      }
  
      showAlert(
        'error',
        errorTitle,
        errorMessage,
        [{
          text: 'OK',
          onPress: () => {
            setScanned(false);
            setIsValidating(false);
            lastScannedRef.current = '';
          }
        }]
      );
    }
  };

  const isEventOwner = () => {
    return event?.userId === user?.id;
  };

  return (
    <SafeAreaView className='flex-1 bg-background'>
      <CustomAlert
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        actions={alert.actions}
        onClose={() => setAlert(prev => ({ ...prev, visible: false }))}
      />

      <View className='bg-background flex-row items-center py-4 px-3'>
        <TouchableOpacity onPress={() => router.back()} className='mr-4'>
          <Text className='text-primary text-[16px]'>← Voltar</Text>
        </TouchableOpacity>
        <Text className='text-white text-[18px] font-semibold flex-1'>
          {event?.name ? `${event.name}` : 'Scanner QR Code'}
        </Text>
        {event && availability && (
          <View className="bg-backgroundCard px-3 py-1 rounded-full mr-2">
            <Text className="text-primary text-sm font-bold">
              {availability.validatedTickets}/{availability.purchasedTickets}
            </Text>
          </View>
        )}
        {isEventOwner() && (
          <TouchableOpacity
            onPress={() => router.push(`/scanner/validators?eventId=${eventId}`)}
            style={styles.validatorsButton}
          >
            <IconSymbol name="person.2" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.listsButton}
          onPress={() => router.push(`/scanner/lists?eventId=${eventId}`)}
        >
          <IconSymbol size={20} color="#FFFFFF" name={'list.bullet'} />
        </TouchableOpacity>
      </View>

      <CameraView
        style={styles.camera}
        facing={facing}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'pdf417'],
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <Text style={styles.scanText}>
              {isValidating ? 'Validando ingresso...' : 'Posicione o QR code dentro da área'}
            </Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>

          <TouchableOpacity
            style={[styles.searchButton, { marginTop: 12 }]}
            onPress={() => router.push(`/scanner/search?eventId=${eventId}`)}
          >
            <Text style={styles.flipButtonText}>Buscar por Email/CPF</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
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
    backgroundColor: '#232323', // bg-card
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
  message: {
    textAlign: 'center',
    paddingBottom: 10,
    fontSize: 16,
    color: '#FFFFFF',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#E65CFF', // text-destaque
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scanText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 32,
  },
  loadingIndicator: {
    marginTop: 20,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#E65CFF', // bg-destaque
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonDisabled: {
    backgroundColor: 'rgba(230, 92, 255, 0.3)', // bg-destaque com opacidade
  },
  text: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  flipButton: {
    backgroundColor: '#E65CFF', // bg-destaque
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  flipButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  textButton: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  searchButton: {
    backgroundColor: '#E65CFF', // bg-destaque
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  validatorsButton: {
    backgroundColor: '#E65CFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  listsButton: {
    backgroundColor: '#E65CFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
});
