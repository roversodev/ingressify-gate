import { useOAuth, useSignIn } from '@clerk/clerk-expo';
import { makeRedirectUri } from 'expo-auth-session';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  SafeAreaView,
  StyleSheet,
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

  const onPressGoogleSignIn = React.useCallback(async () => {
    try {
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
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          {/* Adicionando a logo */}
          <Image 
            source={require('../../assets/images/logo.png')} 
            style={styles.logo} 
            resizeMode="contain"
          />
          <Text style={styles.title}>Bem-vindo!</Text>
          <Text style={styles.subtitle}>
            Faça login para acessar o app de validação de ingressos
          </Text>
        </View>

        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#A3A3A3"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Senha"
            placeholderTextColor="#A3A3A3"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TouchableOpacity 
            style={styles.emailButton} 
            onPress={onPressEmailSignIn}
            disabled={isLoading}
          >
            <Text style={styles.emailButtonText}>
              {isLoading ? 'Entrando...' : 'Entrar com Email'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>ou</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.googleButton} onPress={onPressGoogleSignIn}>
            <Text style={styles.googleButtonText}>Continuar com Google</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.signUpContainer}>
          <Text style={styles.signUpText}>Não tem uma conta?</Text>
          <TouchableOpacity onPress={navigateToSignUp}>
            <Text style={styles.signUpLink}>Cadastre-se</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Ao continuar, você concorda com nossos termos de uso
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#232323', // bg-body
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  // Adicionando estilo para a logo
  logo: {
    width: 200,
    height: 200,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#A3A3A3', // text-secondary
    textAlign: 'center',
    lineHeight: 24,
  },
  formContainer: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#181818', // bg-card
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 12,
  },
  emailButton: {
    backgroundColor: '#E65CFF', // bg-destaque
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  emailButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#3f3f46', // text-secondary
  },
  dividerText: {
    color: '#A3A3A3', // text-secondary
    paddingHorizontal: 16,
    fontSize: 14,
  },
  buttonContainer: {
    marginBottom: 24,
  },
  googleButton: {
    backgroundColor: '#181818', // bg-card
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3f3f46', // text-secondary
  },
  googleButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  signUpText: {
    color: '#A3A3A3', // text-secondary
    fontSize: 14,
  },
  signUpLink: {
    color: '#E65CFF', // text-destaque
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#A3A3A3', // text-secondary
    textAlign: 'center',
    lineHeight: 18,
  },
});