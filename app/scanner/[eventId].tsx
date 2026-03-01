import { api } from '@/api';
import { useUser } from '@clerk/clerk-expo';
import { useMutation, useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// Importe o componente CustomAlert
import CustomAlert from '@/components/CustomAlert';
import { useIsFocused } from '@react-navigation/native';
import { ErrorBoundary } from '../../components/ErrorBoundary';

// Adicionar esta função para mapear erros do backend para mensagens amigáveis na UI
function mapBackendErrorToUI(errorType?: string, defaultMessage?: string) {
  // Valores padrão
  let title = 'Erro';
  let message = defaultMessage || 'Ocorreu um erro ao validar o ingresso.';

  // Mapear tipos de erro para mensagens amigáveis
  switch (errorType) {
    case 'ALREADY_USED':
      title = '⚠️ INGRESSO JÁ UTILIZADO';
      message = defaultMessage || 'Este ingresso já foi utilizado anteriormente.';
      break;
    case 'EVENT_MISMATCH':
      title = '❌ EVENTO INCORRETO';
      message = defaultMessage || 'Este ingresso não pertence a este evento.';
      break;
    case 'REFUNDED':
      title = '❌ INGRESSO REEMBOLSADO';
      message = defaultMessage || 'Este ingresso foi reembolsado e não é mais válido.';
      break;
    case 'CANCELLED':
      title = '❌ INGRESSO CANCELADO';
      message = defaultMessage || 'Este ingresso foi cancelado e não é mais válido.';
      break;
    case 'TICKET_NOT_FOUND':
      title = '❌ INGRESSO NÃO ENCONTRADO';
      message = defaultMessage || 'Não foi possível encontrar este ingresso.';
      break;
    case 'TRANSFERRED':
      title = '❌ INGRESSO TRANSFERIDO';
      message = defaultMessage || 'Este ingresso foi transferido e não é mais válido.';
      break;
    case 'INTERNAL_ERROR':
      title = '❌ ERRO INTERNO';
      message = defaultMessage || 'Ocorreu um erro interno. Tente novamente mais tarde.';
      break;
    default:
      if (errorType) {
        title = `❌ ${errorType.replace(/_/g, ' ')}`;
      }
  }

  return { title, message };
}

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
  
  // NOVO: Estado para controlar se a câmera deve ser pausada
  const [cameraActive, setCameraActive] = useState(true);

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

  const isFocused = useIsFocused();

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 768;
  const minSide = Math.min(width, height);

  // Tamanho do quadrado de leitura proporcional ao menor lado da tela
  const scanSize = isTablet
    ? Math.round(Math.min(minSide * 0.6, 420))
    : Math.round(Math.min(Math.max(minSide * 0.55, 220), 320));

  // Tamanhos de fontes e espaçamentos em iPad
  const headerTitleFont = isTablet ? 22 : 18;
  const backFont = isTablet ? 18 : 16;
  const availabilityFont = isTablet ? 16 : 12;
  const scanTextFont = isTablet ? (isLandscape ? 14 : 18) : 16;
  const bottomOffset = isTablet ? (isLandscape ? 24 : 80) : (isLandscape ? 24 : 50);

  const searchButtonStyle = React.useMemo(
    () => ({
      paddingHorizontal: isTablet ? 28 : 20,
      paddingVertical: isTablet ? 14 : 10,
      borderRadius: isTablet ? 12 : 8,
    }),
    [isTablet]
  );
  const buttonTextFont = isTablet ? 18 : 16;

  // NOVO: Normaliza o eventId e evita queries com param inválido
  const safeEventId = React.useMemo(() => {
    if (Array.isArray(eventId)) return eventId[0];
    return typeof eventId === 'string' && eventId.length > 0 ? eventId : undefined;
  }, [eventId]);

  // Ajuste: só dispara as queries quando safeEventId existir
  const event = useQuery(
    api.events.getById,
    safeEventId ? { eventId: safeEventId as Id<"events"> } : "skip"
  );
  const validateTicket = useMutation(api.tickets.validateTicket);
  const availability = useQuery(
    api.events.getEventAvailability,
    safeEventId ? { eventId: safeEventId as Id<"events"> } : "skip"
  );

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Função para mostrar alerta personalizado - ATUALIZADA
  const showAlert = (
    type: 'success' | 'warning' | 'error' | 'info',
    title: string,
    message: string,
    actions: Array<{ text: string; onPress: () => void }> = []
  ) => {
    // Pausar a câmera quando mostrar o alerta
    setCameraActive(false);
    
    // Modificar as ações para reativar a câmera
    const modifiedActions = actions.map(action => ({
      ...action,
      onPress: () => {
        action.onPress();
        // Reativar a câmera após fechar o alerta
        setTimeout(() => setCameraActive(true), 100);
      }
    }));

    setAlert({
      visible: true,
      type,
      title,
      message,
      actions: modifiedActions.length > 0 ? modifiedActions : [{
        text: 'OK',
        onPress: () => {
          setScanned(false);
          setIsValidating(false);
          lastScannedRef.current = '';
          // Reativar a câmera após fechar o alerta
          setTimeout(() => setCameraActive(true), 100);
        }
      }]
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

  // NOVO: Se o eventId não chegou, mostra um fallback seguro
  if (!safeEventId) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <Text className="text-white text-base mb-4">
          Não foi possível identificar o evento. Volte e tente novamente.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.button}>
          <Text style={styles.textButton}>Voltar</Text>
        </TouchableOpacity>
      </SafeAreaView>
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

    // NOVO: Garantia extra de que o eventId está válido antes de continuar
    if (!safeEventId) {
      const ui = mapBackendErrorToUI("EVENT_NOT_FOUND", "Não foi possível identificar o evento. Volte e tente novamente.");
      showAlert(
        'error',
        ui.title,
        ui.message,
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
        const ui = mapBackendErrorToUI("TICKET_NOT_FOUND", "Este QR code não contém informações válidas de ingresso.");
        showAlert(
          'error',
          ui.title,
          ui.message,
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
        eventId: safeEventId as Id<"events">,
        userId: user?.id ?? ''
      });

      // Sempre verificar o resultado estruturado, não depender de exceções
      if (result && result.success) {
        showAlert(
          'success',
          '✅ ENTRADA LIBERADA',
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
        // Usar a função mapBackendErrorToUI para obter título e mensagem formatados
        const ui = mapBackendErrorToUI(result?.errorType, result?.message);
        
        // Determinar o tipo de alerta baseado no errorType
        let alertType = 'error';
        if (result?.errorType === 'ALREADY_USED') {
          alertType = 'warning';
        }

        showAlert(
          alertType as 'success' | 'warning' | 'error' | 'info',
          ui.title,
          ui.message,
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

      // Usar a função mapBackendErrorToUI para tratar erros de exceção
      let errorType = "INTERNAL_ERROR";
      let errorMessage = 'Falha de comunicação com o servidor. Tente novamente.';

      // Tentar extrair informações específicas do erro
      if (error?.message) {
        if (error.message.includes('Este ingresso não pertence a este evento')) {
          errorType = "EVENT_MISMATCH";
        } else if (error.message.includes('Ingresso já foi utilizado')) {
          errorType = "ALREADY_USED";
        } else if (error.message.includes('Ingresso reembolsado')) {
          errorType = "REFUNDED";
        } else if (error.message.includes('Ingresso cancelado')) {
          errorType = "CANCELLED";
        } else if (error.message.includes('Ingresso não encontrado')) {
          errorType = "TICKET_NOT_FOUND";
        }
        
        // Se temos uma mensagem de erro específica, usá-la
        if (!error.message.includes('server error')) {
          errorMessage = error.message;
        }
      }

      const ui = mapBackendErrorToUI(errorType, errorMessage);
      
      showAlert(
        errorType === "ALREADY_USED" ? 'warning' : 'error',
        ui.title,
        ui.message,
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
    <ErrorBoundary>
      <SafeAreaView className='flex-1 bg-background'>
        <CustomAlert
          visible={alert.visible}
          type={alert.type}
          title={alert.title}
          message={alert.message}
          actions={alert.actions}
          onClose={() => {
            setAlert(prev => ({ ...prev, visible: false }));
            // Reativar a câmera quando fechar o alerta
            setTimeout(() => setCameraActive(true), 100);
          }}
        />

        <View className='bg-background flex-row items-center py-4 px-3'>
          <TouchableOpacity onPress={() => router.back()} className='mr-4'>
            <Text className='text-primary text-[16px]' style={{ fontSize: backFont }}>← Voltar</Text>
          </TouchableOpacity>
          <Text className='text-white text-[18px] font-semibold flex-1' style={{ fontSize: headerTitleFont }}>
            {event?.name ? `${event.name}` : 'Scanner QR Code'}
          </Text>
          {event && availability && (
            <View className="bg-backgroundCard px-3 py-1 rounded-full mr-2">
              <Text className="text-primary text-sm font-bold" style={{ fontSize: availabilityFont }}>
                {availability.validatedTickets}/{availability.purchasedTickets}
              </Text>
            </View>
          )}
        </View>

        {/* Container relativo para sobrepor UI por cima da câmera */}
        <View style={styles.cameraContainer}>
          {/* ATUALIZADO: usar cameraActive em vez de apenas isFocused */}
          {isFocused && cameraActive && (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing={facing}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
            />
          )}

          {/* NOVO: Mostrar fundo preto quando a câmera está pausada */}
          {(!isFocused || !cameraActive) && (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000' }]} />
          )}

          {/* Overlay */}
          <View style={styles.overlay}>
            <View style={[styles.scanArea, { width: scanSize, height: scanSize }]}>
              <Text style={[styles.scanText, { fontSize: scanTextFont }]}>
                {isValidating ? 'Validando ingresso...' : 'Posicione o QR code dentro da área'}
              </Text>
            </View>
          </View>

          {/* Controles */}
          <View style={[styles.buttonContainer, { bottom: bottomOffset }]}>
            <TouchableOpacity
              style={[styles.searchButton, { marginTop: 12 }, searchButtonStyle]}
              onPress={() => router.push(`/scanner/search?eventId=${safeEventId}`)}
            >
              <Text style={[styles.flipButtonText, { fontSize: buttonTextFont }]}>Buscar por Email/CPF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </ErrorBoundary>
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
  // NOVO: container relativo da câmera para permitir overlay absoluto
  cameraContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
  },
  // Ajustado: overlay absoluto sobre a câmera
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
