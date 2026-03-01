import { api } from '@/api';
import Header from '@/components/Header';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Funções de máscara
const formatCPF = (value: string) => {
  const numericValue = value.replace(/\D/g, "");
  if (numericValue.length <= 3) return numericValue;
  if (numericValue.length <= 6) return `${numericValue.slice(0, 3)}.${numericValue.slice(3)}`;
  if (numericValue.length <= 9) return `${numericValue.slice(0, 3)}.${numericValue.slice(3, 6)}.${numericValue.slice(6)}`;
  return `${numericValue.slice(0, 3)}.${numericValue.slice(3, 6)}.${numericValue.slice(6, 9)}-${numericValue.slice(9, 11)}`;
};

const formatPhone = (value: string) => {
  const numericValue = value.replace(/\D/g, "");
  if (numericValue.length <= 2) return numericValue;
  if (numericValue.length <= 7) return `(${numericValue.slice(0, 2)}) ${numericValue.slice(2)}`;
  return `(${numericValue.slice(0, 2)}) ${numericValue.slice(2, 7)}-${numericValue.slice(7, 11)}`;
};

export default function SettingsScreen() {
  // Hooks
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  
  // Estados do formulário
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState<Date | undefined>(undefined);
  const [gender, setGender] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Responsividade
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 768;
  
  // Consulta para verificar se o perfil está completo
  const profileStatus = useQuery(
    api.users.checkProfileComplete,
    user?.id ? { userId: user.id } : 'skip'
  );
  
  // Mutação para atualizar o perfil
  const updateProfile = useMutation(api.users.updateUserProfile);
  const excludeUser = useMutation(api.users.excludeUser);
  
  // Carregar dados do perfil
  useEffect(() => {
    if (user && profileStatus?.user) {
      setName(profileStatus.user.name || user.fullName || '');
      setEmail(profileStatus.user.email || user.primaryEmailAddress?.emailAddress || '');
      setPhone(profileStatus.user.phone || '');
      setCpf(profileStatus.user.cpf || '');
      if (profileStatus.user.birthDate) {
        setBirthDate(new Date(profileStatus.user.birthDate));
      }
      setGender(profileStatus.user.gender || '');
    } else if (user) {
      // Dados padrão do Clerk
      setName(user.fullName || '');
      setEmail(user.primaryEmailAddress?.emailAddress || '');
    }
  }, [profileStatus, user]);
  
  // Função para salvar o perfil
  const handleSaveProfile = async () => {
    if (!user?.id) return;
    
    // Validar campos obrigatórios
    if (!name || !email || !phone || !cpf || !birthDate || !gender) {
      const missingFields = [];
      if (!name) missingFields.push('Nome completo');
      if (!email) missingFields.push('E-mail');
      if (!phone) missingFields.push('Telefone');
      if (!cpf) missingFields.push('CPF');
      if (!birthDate) missingFields.push('Data de nascimento');
      if (!gender) missingFields.push('Gênero');
      
      Alert.alert(
        'Campos obrigatórios',
        `Por favor, preencha os seguintes campos: ${missingFields.join(', ')}.`
      );
      return;
    }
    
    // Validar CPF
    if (cpf.replace(/\D/g, '').length !== 11) {
      Alert.alert(
        'CPF inválido',
        'Por favor, insira um CPF válido com 11 dígitos.'
      );
      return;
    }
    
    try {
      setLoading(true);
      await updateProfile({
        userId: user.id,
        name,
        email,
        phone,
        cpf,
        birthDate: birthDate?.toISOString(),
        gender,
      });
      
      Alert.alert(
        'Perfil atualizado',
        'Seus dados foram salvos com sucesso!',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      Alert.alert(
        'Erro ao salvar',
        'Ocorreu um erro ao salvar seus dados. Tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Fluxo de exclusão de conta
  const handleDeleteAccount = () => {
    Alert.alert(
      'Excluir conta',
      'Tem certeza que deseja excluir sua conta permanentemente? Essa ação não pode ser desfeita e todos os seus dados serão perdidos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmação Final',
              'Para confirmar a exclusão, selecione "Excluir Minha Conta" abaixo. Esta é sua última chance de cancelar.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Excluir Minha Conta',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setIsDeleting(true);
                      await user?.delete?.();
                      await excludeUser({ userId: user?.id as string });
                    } catch (err) {
                      console.error('Erro ao excluir conta', err);
                      Alert.alert('Erro', 'Não foi possível excluir a conta. Tente novamente.');
                    } finally {
                      setIsDeleting(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };
  
  // Proteção de renderização
  if (!isLoaded || !isSignedIn || !user) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#E8B322" />
          <Text className="text-white mt-4">Carregando...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView className="flex-1 bg-background">
      <Header showLogo={false} />
      
      {/* Header com botão voltar */}
      <View className="flex-row items-center px-6 py-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4 p-2 rounded-full bg-backgroundCard"
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-white flex-1">
          Meu Perfil
        </Text>
      </View>
      
      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        {/* Descrição */}
        <View className="mb-6">
          <Text className="text-gray-400 text-base leading-6">
            Gerencie suas informações pessoais armazenadas na Ingressify. Estes dados são utilizados para facilitar suas compras e melhorar sua experiência na plataforma.
          </Text>
        </View>
        
        {/* Formulário */}
        <View className="bg-backgroundCard rounded-2xl p-6 mb-6">
          {/* Nome completo */}
          <View className="mb-4">
            <Text className="text-white font-medium mb-2">Nome completo</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Seu nome completo"
              placeholderTextColor="#9CA3AF"
              className="bg-[#1A1A1A] border border-[#444444] rounded-xl px-4 py-3 text-white"
              style={{ fontSize: isTablet ? 16 : 14 }}
            />
          </View>
          
          {/* E-mail */}
          <View className="mb-4">
            <Text className="text-white font-medium mb-2">E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              className="bg-[#1A1A1A] border border-[#444444] rounded-xl px-4 py-3 text-white"
              style={{ fontSize: isTablet ? 16 : 14 }}
            />
          </View>
          
          {/* CPF e Telefone */}
          <View className="flex-row gap-4 mb-4">
            <View className="flex-1">
              <Text className="text-white font-medium mb-2">CPF</Text>
              <TextInput
                value={cpf}
                onChangeText={(text) => setCpf(formatCPF(text))}
                placeholder="123.456.789-10"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                maxLength={14}
                className="bg-[#1A1A1A] border border-[#444444] rounded-xl px-4 py-3 text-white"
                style={{ fontSize: isTablet ? 16 : 14 }}
              />
            </View>
            
            <View className="flex-1">
              <Text className="text-white font-medium mb-2">Telefone</Text>
              <TextInput
                value={phone}
                onChangeText={(text) => setPhone(formatPhone(text))}
                placeholder="(11) 98765-4321"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                maxLength={15}
                className="bg-[#1A1A1A] border border-[#444444] rounded-xl px-4 py-3 text-white"
                style={{ fontSize: isTablet ? 16 : 14 }}
              />
            </View>
          </View>
          
          {/* Data de nascimento e Gênero */}
          <View className="flex-row gap-4 mb-4">
            <View className="flex-1">
              <Text className="text-white font-medium mb-2">Data de nascimento</Text>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                className="bg-[#1A1A1A] border border-[#444444] rounded-xl px-4 py-3 flex-row items-center justify-between"
              >
                <Text className={`${birthDate ? 'text-white' : 'text-gray-400'}`} style={{ fontSize: isTablet ? 16 : 14 }}>
                  {birthDate ? birthDate.toLocaleDateString('pt-BR') : 'Selecione a data'}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            
            <View className="flex-1">
              <Text className="text-white font-medium mb-2">Gênero</Text>
              <TouchableOpacity 
                style={styles.customSelect}
                onPress={() => setShowGenderPicker(true)}
              >
                <Text style={[styles.selectText, !gender && styles.placeholderText]}>
                  {gender ? 
                    (gender === 'male' ? 'Masculino' :
                     gender === 'female' ? 'Feminino' :
                     gender === 'other' ? 'Outro' :
                     gender === 'prefiro_nao_informar' ? 'Prefiro não informar' : 'Selecione')
                    : 'Selecione seu gênero'
                  }
                </Text>
                <Text style={styles.selectArrow} className='text-primary'>▼</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        
        {/* Botão Salvar */}
        <TouchableOpacity
          onPress={handleSaveProfile}
          disabled={loading}
          className={`rounded-2xl px-6 py-4 mb-8 ${
            loading ? 'bg-gray-600' : 'bg-primary active:bg-primary/80'
          }`}
          activeOpacity={0.8}
        >
          <View className="flex-row items-center justify-center">
            {loading && (
              <ActivityIndicator size="small" color="white" style={{ marginRight: 8 }} />
            )}
            <Text className="text-white font-semibold text-center" style={{ fontSize: isTablet ? 18 : 16 }}>
              {loading ? 'Salvando...' : 'Salvar informações'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Zona de Perigo - Excluir Conta */}
        <View className="mb-12 border-t border-gray-800 pt-8">
          <Text className="text-red-500 font-bold mb-2 text-lg">Zona de Perigo</Text>
          <Text className="text-gray-400 mb-4 text-sm">
            Ao excluir sua conta, todos os seus dados serão removidos permanentemente.
          </Text>
          <TouchableOpacity
            onPress={handleDeleteAccount}
            disabled={isDeleting}
            className="border border-red-900/50 bg-red-500/10 rounded-xl px-4 py-3"
            activeOpacity={0.7}
          >
             <View className="flex-row items-center justify-center">
               {isDeleting && (
                 <ActivityIndicator size="small" color="#ef4444" style={{ marginRight: 8 }} />
               )}
               <Text className="text-red-500 font-medium text-center">
                 {isDeleting ? 'Excluindo...' : 'Excluir minha conta'}
               </Text>
             </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      {/* Modal do Seletor de Gênero */}
      <Modal
        visible={showGenderPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowGenderPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.genderPickerModal}>
            <View style={styles.genderPickerHeader}>
              <Text style={styles.genderPickerTitle}>Selecione seu gênero</Text>
              <TouchableOpacity 
                onPress={() => setShowGenderPicker(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.genderOptions}>
              {[
                { label: 'Masculino', value: 'masculino' },
                { label: 'Feminino', value: 'feminino' },
                { label: 'Outro', value: 'outro' },
                { label: 'Prefiro não informar', value: 'prefiro_nao_informar' }
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.genderOption,
                    gender === option.value && styles.selectedGenderOption
                  ]}
                  onPress={() => {
                    setGender(option.value);
                    setShowGenderPicker(false);
                  }}
                >
                  <Text style={[
                    styles.genderOptionText,
                    gender === option.value && styles.selectedGenderOptionText
                  ]}>
                    {option.label}
                  </Text>
                  {gender === option.value && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
      
      {/* DatePicker Modal */}
      {showDatePicker && (
        <DateTimePicker
          value={birthDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          minimumDate={new Date(1900, 0, 1)}
          onChange={(event, selectedDate) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (selectedDate) {
              setBirthDate(selectedDate);
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  customSelect: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444444',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 50,
  },
  selectText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  placeholderText: {
    color: '#9CA3AF',
  },
  selectArrow: {
    fontSize: 12,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  genderPickerModal: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#333',
  },
  genderPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  genderPickerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  genderOptions: {
    padding: 8,
  },
  genderOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginVertical: 2,
    backgroundColor: 'transparent',
  },
  selectedGenderOption: {
    backgroundColor: '#E8B32220',
    borderWidth: 1,
    borderColor: '#E8B322',
  },
  genderOptionText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  selectedGenderOptionText: {
    color: '#E8B322',
    fontWeight: '600',
  },
  checkmark: {
    color: '#E8B322',
    fontSize: 16,
    fontWeight: 'bold',
  },
});