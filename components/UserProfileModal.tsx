import { api } from '@/api';
import { useUser } from '@clerk/clerk-expo';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQuery } from 'convex/react';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

// Hook de toast adaptado para React Native
const useToast = () => {
  const toast = ({ title, description, variant }: any) => {
    Alert.alert(title, description);
  };
  return { toast };
};

export default function UserProfileModal() {
  const { user } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  
  // Estados para os campos do formulário
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState<Date | undefined>(undefined);
  const [gender, setGender] = useState("");
  
  // Estados para validação de CPF
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [isCpfValid, setIsCpfValid] = useState(false);
  const [cpfTypingTimeout, setCpfTypingTimeout] = useState<number | null>(null);
  
  // Consulta para verificar se o perfil está completo
  const profileStatus = useQuery(
    api.users.checkProfileComplete,
    user?.id ? { userId: user.id } : "skip"
  );
  
  // Consultas para validação de CPF
  const cpfValidation = useQuery(
    api.users.validateCpf,
    cpf.length >= 11 ? { cpf } : "skip"
  );
  
  const cpfExistsCheck = useQuery(
    api.users.checkCpfExists,
    cpf.length >= 11 ? { cpf, userId: user?.id } : "skip"
  );
  
  // Mutação para atualizar o perfil
  const updateProfile = useMutation(api.users.updateUserProfile);

  // Formatar CPF enquanto digita
  const formatCPF = (value: string) => {
    const numericValue = value.replace(/\D/g, "");
    if (numericValue.length <= 3) return numericValue;
    if (numericValue.length <= 6) return `${numericValue.slice(0, 3)}.${numericValue.slice(3)}`;
    if (numericValue.length <= 9) return `${numericValue.slice(0, 3)}.${numericValue.slice(3, 6)}.${numericValue.slice(6)}`;
    return `${numericValue.slice(0, 3)}.${numericValue.slice(3, 6)}.${numericValue.slice(6, 9)}-${numericValue.slice(9, 11)}`;
  };

  // Formatar telefone enquanto digita
  const formatPhone = (value: string) => {
    const numericValue = value.replace(/\D/g, "");
    if (numericValue.length <= 2) return numericValue;
    if (numericValue.length <= 7) return `(${numericValue.slice(0, 2)}) ${numericValue.slice(2)}`;
    return `(${numericValue.slice(0, 2)}) ${numericValue.slice(2, 7)}-${numericValue.slice(7, 11)}`;
  };

  // Verificar se o perfil está completo e abrir o modal se necessário
  useEffect(() => {
    
    if (user) {
      // Lógica principal: verificar via query do Convex
      if (profileStatus !== undefined) {
        if (!profileStatus.complete) {
          
          // Preencher os campos com os dados existentes
          if (profileStatus.user) {
            setName(profileStatus.user.name || user.fullName || "");
            setEmail(profileStatus.user.email || user.primaryEmailAddress?.emailAddress || "");
            setPhone(profileStatus.user.phone || "");
            setCpf(profileStatus.user.cpf || "");
            if (profileStatus.user.birthDate) {
              setBirthDate(new Date(profileStatus.user.birthDate));
            }
            setGender(profileStatus.user.gender || "");
          } else {
            // Preencher com dados do Clerk se não houver dados do usuário
            setName(user.fullName || "");
            setEmail(user.primaryEmailAddress?.emailAddress || "");
          }
          setOpen(true);
        }
      } else {
        
        // Verificar se o usuário tem dados básicos preenchidos
        const hasBasicData = user.fullName && user.primaryEmailAddress?.emailAddress;
        
        if (!hasBasicData) {
          setName(user.fullName || "");
          setEmail(user.primaryEmailAddress?.emailAddress || "");
          setOpen(true);
        }
      }
    }
  }, [profileStatus, user, open]);

  // Efeito para validar CPF quando ele muda
  useEffect(() => {
    // Limpar o timeout anterior se existir
    if (cpfTypingTimeout) {
      clearTimeout(cpfTypingTimeout);
    }
    
    // Resetar estado de erro se o campo estiver vazio
    if (!cpf) {
      setCpfError(null);
      setIsCpfValid(false);
      return;
    }
    
    // Definir um novo timeout para validar após o usuário parar de digitar
    const timeout = setTimeout(() => {
      // Verificar se o CPF tem pelo menos 11 dígitos numéricos
      const cleanCpf = cpf.replace(/\D/g, "");
      if (cleanCpf.length !== 11) {
        setCpfError("CPF deve conter 11 dígitos");
        setIsCpfValid(false);
        return;
      }
      
      // Se temos resultados de validação e verificação de existência
      if (cpfValidation && cpfExistsCheck) {
        if (!cpfValidation.valid) {
          setCpfError(cpfValidation.message);
          setIsCpfValid(false);
        } else if (cpfExistsCheck.exists) {
          setCpfError(cpfExistsCheck.message);
          setIsCpfValid(false);
        } else {
          setCpfError(null);
          setIsCpfValid(true);
        }
      }
    }, 500); // 500ms de delay após parar de digitar
    
    setCpfTypingTimeout(timeout);
    
    // Limpar o timeout quando o componente for desmontado
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [cpf, cpfValidation, cpfExistsCheck]);

  // Função para salvar o perfil
  const handleSaveProfile = async () => {
    if (!user?.id) return;
    
    // Validar campos obrigatórios
    if (!name || !email || !phone || !cpf || !birthDate || !gender) {
      // Exibir mensagens específicas para cada campo faltante
      const missingFields = [];
      if (!name) missingFields.push("Nome completo");
      if (!email) missingFields.push("E-mail");
      if (!phone) missingFields.push("Telefone");
      if (!cpf) missingFields.push("CPF");
      if (!birthDate) missingFields.push("Data de nascimento");
      if (!gender) missingFields.push("Gênero");
      
      toast({
        title: "Campos obrigatórios",
        description: `Por favor, preencha os seguintes campos: ${missingFields.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }
    
    // Verificar se o CPF é válido
    if (!isCpfValid) {
      toast({
        title: "CPF inválido",
        description: cpfError || "Por favor, insira um CPF válido.",
        variant: "destructive",
      });
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
      
      toast({
        title: "Perfil atualizado",
        description: "Seus dados foram salvos com sucesso!",
      });
      
      setOpen(false);
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      toast({
        title: "Erro ao salvar",
        description: "Ocorreu um erro ao salvar seus dados. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Função para lidar com a mudança de data
  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setBirthDate(selectedDate);
    }
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        // Não permitir fechar o modal se o perfil não estiver completo
        if (profileStatus?.complete) {
          setOpen(false);
        }
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Text style={styles.title}>Complete seu perfil</Text>
              <Text style={styles.description}>
                Precisamos de algumas informações adicionais para melhorar sua experiência na plataforma.
              </Text>
            </View>
            
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nome completo</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Seu nome completo"
                  placeholderTextColor="#888"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>E-mail</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="seu@email.com"
                  placeholderTextColor="#888"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.label}>CPF</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={[
                        styles.input,
                        cpfError ? styles.inputError : isCpfValid && cpf ? styles.inputSuccess : {}
                      ]}
                      value={cpf}
                      onChangeText={(text) => setCpf(formatCPF(text))}
                      placeholder="123.456.789-10"
                      placeholderTextColor="#888"
                      maxLength={14}
                      keyboardType="numeric"
                    />
                    {cpf && (
                      <View style={styles.validationIcon}>
                        <Text style={isCpfValid ? styles.successIcon : styles.errorIcon}>
                          {isCpfValid ? '✓' : '✗'}
                        </Text>
                      </View>
                    )}
                  </View>
                  {cpfError && <Text style={styles.errorText}>{cpfError}</Text>}
                </View>
                
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.label}>Telefone</Text>
                  <TextInput
                    style={styles.input}
                    value={phone}
                    onChangeText={(text) => setPhone(formatPhone(text))}
                    placeholder="(11) 98765-4321"
                    placeholderTextColor="#888"
                    maxLength={15}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.label}>Data de nascimento</Text>
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={styles.dateButtonText}>
                      {birthDate ? birthDate.toLocaleDateString('pt-BR') : 'Selecionar data'}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={birthDate || new Date()}
                      mode="date"
                      display="default"
                      onChange={handleDateChange}
                      maximumDate={new Date()}
                    />
                  )}
                </View>
                
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.label}>Gênero</Text>
                  <TouchableOpacity 
                    style={styles.customSelect}
                    onPress={() => setShowGenderPicker(true)}
                  >
                    <Text style={[styles.selectText, !gender && styles.placeholderText]}>
                      {gender ? 
                        (gender === 'male' ? 'Masculino' :
                         gender === 'female' ? 'Feminino' :
                         gender === 'other' ? 'Outro' :
                         gender === 'prefer_not_to_say' ? 'Prefiro não informar' : 'Selecione')
                        : 'Selecione seu gênero'
                      }
                    </Text>
                    <Text style={styles.selectArrow}>▼</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            
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
            
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.saveButton, loading && styles.saveButtonDisabled]}
                onPress={handleSaveProfile}
                disabled={loading}
              >
                <Text style={styles.saveButtonText}>
                  {loading ? "Salvando..." : "Salvar informações"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    width: width * 0.9,
    maxHeight: height * 0.85,
    borderWidth: 1,
    borderColor: 'rgba(230, 92, 255, 0.2)',
  },
  scrollView: {
    maxHeight: height * 0.85,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },
  form: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
  },
  inputContainer: {
    position: 'relative',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  inputSuccess: {
    borderColor: '#22c55e',
  },
  validationIcon: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  successIcon: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorIcon: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dateButton: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  customSelect: {
    backgroundColor: '#181818',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444',
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
    color: '#888',
  },
  selectArrow: {
    color: '#E65CFF',
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
    backgroundColor: '#E65CFF20',
    borderWidth: 1,
    borderColor: '#E65CFF',
  },
  genderOptionText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  selectedGenderOptionText: {
    color: '#E65CFF',
    fontWeight: '600',
  },
  checkmark: {
    color: '#E65CFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  saveButton: {
    backgroundColor: '#E65CFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: 'rgba(230, 92, 255, 0.5)',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});