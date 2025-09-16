import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type AlertAction = {
  text: string;
  onPress: () => void;
};

type CustomAlertProps = {
  visible: boolean;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
  onClose: () => void;
  actions?: AlertAction[];
};

const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  type,
  title,
  message,
  onClose,
  actions = [],
}) => {
  // Usando useRef para as animações para evitar re-renderizações
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-20)).current;
  
  // Referência para o timer de auto-fechamento
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Referência para controlar se o componente está montado
  const isMountedRef = useRef(true);
  
  // Função para limpar o timer
  const clearAutoCloseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Função para fechar o alerta com animação
  const handleClose = useCallback(() => {
    clearAutoCloseTimer();
    
    // Animações de saída
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -20,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (isMountedRef.current && onClose) {
        onClose();
      }
    });
  }, [fadeAnim, slideAnim, onClose, clearAutoCloseTimer]);

  // Lidar com o botão de voltar no Android
  useEffect(() => {
    if (Platform.OS === 'android' && visible) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        handleClose();
        return true;
      });

      return () => backHandler.remove();
    }
  }, [visible, handleClose]);

  // Efeito para animações quando a visibilidade muda
  useEffect(() => {
    if (visible) {
      // Limpar qualquer timer existente
      clearAutoCloseTimer();
      
      // Resetar valores de animação
      fadeAnim.setValue(0);
      slideAnim.setValue(-20);
      
      // Iniciar animações de entrada
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

    }
  }, [visible, fadeAnim, slideAnim, actions.length, clearAutoCloseTimer, handleClose]);

  // Limpar timer e marcar componente como desmontado quando o componente é desmontado
  useEffect(() => {
    return () => {
      clearAutoCloseTimer();
      isMountedRef.current = false;
    };
  }, [clearAutoCloseTimer]);



  // Se não estiver visível, não renderize nada
  if (!visible) return null;

  // Definir cores com base no tipo
  let borderColor;
  let statusDotColor;
  switch (type) {
    case 'success':
      borderColor = '#4CAF50';
      statusDotColor = '#4CAF50';
      break;
    case 'warning':
      borderColor = '#FFB800';
      statusDotColor = '#FFB800';
      break;
    case 'error':
      borderColor = '#FF4D4D';
      statusDotColor = '#FF4D4D';
      break;
    default:
      borderColor = '#E65CFF';
      statusDotColor = '#E65CFF';
  }

  // Função para destacar o tipo de ingresso na mensagem
  const formatMessage = () => {
    if (!message) return null;
    
    // Verificar se a mensagem contém informações sobre o tipo de ingresso
    if (message.includes('Tipo:')) {
      const parts = message.split('|');
      
      if (parts.length > 1) {
        // Formato: "Tipo: X | Qtd: Y"
        const tipoPart = parts[0].trim();
        const qtdPart = parts[1].trim();
        
        const [tipoLabel, tipoValue] = tipoPart.split(':');
        
        return (
          <View style={styles.messageContainer}>
            <View style={styles.tipoRow}>
              <Text style={styles.tipoLabel}>{tipoLabel}:</Text>
              <Text style={styles.tipoValue}>{tipoValue.trim()}</Text>
            </View>
          </View>
        );
      } else {
        // Formato: "Tipo: X\nQuantidade: Y"
        const lines = message.split('\n');
        if (lines.length > 1) {
          const tipoPart = lines[0];
          const qtdPart = lines.slice(1).join('\n');
          
          const [tipoLabel, tipoValue] = tipoPart.split(':');
          
          return (
            <View style={styles.messageContainer}>
              <View style={styles.tipoRow}>
                <Text style={styles.tipoLabel}>{tipoLabel}:</Text>
                <Text style={styles.tipoValue}>{tipoValue.trim()}</Text>
              </View>
              <Text style={styles.messageText}>{qtdPart}</Text>
            </View>
          );
        }
      }
    }
    
    // Caso não seja uma mensagem com tipo de ingresso, retorna o texto normal
    return <Text style={styles.messageText}>{message}</Text>;
  };

  const { width, height } = Dimensions.get('window');

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      <Animated.View 
        style={[
          StyleSheet.absoluteFill, 
          styles.backdrop,
          { opacity: fadeAnim }
        ]}
      />
      <Animated.View
        style={[
          styles.alertContainer,
          { 
            borderLeftColor: borderColor,
            transform: [{ translateY: slideAnim }],
            width: width * 0.9,
          }
        ]}
      >
        <View style={styles.contentContainer}>
          <View style={styles.titleRow}>
            <Text style={[styles.statusDot, { color: statusDotColor }]}>●</Text>
            <Text style={styles.titleText}>{title}</Text>
          </View>
          {formatMessage()}

          {actions.length > 0 && (
            <View style={styles.actionsContainer}>
              {actions.map((action, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.actionButton}
                  onPress={() => {
                    handleClose();
                    if (action.onPress) action.onPress();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionButtonText}>{action.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity 
          onPress={handleClose} 
          style={styles.closeButton}
          activeOpacity={0.7}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Text style={styles.closeButtonText}>×</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 10,
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1,
  },
  alertContainer: {
    backgroundColor: '#232323', // bg-backgroundCard
    borderRadius: 8,
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 2,
  },
  contentContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    fontSize: 12,
    marginRight: 8,
    fontWeight: 'bold',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  messageContainer: {
    marginTop: 8,
    marginLeft: 20,
  },
  tipoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  tipoLabel: {
    color: '#AAAAAA',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tipoValue: {
    color: '#E65CFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  messageText: {
    color: '#AAAAAA',
    fontSize: 16,
    marginTop: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  actionButton: {
    backgroundColor: '#E65CFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginLeft: 8,
    borderRadius: 4,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    color: '#666666',
    fontSize: 24,
    fontWeight: 'bold',
  },
});

export default CustomAlert;