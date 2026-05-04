import { HapticTab } from '@/components/HapticTab';
import { useSignIn } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

function EmailIcon({ size = 18, color = '#6B7280' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </Svg>
  );
}

function LockIcon({ size = 18, color = '#6B7280' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        d="M12 14a1 1 0 100 2 1 1 0 000-2zM5 11V7a7 7 0 0114 0v4M3 11h18v10H3V11z" />
    </Svg>
  );
}

function EyeIcon({ open, size = 18, color = '#6B7280' }: { open: boolean; size?: number; color?: string }) {
  return open ? (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" />
      <Path stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
    </Svg>
  ) : (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" />
    </Svg>
  );
}

function CheckIcon({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path stroke="#E65CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <Path stroke="#E65CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        d="M22 4L12 14.01l-3-3" />
    </Svg>
  );
}

function ArrowLeftIcon({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

type Step = 'email' | 'code' | 'done';

export default function ForgotPasswordScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);

  const codeInputs = useRef<(TextInput | null)[]>([]);
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);

  const handleCodeDigit = (value: string, index: number) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const digits = [...codeDigits];
    digits[index] = digit;
    setCodeDigits(digits);
    setCode(digits.join(''));
    if (digit !== '' && index < 5) {
      codeInputs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyPress = (key: string, index: number) => {
    if (key === 'Backspace') {
      if (codeDigits[index] !== '') {
        const digits = [...codeDigits];
        digits[index] = '';
        setCodeDigits(digits);
        setCode(digits.join(''));
      } else if (index > 0) {
        const digits = [...codeDigits];
        digits[index - 1] = '';
        setCodeDigits(digits);
        setCode(digits.join(''));
        codeInputs.current[index - 1]?.focus();
      }
    }
  };

  const onSendCode = async () => {
    if (!isLoaded) return;
    if (!email.trim()) { Alert.alert('Erro', 'Informe seu email'); return; }
    try {
      setIsLoading(true);
      await signIn!.create({ strategy: 'reset_password_email_code', identifier: email.trim() });
      setStep('code');
    } catch (err: any) {
      Alert.alert('Erro', err?.errors?.[0]?.message || 'Não foi possível enviar o código. Verifique o email.');
    } finally {
      setIsLoading(false);
    }
  };

  const onResetPassword = async () => {
    if (!isLoaded) return;
    const fullCode = codeDigits.join('');
    if (fullCode.length < 6) { Alert.alert('Erro', 'Digite o código completo de 6 dígitos'); return; }
    if (!newPassword) { Alert.alert('Erro', 'Digite a nova senha'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Erro', 'As senhas não coincidem'); return; }
    if (newPassword.length < 8) { Alert.alert('Erro', 'A senha deve ter pelo menos 8 caracteres'); return; }
    try {
      setIsLoading(true);
      const result = await signIn!.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: fullCode,
        password: newPassword,
      });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        setStep('done');
      } else {
        Alert.alert('Erro', 'Falha ao redefinir senha. Tente novamente.');
      }
    } catch (err: any) {
      Alert.alert('Erro', err?.errors?.[0]?.message || 'Código inválido ou expirado');
    } finally {
      setIsLoading(false);
    }
  };

  const renderEmailStep = () => (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <View style={{ width: 130, height: 130, borderRadius: 24, overflow: 'hidden', marginBottom: 20 }}>
          <Image source={require('../../assets/images/logo.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </View>
        <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginBottom: 8, letterSpacing: -0.5 }}>
          Recuperar senha
        </Text>
        <Text style={{ color: '#A3A3A3', fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
          Informe seu email e enviaremos um código para redefinir sua senha
        </Text>
      </View>

      <View style={{ backgroundColor: '#181818', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: emailFocused ? '#E65CFF' : 'transparent', marginBottom: 20 }}>
        <EmailIcon size={18} color={emailFocused ? '#E65CFF' : '#6B7280'} />
        <TextInput
          style={{ flex: 1, color: '#FFFFFF', fontSize: 15, marginLeft: 12 }}
          placeholder="Seu email"
          placeholderTextColor="#4B5563"
          value={email}
          onChangeText={setEmail}
          onFocus={() => setEmailFocused(true)}
          onBlur={() => setEmailFocused(false)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="done"
          onSubmitEditing={onSendCode}
          autoFocus
        />
      </View>

      <HapticTab onPress={onSendCode} disabled={isLoading} style={{ opacity: isLoading ? 0.7 : 1 }}>
        <LinearGradient
          colors={['#E65CFF', '#C040E0']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#E65CFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 }}
        >
          {isLoading && <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />}
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 }}>
            {isLoading ? 'Enviando...' : 'Enviar código'}
          </Text>
        </LinearGradient>
      </HapticTab>
    </View>
  );

  const renderCodeStep = () => (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <View style={{ width: 130, height: 130, borderRadius: 24, overflow: 'hidden', marginBottom: 20 }}>
          <Image source={require('../../assets/images/logo.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </View>
        <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginBottom: 8, letterSpacing: -0.5 }}>
          Verifique seu email
        </Text>
        <Text style={{ color: '#A3A3A3', fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
          Enviamos um código de 6 dígitos para{'\n'}
          <Text style={{ color: '#E65CFF', fontWeight: '600' }}>{email}</Text>
        </Text>
      </View>

      {/* OTP inputs */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 28 }}>
        {codeDigits.map((digit, i) => (
          <TextInput
            key={i}
            ref={ref => { codeInputs.current[i] = ref; }}
            style={{
              width: 48, height: 56, backgroundColor: '#181818', borderRadius: 12,
              borderWidth: 1.5, borderColor: digit ? '#E65CFF' : '#2E2E2E',
              color: '#FFFFFF', fontSize: 22, fontWeight: '700', textAlign: 'center',
            }}
            value={digit}
            onChangeText={(v) => handleCodeDigit(v, i)}
            onKeyPress={({ nativeEvent }) => handleCodeKeyPress(nativeEvent.key, i)}
            keyboardType="number-pad"
            selectTextOnFocus
          />
        ))}
      </View>

      {/* Nova senha */}
      <View style={{ gap: 10, marginBottom: 20 }}>
        <View style={{ backgroundColor: '#181818', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: passwordFocused ? '#E65CFF' : 'transparent' }}>
          <LockIcon size={18} color={passwordFocused ? '#E65CFF' : '#6B7280'} />
          <TextInput
            style={{ flex: 1, color: '#FFFFFF', fontSize: 15, marginLeft: 12, marginRight: 8 }}
            placeholder="Nova senha"
            placeholderTextColor="#4B5563"
            value={newPassword}
            onChangeText={setNewPassword}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            secureTextEntry={!showPassword}
            returnKeyType="next"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <EyeIcon open={showPassword} size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: '#181818', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: confirmFocused ? '#E65CFF' : 'transparent' }}>
          <LockIcon size={18} color={confirmFocused ? '#E65CFF' : '#6B7280'} />
          <TextInput
            style={{ flex: 1, color: '#FFFFFF', fontSize: 15, marginLeft: 12, marginRight: 8 }}
            placeholder="Confirmar nova senha"
            placeholderTextColor="#4B5563"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onFocus={() => setConfirmFocused(true)}
            onBlur={() => setConfirmFocused(false)}
            secureTextEntry={!showConfirm}
            returnKeyType="done"
            onSubmitEditing={onResetPassword}
          />
          <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <EyeIcon open={showConfirm} size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>

      <HapticTab onPress={onResetPassword} disabled={isLoading} style={{ opacity: isLoading ? 0.7 : 1 }}>
        <LinearGradient
          colors={['#E65CFF', '#C040E0']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#E65CFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 }}
        >
          {isLoading && <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />}
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 }}>
            {isLoading ? 'Redefinindo...' : 'Redefinir senha'}
          </Text>
        </LinearGradient>
      </HapticTab>

      <TouchableOpacity onPress={onSendCode} style={{ alignItems: 'center', marginTop: 16 }}>
        <Text style={{ color: '#4B5563', fontSize: 13 }}>
          Não recebeu?{' '}
          <Text style={{ color: '#E65CFF', fontWeight: '600' }}>Reenviar código</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderDoneStep = () => (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 130, height: 130, borderRadius: 24, overflow: 'hidden', marginBottom: 28 }}>
        <Image source={require('../../assets/images/logo.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      </View>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#E65CFF18', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <CheckIcon size={44} />
      </View>
      <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginBottom: 8, letterSpacing: -0.5 }}>
        Senha redefinida!
      </Text>
      <Text style={{ color: '#A3A3A3', fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 260, marginBottom: 36 }}>
        Sua senha foi atualizada com sucesso. Agora você pode entrar com a nova senha.
      </Text>
      <HapticTab onPress={() => router.replace('/(tabs)')} style={{ width: '100%' }}>
        <LinearGradient
          colors={['#E65CFF', '#C040E0']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', shadowColor: '#E65CFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 }}>
            Ir para o app
          </Text>
        </LinearGradient>
      </HapticTab>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#232323' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 24 }}>
            {step !== 'done' && (
              <TouchableOpacity
                onPress={() => step === 'code' ? setStep('email') : router.back()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ marginBottom: 12, alignSelf: 'flex-start', padding: 4 }}
              >
                <ArrowLeftIcon size={22} color="#A3A3A3" />
              </TouchableOpacity>
            )}
            {step === 'email' && renderEmailStep()}
            {step === 'code' && renderCodeStep()}
            {step === 'done' && renderDoneStep()}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
