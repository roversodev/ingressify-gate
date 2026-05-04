import { HapticTab } from '@/components/HapticTab';
import { useOAuth, useSignUp } from '@clerk/clerk-expo';
import { makeRedirectUri } from 'expo-auth-session';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
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

WebBrowser.maybeCompleteAuthSession();

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

function AppleLogo({ size = 20, color = '#000000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 814 1000">
      <Path fill={color} d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.2 268.8-317.2 70.8 0 129.9 46.5 173.9 46.5 42.8 0 109.8-49.1 186.7-49.1 30.1 0 108.2 2.6 168.9 62.9zm-174.6-107.4c7.7-40.2 1.3-75.8-14.4-106.4-41.5 17.4-90.2 57.8-115.7 95.8-23.8 34.3-42.4 78-37.7 120.7 45.3 3.2 91-23.8 114.8-60.4 11.8-18.4 23.1-43.6 52.9-49.7z" />
    </Svg>
  );
}

function PersonIcon({ size = 18, color = '#6B7280' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
    </Svg>
  );
}

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

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startAppleOAuth } = useOAuth({ strategy: 'oauth_apple' });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);

  const [firstNameFocused, setFirstNameFocused] = useState(false);
  const [lastNameFocused, setLastNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      import('expo-apple-authentication').then(mod => {
        mod.isAvailableAsync().then(setIsAppleAvailable).catch(() => setIsAppleAvailable(false));
      });
    }
  }, []);

  const onPressGoogleSignUp = React.useCallback(async () => {
    try {
      setIsGoogleLoading(true);
      const redirectUrl = makeRedirectUri({ scheme: 'ingressify-gate', path: 'oauth-callback' });
      const { createdSessionId, signIn, signUp: su, setActive: sa } = await startOAuthFlow({ redirectUrl });

      if (createdSessionId) {
        await sa!({ session: createdSessionId });
      } else if (signIn?.status === 'complete') {
        await sa!({ session: signIn.createdSessionId });
      } else if (su?.status === 'complete') {
        await sa!({ session: su.createdSessionId });
      } else {
        Alert.alert('Atenção', 'Verificação adicional necessária. Tente novamente.');
      }
    } catch (err: any) {
      const redirectUrl = makeRedirectUri({ scheme: 'ingressify-gate', path: '/oauth-callback' });
      let msg = `Falha ao criar conta com Google\n\n🔍 URL: ${redirectUrl}`;
      if (err.errors?.[0]?.message) msg = `${err.errors[0].message}\n\n🔍 URL: ${redirectUrl}`;
      Alert.alert('Erro OAuth', msg);
    } finally {
      setIsGoogleLoading(false);
    }
  }, [startOAuthFlow]);

  const onPressAppleSignUp = React.useCallback(async () => {
    try {
      setIsAppleLoading(true);
      const redirectUrl = makeRedirectUri({ scheme: 'ingressify-gate', path: 'oauth-callback' });
      const { createdSessionId, signIn, signUp: su, setActive: sa } = await startAppleOAuth({ redirectUrl });

      if (createdSessionId) {
        await sa!({ session: createdSessionId });
      } else if (signIn?.status === 'complete') {
        await sa!({ session: signIn.createdSessionId });
      } else if (su?.status === 'complete') {
        await sa!({ session: su.createdSessionId });
      } else {
        Alert.alert('Atenção', 'Verificação adicional necessária. Tente novamente.');
      }
    } catch (err: any) {
      let msg = 'Falha ao criar conta com Apple.';
      if (err?.errors?.[0]?.message) msg = err.errors[0].message;
      Alert.alert('Erro OAuth', msg);
    } finally {
      setIsAppleLoading(false);
    }
  }, [startAppleOAuth]);

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      Alert.alert('Erro', 'Preencha nome, sobrenome, email e senha');
      return;
    }
    try {
      setIsLoading(true);
      const res = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      if (res.status === 'complete') {
        await setActive!({ session: res.createdSessionId });
        return;
      }
      Alert.alert('Atenção', `Status inesperado: ${res.status}`);
    } catch (err: any) {
      const msg = err?.errors?.[0]?.message || err?.message || 'Falha ao criar conta';
      Alert.alert('Erro no cadastro', msg);
    } finally {
      setIsLoading(false);
    }
  };

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

            {/* Header com Logo */}
            <View style={{ alignItems: 'center', marginBottom: 28 }}>
              <View style={{ width: 130, height: 130, borderRadius: 24, overflow: 'hidden' }}>
                <Image
                  source={require('../../assets/images/logo.png')}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                />
              </View>
              <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginTop: 16, marginBottom: 6, letterSpacing: -0.5 }}>
                Criar conta
              </Text>
              <Text style={{ color: '#A3A3A3', fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 260 }}>
                Crie sua conta para validar ingressos
              </Text>
            </View>

            {/* Botões Sociais */}
            <View style={{ gap: 10, marginBottom: 20 }}>
              {Platform.OS === 'ios' && isAppleAvailable && (
                <HapticTab onPress={onPressAppleSignUp} disabled={isAppleLoading} style={{ opacity: isAppleLoading ? 0.7 : 1 }}>
                  <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                    {isAppleLoading ? (
                      <ActivityIndicator size="small" color="#000000" style={{ marginRight: 10 }} />
                    ) : (
                      <View style={{ marginRight: 10 }}>
                        <AppleLogo size={20} color="#000000" />
                      </View>
                    )}
                    <Text style={{ color: '#000000', fontWeight: '600', fontSize: 15 }}>
                      {isAppleLoading ? 'Conectando...' : 'Continuar com Apple'}
                    </Text>
                  </View>
                </HapticTab>
              )}

              <HapticTab onPress={onPressGoogleSignUp} disabled={isGoogleLoading} style={{ opacity: isGoogleLoading ? 0.7 : 1 }}>
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  {isGoogleLoading ? (
                    <ActivityIndicator size="small" color="#4285F4" style={{ marginRight: 10 }} />
                  ) : (
                    <View style={{ marginRight: 10 }}>
                      <GoogleLogo size={20} />
                    </View>
                  )}
                  <Text style={{ color: '#111111', fontWeight: '600', fontSize: 15 }}>
                    {isGoogleLoading ? 'Conectando...' : 'Continuar com Google'}
                  </Text>
                </View>
              </HapticTab>
            </View>

            {/* Divisor */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: '#2E2E2E' }} />
              <Text style={{ color: '#4B5563', paddingHorizontal: 14, fontSize: 12, fontWeight: '500', letterSpacing: 0.5 }}>
                OU CADASTRE COM EMAIL
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#2E2E2E' }} />
            </View>

            {/* Formulário */}
            <View style={{ gap: 10, marginBottom: 8 }}>
              {/* Nome e Sobrenome lado a lado */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, backgroundColor: '#181818', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: firstNameFocused ? '#E65CFF' : 'transparent' }}>
                  <PersonIcon size={16} color={firstNameFocused ? '#E65CFF' : '#6B7280'} />
                  <TextInput
                    style={{ flex: 1, color: '#FFFFFF', fontSize: 14, marginLeft: 10 }}
                    placeholder="Nome"
                    placeholderTextColor="#4B5563"
                    value={firstName}
                    onChangeText={setFirstName}
                    onFocus={() => setFirstNameFocused(true)}
                    onBlur={() => setFirstNameFocused(false)}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
                <View style={{ flex: 1, backgroundColor: '#181818', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: lastNameFocused ? '#E65CFF' : 'transparent' }}>
                  <PersonIcon size={16} color={lastNameFocused ? '#E65CFF' : '#6B7280'} />
                  <TextInput
                    style={{ flex: 1, color: '#FFFFFF', fontSize: 14, marginLeft: 10 }}
                    placeholder="Sobrenome"
                    placeholderTextColor="#4B5563"
                    value={lastName}
                    onChangeText={setLastName}
                    onFocus={() => setLastNameFocused(true)}
                    onBlur={() => setLastNameFocused(false)}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Email */}
              <View style={{ backgroundColor: '#181818', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: emailFocused ? '#E65CFF' : 'transparent' }}>
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
                  returnKeyType="next"
                />
              </View>

              {/* Senha */}
              <View style={{ backgroundColor: '#181818', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: passwordFocused ? '#E65CFF' : 'transparent' }}>
                <LockIcon size={18} color={passwordFocused ? '#E65CFF' : '#6B7280'} />
                <TextInput
                  style={{ flex: 1, color: '#FFFFFF', fontSize: 15, marginLeft: 12, marginRight: 8 }}
                  placeholder="Crie uma senha"
                  placeholderTextColor="#4B5563"
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  secureTextEntry={!showPassword}
                  autoComplete="password-new"
                  returnKeyType="done"
                  onSubmitEditing={onSignUpPress}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <EyeIcon open={showPassword} size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Botão Criar Conta */}
            <View style={{ marginTop: 16 }}>
              <HapticTab onPress={onSignUpPress} disabled={isLoading} style={{ opacity: isLoading ? 0.7 : 1 }}>
                <LinearGradient
                  colors={['#E65CFF', '#C040E0']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#E65CFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 }}
                >
                  {isLoading && <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />}
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0.2 }}>
                    {isLoading ? 'Criando conta...' : 'Criar conta'}
                  </Text>
                </LinearGradient>
              </HapticTab>
            </View>

            {/* Link para login */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 }}>
              <Text style={{ color: '#A3A3A3', fontSize: 14 }}>Já tem uma conta? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/sign-in')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Text style={{ color: '#E65CFF', fontWeight: '700', fontSize: 14 }}>Fazer login</Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={{ alignItems: 'center', marginTop: 16 }}>
              <Text style={{ color: '#4B5563', fontSize: 11, textAlign: 'center', lineHeight: 16, maxWidth: 280 }}>
                Ao criar sua conta, você concorda com nossos{' '}
                <Text style={{ color: '#E65CFF' }}>termos de uso</Text>
                {' '}e{' '}
                <Text style={{ color: '#E65CFF' }}>política de privacidade</Text>
              </Text>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
