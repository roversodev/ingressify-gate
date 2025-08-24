import { IconSymbol } from '@/components/ui/IconSymbol';
import { useOAuth, useSignIn } from '@clerk/clerk-expo';
import { makeRedirectUri } from 'expo-auth-session';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// Configuração necessária para o WebBrowser
WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
  const { signIn, setActive } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onPressGoogleSignIn = React.useCallback(async () => {
    try {
      setIsGoogleLoading(true);
      const { createdSessionId, signIn, signUp, setActive } = await startOAuthFlow({
        redirectUrl: makeRedirectUri({
          scheme: 'your-app-scheme', // Você pode mudar isso
          path: '/oauth-native-callback',
        }),
      });

      if (createdSessionId) {
        setActive!({ session: createdSessionId });
        router.replace('/(tabs)');
      } else {
        // Use signIn or signUp for next steps such as MFA
      }
    } catch (err) {
      console.error('OAuth error', err);
      Alert.alert('Erro', 'Falha ao fazer login com Google');
    } finally {
      setIsGoogleLoading(false);
    }
  }, []);

  const onPressEmailSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    try {
      setIsLoading(true);
      const result = await signIn!.create({
        identifier: email,
        password,
      });

      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        Alert.alert('Erro', 'Falha ao fazer login. Verifique suas credenciais.');
      }
    } catch (err: any) {
      console.error('Email sign in error', err);
      Alert.alert('Erro', err.errors?.[0]?.message || 'Falha ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  const navigateToSignUp = () => {
    WebBrowser.openBrowserAsync('https://ingressify.com.br');
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-center px-6">
        {/* Header com Logo */}
        <View className="items-center mb-12">
          <View className="w-60 h-60">
            <Image 
              source={require('../../assets/images/logo.png')} 
              className="w-full h-full"
              resizeMode="contain"
            />
          </View>
          <Text className="text-3xl font-bold text-white mb-3">Bem-vindo!</Text>
          <Text className="text-textSecondary text-center text-base leading-6 max-w-sm">
            Faça login para acessar o app de validação de ingressos
          </Text>
        </View>

        {/* Formulário de Login */}
        <View className="mb-8">
          {/* Campo de Email */}
          <View className="mb-4">
            <View className="bg-backgroundCard rounded-xl px-4 py-4 flex-row items-center">
              <IconSymbol name="envelope" size={20} color="#6B7280" />
              <TextInput
                className="flex-1 text-white text-base ml-3"
                placeholder="Email"
                placeholderTextColor="#6B7280"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          </View>

          {/* Campo de Senha */}
          <View className="mb-6">
            <View className="bg-backgroundCard rounded-xl px-4 py-4 flex-row items-center">
              <IconSymbol name="lock" size={20} color="#6B7280" />
              <TextInput
                className="flex-1 text-white text-base ml-3 mr-3"
                placeholder="Senha"
                placeholderTextColor="#6B7280"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)}
                className="p-1"
              >
                <IconSymbol 
                  name={showPassword ? "eye.slash" : "eye"} 
                  size={20} 
                  color="#6B7280" 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Botão de Login com Email */}
          <TouchableOpacity 
            className={`bg-primary py-4 rounded-xl shadow-lg active:bg-primary/90 ${
              isLoading ? 'opacity-50' : ''
            }`}
            onPress={onPressEmailSignIn}
            disabled={isLoading}
          >
            <View className="flex-row items-center justify-center">
              {isLoading && (
                <ActivityIndicator size="small" color="#FFF" className="mr-2" />
              )}
              <Text className="text-white text-center font-bold text-base">
                {isLoading ? 'Entrando...' : 'Entrar com Email'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Divisor */}
        <View className="flex-row items-center mb-8">
          <View className="flex-1 h-px bg-gray-600" />
          <Text className="text-textSecondary px-4 text-sm">ou</Text>
          <View className="flex-1 h-px bg-gray-600" />
        </View>

        {/* Botão do Google */}
        <View className="mb-8">
          <TouchableOpacity 
            className={`bg-backgroundCard border border-gray-600 py-4 rounded-xl shadow-sm active:bg-gray-700 ${
              isGoogleLoading ? 'opacity-50' : ''
            }`}
            onPress={onPressGoogleSignIn}
            disabled={isGoogleLoading}
          >
            <View className="flex-row items-center justify-center">
              {isGoogleLoading ? (
                <ActivityIndicator size="small" color="#FFF" className="mr-3" />
              ) : (
                <View className="w-5 h-5 mr-3">
                  <IconSymbol name="globe" size={20} color="#FFF" />
                </View>
              )}
              <Text className="text-white font-semibold text-base">
                {isGoogleLoading ? 'Conectando...' : 'Continuar com Google'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Link de Cadastro */}
        <View className="flex-row justify-center items-center mb-8">
          <Text className="text-textSecondary text-sm">Não tem uma conta? </Text>
          <TouchableOpacity onPress={navigateToSignUp} className="ml-1">
            <Text className="text-primary font-semibold text-sm">Cadastre-se</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View className="items-center">
          <Text className="text-textSecondary text-xs text-center leading-4 max-w-xs">
            Ao continuar, você concorda com nossos{' '}
            <Text className="text-primary">termos de uso</Text> e{' '}
            <Text className="text-primary">política de privacidade</Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}