import { HapticTab } from '@/components/HapticTab';
import { useUser } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

function ArrowLeftIcon({ size = 22, color = '#A3A3A3' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

function CheckIcon({ size = 44 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path stroke="#E65CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <Path stroke="#E65CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M22 4L12 14.01l-3-3" />
    </Svg>
  );
}

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder?: string;
  returnKeyType?: 'next' | 'done';
  onSubmit?: () => void;
  hint?: string;
}

function PasswordField({
  label, value, onChange, focused, onFocus, onBlur,
  show, onToggleShow, placeholder, returnKeyType = 'next', onSubmit, hint,
}: PasswordFieldProps) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: '#A3A3A3', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 }}>
        {label.toUpperCase()}
      </Text>
      <View style={{
        backgroundColor: '#181818', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
        flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
        borderColor: focused ? '#E65CFF' : 'transparent',
      }}>
        <LockIcon size={18} color={focused ? '#E65CFF' : '#4B5563'} />
        <TextInput
          style={{ flex: 1, color: '#FFFFFF', fontSize: 15, marginLeft: 12, marginRight: 8 }}
          placeholder={placeholder ?? label}
          placeholderTextColor="#4B5563"
          value={value}
          onChangeText={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          secureTextEntry={!show}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmit}
          autoCapitalize="none"
        />
        <TouchableOpacity onPress={onToggleShow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <EyeIcon open={show} size={18} color="#4B5563" />
        </TouchableOpacity>
      </View>
      {hint && (
        <Text style={{ color: '#4B5563', fontSize: 11, marginTop: 5, marginLeft: 2 }}>{hint}</Text>
      )}
    </View>
  );
}

export default function ChangePasswordScreen() {
  const { user } = useUser();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [currentFocused, setCurrentFocused] = useState(false);
  const [newFocused, setNewFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const passwordStrength = (p: string): { label: string; color: string; width: string } => {
    if (p.length === 0) return { label: '', color: 'transparent', width: '0%' };
    if (p.length < 6) return { label: 'Fraca', color: '#F87171', width: '25%' };
    if (p.length < 8) return { label: 'Razoável', color: '#FB923C', width: '50%' };
    if (p.length < 12 || !/[A-Z]/.test(p) || !/[0-9]/.test(p))
      return { label: 'Boa', color: '#FACC15', width: '75%' };
    return { label: 'Forte', color: '#4ADE80', width: '100%' };
  };

  const strength = passwordStrength(newPassword);

  const onSubmit = async () => {
    if (!currentPassword) { Alert.alert('Erro', 'Informe sua senha atual'); return; }
    if (!newPassword) { Alert.alert('Erro', 'Informe a nova senha'); return; }
    if (newPassword.length < 8) { Alert.alert('Erro', 'A nova senha deve ter pelo menos 8 caracteres'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Erro', 'As senhas não coincidem'); return; }
    if (newPassword === currentPassword) { Alert.alert('Erro', 'A nova senha deve ser diferente da atual'); return; }
    try {
      setIsLoading(true);
      await user?.updatePassword({ currentPassword, newPassword, signOutOfOtherSessions: true });
      setDone(true);
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message
        ?? 'Não foi possível alterar a senha. Verifique sua senha atual.';
      Alert.alert('Erro', msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#232323' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#E65CFF15', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <CheckIcon size={48} />
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginBottom: 10, letterSpacing: -0.5 }}>
            Senha alterada!
          </Text>
          <Text style={{ color: '#A3A3A3', fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 260, marginBottom: 36 }}>
            Sua senha foi atualizada com sucesso. Outras sessões ativas foram encerradas por segurança.
          </Text>
          <HapticTab onPress={() => router.back()} style={{ width: '100%' }}>
            <LinearGradient
              colors={['#E65CFF', '#C040E0']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', shadowColor: '#E65CFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Voltar ao perfil</Text>
            </LinearGradient>
          </HapticTab>
        </View>
      </SafeAreaView>
    );
  }

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

            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ alignSelf: 'flex-start', marginBottom: 28, padding: 4 }}
            >
              <ArrowLeftIcon />
            </TouchableOpacity>

            <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginBottom: 8, letterSpacing: -0.5 }}>
              Alterar senha
            </Text>
            <Text style={{ color: '#A3A3A3', fontSize: 14, lineHeight: 20, marginBottom: 32, maxWidth: 300 }}>
              Escolha uma senha forte que você não use em outros sites
            </Text>

            <PasswordField
              label="Senha atual"
              value={currentPassword}
              onChange={setCurrentPassword}
              focused={currentFocused}
              onFocus={() => setCurrentFocused(true)}
              onBlur={() => setCurrentFocused(false)}
              show={showCurrent}
              onToggleShow={() => setShowCurrent(v => !v)}
              placeholder="Digite sua senha atual"
            />

            <View style={{ height: 1, backgroundColor: '#2E2E2E', marginBottom: 20 }} />

            <PasswordField
              label="Nova senha"
              value={newPassword}
              onChange={setNewPassword}
              focused={newFocused}
              onFocus={() => setNewFocused(true)}
              onBlur={() => setNewFocused(false)}
              show={showNew}
              onToggleShow={() => setShowNew(v => !v)}
              placeholder="Mínimo 8 caracteres"
              hint="Use letras maiúsculas, números e símbolos para uma senha mais forte"
            />

            {newPassword.length > 0 && (
              <View style={{ marginBottom: 14, marginTop: -6 }}>
                <View style={{ height: 4, backgroundColor: '#2E2E2E', borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: strength.width as any, backgroundColor: strength.color, borderRadius: 2 }} />
                </View>
                <Text style={{ color: strength.color, fontSize: 11, marginTop: 4, marginLeft: 2, fontWeight: '600' }}>
                  Senha {strength.label}
                </Text>
              </View>
            )}

            <PasswordField
              label="Confirmar nova senha"
              value={confirmPassword}
              onChange={setConfirmPassword}
              focused={confirmFocused}
              onFocus={() => setConfirmFocused(true)}
              onBlur={() => setConfirmFocused(false)}
              show={showConfirm}
              onToggleShow={() => setShowConfirm(v => !v)}
              placeholder="Repita a nova senha"
              returnKeyType="done"
              onSubmit={onSubmit}
            />

            <View style={{ backgroundColor: '#1A1200', borderWidth: 1, borderColor: '#78350F40', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 }}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginRight: 10, marginTop: 1, flexShrink: 0 }}>
                <Path stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
              </Svg>
              <Text style={{ color: '#FCD34D', fontSize: 12, lineHeight: 18, flex: 1 }}>
                Ao alterar a senha, você será desconectado de todos os outros dispositivos por segurança.
              </Text>
            </View>

            <HapticTab onPress={onSubmit} disabled={isLoading} style={{ opacity: isLoading ? 0.7 : 1 }}>
              <LinearGradient
                colors={['#E65CFF', '#C040E0']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#E65CFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 }}
              >
                {isLoading && <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />}
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 }}>
                  {isLoading ? 'Alterando...' : 'Alterar senha'}
                </Text>
              </LinearGradient>
            </HapticTab>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
