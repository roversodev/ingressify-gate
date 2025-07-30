import React, { useEffect, useState } from 'react';
import {
  Animated,
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
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(-20));

  useEffect(() => {
    if (visible) {
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

      // Auto-fechar após 3 segundos se não houver ações personalizadas
      if (actions.length === 0) {
        const timer = setTimeout(() => {
          handleClose();
        }, 3000);

        return () => clearTimeout(timer);
      }
    }
  }, [visible]);

  const handleClose = () => {
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
      if (onClose) onClose();
    });
  };

  if (!visible) return null;

  // Definir cores com base no tipo
  let borderColor;
  let statusDot;
  switch (type) {
    case 'success':
      borderColor = '#4CAF50';
      statusDot = '●';
      break;
    case 'warning':
      borderColor = '#FFB800';
      statusDot = '●';
      break;
    case 'error':
      borderColor = '#FF4D4D';
      statusDot = '●';
      break;
    default:
      borderColor = '#E65CFF';
      statusDot = '●';
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
            <View style={styles.ticketTypeContainer}>
              <Text style={styles.ticketTypeLabel}>{tipoLabel}:</Text>
              <Text style={styles.ticketTypeValue}>{tipoValue.trim()}</Text>
            </View>
            <Text style={styles.alertMessage}>{qtdPart}</Text>
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
              <View style={styles.ticketTypeContainer}>
                <Text style={styles.ticketTypeLabel}>{tipoLabel}:</Text>
                <Text style={styles.ticketTypeValue}>{tipoValue.trim()}</Text>
              </View>
              <Text style={styles.alertMessage}>{qtdPart}</Text>
            </View>
          );
        }
      }
    }
    
    // Caso não seja uma mensagem com tipo de ingresso, retorna o texto normal
    return <Text style={styles.alertMessage}>{message}</Text>;
  };

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: fadeAnim,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.alertContainer,
          {
            transform: [{ translateY: slideAnim }],
            borderLeftColor: borderColor,
          },
        ]}
      >
        <View style={styles.alertContent}>
          <View style={styles.titleRow}>
            <Text style={[styles.statusDot, { color: borderColor }]}>{statusDot}</Text>
            <Text style={styles.alertTitle}>{title}</Text>
          </View>
          {formatMessage()}

          {actions.length > 0 && (
            <View style={styles.alertActions}>
              {actions.map((action, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.alertActionButton}
                  onPress={() => {
                    handleClose();
                    if (action.onPress) action.onPress();
                  }}
                >
                  <Text style={styles.alertActionText}>{action.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity onPress={handleClose} style={styles.alertCloseButton}>
          <Text style={styles.alertCloseText}>×</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
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
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  alertContainer: {
    width: '90%', // Aumentado de 85% para 90%
    backgroundColor: '#181818',
    borderRadius: 8,
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    paddingVertical: 16, // Aumentado de 12 para 16
    paddingHorizontal: 20, // Aumentado de 16 para 20
  },
  alertContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8, // Aumentado de 4 para 8
  },
  statusDot: {
    fontSize: 14, // Aumentado de 12 para 14
    marginRight: 8,
  },
  alertTitle: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 18, // Aumentado de 16 para 18
  },
  messageContainer: {
    marginTop: 8,
    marginLeft: 20,
  },
  ticketTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  ticketTypeLabel: {
    color: '#CCCCCC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  ticketTypeValue: {
    color: '#E65CFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  alertMessage: {
    color: '#CCCCCC',
    fontSize: 16, // Aumentado de 14 para 16
    marginTop: 4,
  },
  alertCloseButton: {
    padding: 4,
  },
  alertCloseText: {
    color: '#999999',
    fontSize: 20, // Aumentado de 18 para 20
    fontWeight: 'bold',
  },
  alertActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16, // Aumentado de 12 para 16
  },
  alertActionButton: {
    paddingHorizontal: 16, // Aumentado de 12 para 16
    paddingVertical: 8, // Aumentado de 6 para 8
    marginLeft: 8,
    backgroundColor: '#E65CFF',
    borderRadius: 4,
  },
  alertActionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16, // Aumentado de 14 para 16
  },
});

export default CustomAlert;