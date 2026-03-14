import { api } from '@/api';
import { clampInt, expiresAt, remainingMs, shouldUseCache } from '@/services/scannerPending';
import { useUser } from '@clerk/clerk-expo';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { type GenericId as Id } from "convex/values";
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// Importe o componente CustomAlert
import CustomAlert from '@/components/CustomAlert';
import { IconSymbol } from '@/components/ui/IconSymbol';
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
  const convex = useConvex();
  const [facing, setFacing] = useState<CameraType>('back');
  const [scanned, setScanned] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScannedRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);
  const { user } = useUser();
  
  // NOVO: Estado para controlar se a câmera deve ser pausada
  const [cameraActive, setCameraActive] = useState(true);
  const [pendingVisible, setPendingVisible] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<any>(null);
  const [pendingExpiresAt, setPendingExpiresAt] = useState<number | null>(null);
  const [pendingRemainingMs, setPendingRemainingMs] = useState<number>(0);
  const [pendingReadAll, setPendingReadAll] = useState(false);
  const [pendingQuantity, setPendingQuantity] = useState(1);
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmProgressAnim = useRef(new Animated.Value(0)).current;
  const previewCacheRef = useRef<Map<string, { at: number; preview: any }>>(new Map());

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
  const confirmScan = useMutation((api as any).tickets.confirmScan);
  const availability = useQuery(
    api.events.getEventAvailability,
    safeEventId ? { eventId: safeEventId as Id<"events"> } : "skip"
  );

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!pendingVisible || !pendingExpiresAt) return;
    const id = setInterval(() => {
      const next = remainingMs(pendingExpiresAt, Date.now());
      setPendingRemainingMs(next);
      const ms = next;
      if (ms <= 0) {
        setPendingVisible(false);
        setPendingPreview(null);
        setPendingExpiresAt(null);
        setPendingReadAll(false);
        setPendingQuantity(1);
        setScanned(false);
        setIsValidating(false);
        lastScannedRef.current = '';
        setCameraActive(true);
      }
    }, 120);
    return () => clearInterval(id);
  }, [pendingVisible, pendingExpiresAt]);

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

  const closePending = (resumeCamera: boolean) => {
    setPendingVisible(false);
    setPendingPreview(null);
    setPendingExpiresAt(null);
    setPendingReadAll(false);
    setPendingQuantity(1);
    setIsConfirming(false);
    confirmProgressAnim.setValue(0);
    setScanned(false);
    setIsValidating(false);
    lastScannedRef.current = '';
    if (resumeCamera) {
      setTimeout(() => setCameraActive(true), 80);
    }
  };

  const handleConfirmPending = async () => {
    if (!pendingPreview) return;
    if (isConfirming) return;

    setIsConfirming(true);
    confirmProgressAnim.setValue(0);
    Animated.timing(confirmProgressAnim, {
      toValue: 1,
      duration: 650,
      useNativeDriver: false,
    }).start();

    try {
      const mode = pendingPreview.mode;
      const readAllSameType = mode !== 'passport' && pendingReadAll === true;
      const quantityToRedeem = mode === 'passport' ? 1 : clampInt(pendingQuantity, 1, 50);

      const result = await confirmScan({
        ticketId: pendingPreview.ticket._id,
        eventId: safeEventId as Id<"events">,
        userId: user?.id ?? "",
        quantity: readAllSameType ? 1 : quantityToRedeem,
        readAllSameType,
      });

      if (result && result.success) {
        const total = result.totalRedeemed ?? 1;
        const ticketTypeName = pendingPreview?.ticketType?.name ?? '—';
        const dayName =
          (pendingPreview as any)?.day?.name ||
          (pendingPreview as any)?.day?.label ||
          ((pendingPreview as any)?.day?.date ? new Date((pendingPreview as any).day.date).toLocaleDateString('pt-BR') : null);
        const sectorName =
          (pendingPreview as any)?.ticketType?.sector?.name ||
          (pendingPreview as any)?.ticketType?.sectorName ||
          (pendingPreview as any)?.ticketType?.sector ||
          null;
        const lotName = (pendingPreview as any)?.lot?.name || null;

        const alertMessage = [
          `Tipo: ${ticketTypeName}`,
          dayName ? `Dia: ${dayName}` : null,
          sectorName ? `Setor: ${sectorName}` : lotName ? `Setor/Lote: ${lotName}` : null,
          total > 1 ? `Validados: ${total}` : 'Validado: 1',
        ]
          .filter(Boolean)
          .join('\n');

        showAlert(
          'success',
          '✅ LEITURA CONFIRMADA',
          alertMessage,
          [
            {
              text: 'Continuar',
              onPress: () => {
                closePending(true);
              }
            }
          ]
        );
        setPendingVisible(false);
        return;
      }

      const ui = mapBackendErrorToUI(result?.errorType, result?.message);
      showAlert(
        result?.errorType === 'ALREADY_USED' ? 'warning' : 'error',
        ui.title,
        ui.message,
        [
          {
            text: 'OK',
            onPress: () => {
              closePending(true);
            }
          }
        ]
      );
      setPendingVisible(false);
    } catch (error: any) {
      const ui = mapBackendErrorToUI("INTERNAL_ERROR", error?.message || 'Falha de comunicação com o servidor.');
      showAlert('error', ui.title, ui.message, [
        {
          text: 'OK',
          onPress: () => {
            closePending(true);
          }
        }
      ]);
      setPendingVisible(false);
    } finally {
      setIsConfirming(false);
      confirmProgressAnim.setValue(0);
    }
  };



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

      const cacheKey = String(ticketData.ticketId);
      const cached = previewCacheRef.current.get(cacheKey);
      const canUseCache = cached ? shouldUseCache(cached.at, Date.now(), 15000) : false;

      const preview = canUseCache
        ? cached!.preview
        : await convex.query((api as any).tickets.previewScan, {
            ticketId: ticketData.ticketId,
            eventId: safeEventId as Id<"events">,
            userId: user?.id ?? "",
          });

      previewCacheRef.current.set(cacheKey, { at: Date.now(), preview });

      if (!preview || !preview.success) {
        const ui = mapBackendErrorToUI(preview?.errorType, preview?.message);
        const alertType = preview?.errorType === 'ALREADY_USED' ? 'warning' : 'error';
        showAlert(alertType as 'success' | 'warning' | 'error' | 'info', ui.title, ui.message, [
          {
            text: 'OK',
            onPress: () => {
              setScanned(false);
              setIsValidating(false);
              lastScannedRef.current = '';
            }
          }
        ]);
        return;
      }

      setPendingPreview(preview);
      setPendingVisible(true);
      setPendingExpiresAt(expiresAt(Date.now(), 30000));
      setPendingRemainingMs(30000);
      setPendingReadAll(false);
      setPendingQuantity(1);
      setCameraActive(false);
      setIsValidating(false);
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

        <Modal
          visible={pendingVisible}
          transparent
          animationType="fade"
          onRequestClose={() => closePending(true)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
            <View className="bg-background rounded-t-3xl px-5 pt-5 pb-6 border-t border-white/10">
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center">
                  <View className="w-9 h-9 rounded-xl items-center justify-center bg-primary/15 mr-3">
                    <IconSymbol name="qrcode.viewfinder" size={18} color="#E65CFF" />
                  </View>
                  <View>
                    <Text className="text-white font-bold text-lg">Leitura pendente</Text>
                    <Text className="text-textSecondary text-sm">
                      Confirme em {Math.max(0, Math.ceil(pendingRemainingMs / 1000))}s
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => closePending(true)} className="p-2">
                  <IconSymbol name="xmark" size={18} color="#A3A3A3" />
                </TouchableOpacity>
              </View>

              <View className="bg-backgroundCard rounded-2xl p-4 border border-white/5 mb-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-textSecondary text-sm">Tipo</Text>
                  <Text className="text-white font-semibold text-sm" numberOfLines={1}>
                    {pendingPreview?.ticketType?.name || '—'}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between mt-2">
                  <Text className="text-textSecondary text-sm">Titular</Text>
                  <Text className="text-white font-semibold text-sm" numberOfLines={1}>
                    {pendingPreview?.holder?.name || pendingPreview?.holder?.email || '—'}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between mt-2">
                  <Text className="text-textSecondary text-sm">Status</Text>
                  <Text className="text-white font-semibold text-sm" numberOfLines={1}>
                    {pendingPreview?.ticket?.status || '—'}
                  </Text>
                </View>

                {pendingPreview?.mode === 'passport' ? (
                  <View className="flex-row items-center justify-between mt-2">
                    <Text className="text-textSecondary text-sm">Usos restantes</Text>
                    <Text className="text-white font-semibold text-sm">
                      {pendingPreview?.remainingUses ?? '—'}
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row items-center justify-between mt-2">
                    <Text className="text-textSecondary text-sm">Restante</Text>
                    <Text className="text-white font-semibold text-sm">
                      {'—'}
                    </Text>
                  </View>
                )}
              </View>

              {pendingPreview?.mode !== 'passport' && pendingPreview?.sameTypeRemaining > 1 && (
                <TouchableOpacity
                  onPress={() => setPendingReadAll(prev => !prev)}
                  activeOpacity={0.8}
                  className="bg-backgroundCard rounded-2xl p-4 border border-white/5 mb-4 flex-row items-center justify-between"
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-white font-semibold text-base">Ler todos deste tipo</Text>
                    <Text className="text-textSecondary text-sm mt-1">
                      Até {Math.min(50, pendingPreview?.sameTypeRemaining || 0)} ingressos
                    </Text>
                  </View>
                  <View className={`w-10 h-6 rounded-full p-1 ${pendingReadAll ? 'bg-primary' : 'bg-white/10'}`}>
                    <View className={`w-4 h-4 rounded-full ${pendingReadAll ? 'bg-white ml-auto' : 'bg-white/50'}`} />
                  </View>
                </TouchableOpacity>
              )}

              {isConfirming && (
                <View className="mb-4">
                  <View className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <Animated.View
                      style={{
                        height: '100%',
                        width: confirmProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                        backgroundColor: '#E65CFF',
                      }}
                    />
                  </View>
                  <Text className="text-textSecondary text-xs mt-2 text-center">Confirmando…</Text>
                </View>
              )}

              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => closePending(true)}
                  activeOpacity={0.85}
                  className="flex-1 h-14 rounded-2xl items-center justify-center bg-backgroundCard border border-white/5"
                  disabled={isConfirming}
                >
                  <Text className="text-white font-bold text-base">Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirmPending}
                  activeOpacity={0.85}
                  className={`flex-1 h-14 rounded-2xl items-center justify-center ${isConfirming ? 'bg-primary/60' : 'bg-primary'}`}
                >
                  {isConfirming ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-bold text-base">Confirmar leitura</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
