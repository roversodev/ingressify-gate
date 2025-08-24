import React, { useEffect, useState } from 'react';
import {
  Animated,
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

  // Definir cores com base no tipo usando Tailwind
  let borderColorClass;
  let statusDotColor;
  switch (type) {
    case 'success':
      borderColorClass = 'border-l-green-500';
      statusDotColor = '#4CAF50';
      break;
    case 'warning':
      borderColorClass = 'border-l-yellow-500';
      statusDotColor = '#FFB800';
      break;
    case 'error':
      borderColorClass = 'border-l-red-500';
      statusDotColor = '#FF4D4D';
      break;
    default:
      borderColorClass = 'border-l-primary';
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
          <View className="mt-2 ml-5">
            <View className="flex-row items-center mb-1">
              <Text className="text-gray-300 text-base font-bold">{tipoLabel}:</Text>
              <Text className="text-primary text-lg font-bold ml-1">{tipoValue.trim()}</Text>
            </View>
            <Text className="text-gray-300 text-base mt-1">{qtdPart}</Text>
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
            <View className="mt-2 ml-5">
              <View className="flex-row items-center mb-1">
                <Text className="text-gray-300 text-base font-bold">{tipoLabel}:</Text>
                <Text className="text-primary text-lg font-bold ml-1">{tipoValue.trim()}</Text>
              </View>
              <Text className="text-gray-300 text-base mt-1">{qtdPart}</Text>
            </View>
          );
        }
      }
    }
    
    // Caso não seja uma mensagem com tipo de ingresso, retorna o texto normal
    return <Text className="text-gray-300 text-base mt-1">{message}</Text>;
  };

  return (
    <Animated.View
      className="absolute inset-0 justify-center items-center z-50 bg-black/50"
      style={{
        opacity: fadeAnim,
      }}
    >
      <Animated.View
        className={`w-[90%] bg-backgroundCard rounded-lg border-l-4 ${borderColorClass} flex-row items-center shadow-2xl py-4 px-5`}
        style={{
          transform: [{ translateY: slideAnim }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <View className="flex-1">
          <View className="flex-row items-center mb-2">
            <Text 
              className="text-sm mr-2 font-bold"
              style={{ color: statusDotColor }}
            >
              ●
            </Text>
            <Text className="text-white text-lg font-bold">{title}</Text>
          </View>
          {formatMessage()}

          {actions.length > 0 && (
            <View className="flex-row justify-end mt-4">
              {actions.map((action, index) => (
                <TouchableOpacity
                  key={index}
                  className="bg-primary px-4 py-2 ml-2 rounded"
                  onPress={() => {
                    handleClose();
                    if (action.onPress) action.onPress();
                  }}
                >
                  <Text className="text-white font-bold text-base">{action.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity onPress={handleClose} className="p-1">
          <Text className="text-gray-400 text-xl font-bold">×</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

export default CustomAlert;