import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  SafeAreaView, 
  KeyboardAvoidingView, 
  Platform,
  Alert
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from './src/config/firebase';

type AppState = 'LOADING' | 'LOGIN' | 'PIN_SETUP' | 'PIN_PROMPT' | 'HOME';

export default function App() {
  const [appState, setAppState] = useState<AppState>('LOADING');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const savedUser = await SecureStore.getItemAsync('user_session_email');
      const savedPin = await SecureStore.getItemAsync('app_security_pin');
      
      if (savedUser) {
        setUserEmail(savedUser);
        if (savedPin) {
          setAppState('PIN_PROMPT');
        } else {
          setAppState('PIN_SETUP');
        }
      } else {
        setAppState('LOGIN');
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      setAppState('LOGIN');
    }
  };

  // --- 1. LOGIN HANDLER ---
  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Champs vides', 'Veuillez remplir tous les champs.');
      return;
    }

    setLoading(true);
    try {
      const credentials = await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), password);
      const user = credentials.user;
      
      if (user && user.email) {
        setUserEmail(user.email);
        await SecureStore.setItemAsync('user_session_email', user.email);
        
        // Check if PIN was previously configured
        const savedPin = await SecureStore.getItemAsync('app_security_pin');
        if (savedPin) {
          setAppState('PIN_PROMPT');
        } else {
          setAppState('PIN_SETUP');
        }
      }
    } catch (error: any) {
      Alert.alert('Erreur de connexion', error.message || 'Identifiants incorrects.');
    } finally {
      setLoading(false);
    }
  };

  // --- 2. PIN SETUP HANDLER ---
  const handlePinSetup = async () => {
    if (pin.length !== 4 || confirmPin.length !== 4) {
      Alert.alert('Erreur', 'Le code PIN doit comporter 4 chiffres.');
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert('Erreur', 'Les codes PIN ne correspondent pas.');
      setConfirmPin('');
      return;
    }

    try {
      await SecureStore.setItemAsync('app_security_pin', pin);
      Alert.alert('Succès', 'Votre code PIN a été configuré avec succès !');
      setAppState('HOME');
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sauvegarder le code PIN.');
    }
  };

  // --- 3. PIN VERIFICATION HANDLER ---
  const handlePinVerification = async (digit: string) => {
    const nextPin = enteredPin + digit;
    setEnteredPin(nextPin);

    if (nextPin.length === 4) {
      setLoading(true);
      const savedPin = await SecureStore.getItemAsync('app_security_pin');
      
      setTimeout(() => {
        if (nextPin === savedPin) {
          setAppState('HOME');
          setEnteredPin('');
        } else {
          Alert.alert('Erreur', 'Code PIN incorrect.');
          setEnteredPin('');
        }
        setLoading(false);
      }, 300);
    }
  };

  // --- 4. LOGOUT HANDLER ---
  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      await SecureStore.deleteItemAsync('user_session_email');
      await SecureStore.deleteItemAsync('app_security_pin');
      setUserEmail(null);
      setEmail('');
      setPassword('');
      setPin('');
      setConfirmPin('');
      setEnteredPin('');
      setAppState('LOGIN');
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de se déconnecter.');
    } finally {
      setLoading(false);
    }
  };

  // --- RENDERS ---

  if (appState === 'LOADING') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#14522D" />
        <Text style={styles.loadingText}>Initialisation de l'application...</Text>
      </View>
    );
  }

  if (appState === 'LOGIN') {
    return (
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <SafeAreaView style={styles.content}>
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>E</Text>
            </View>
            <Text style={styles.title}>Echo Gestion</Text>
            <Text style={styles.subtitle}>Espace Mobile Connecté</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Adresse e-mail</Text>
            <TextInput 
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="exemple@echosdechezmoi.com"
              placeholderTextColor="#64748B"
            />

            <Text style={styles.label}>Mot de passe</Text>
            <TextInput 
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="••••••••"
              placeholderTextColor="#64748B"
            />

            <TouchableOpacity 
              style={styles.button}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Se connecter</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  if (appState === 'PIN_SETUP') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Définir un code PIN</Text>
            <Text style={styles.subtitle}>Configurez votre code de sécurité à 4 chiffres pour vos prochaines connexions</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Nouveau PIN (4 chiffres)</Text>
            <TextInput 
              style={styles.pinInput}
              value={pin}
              onChangeText={text => setPin(text.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="••••"
              placeholderTextColor="#64748B"
            />

            <Text style={styles.label}>Confirmer le code PIN</Text>
            <TextInput 
              style={styles.pinInput}
              value={confirmPin}
              onChangeText={text => setConfirmPin(text.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder="••••"
              placeholderTextColor="#64748B"
            />

            <TouchableOpacity 
              style={styles.button}
              onPress={handlePinSetup}
            >
              <Text style={styles.buttonText}>Enregistrer le PIN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (appState === 'PIN_PROMPT') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Session Verrouillée</Text>
            <Text style={styles.subtitle}>Saisissez votre code PIN pour déverrouiller l'accès</Text>
            <Text style={styles.emailBadge}>{userEmail}</Text>
          </View>

          <View style={styles.pinIndicatorContainer}>
            {[0, 1, 2, 3].map((index) => (
              <View 
                key={index}
                style={[
                  styles.pinIndicatorDot,
                  enteredPin.length > index && styles.pinIndicatorDotActive
                ]}
              />
            ))}
          </View>

          <View style={styles.keypad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <TouchableOpacity
                key={num}
                style={styles.keypadButton}
                onPress={() => handlePinVerification(String(num))}
                disabled={loading}
              >
                <Text style={styles.keypadButtonText}>{num}</Text>
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity
              style={[styles.keypadButton, styles.keypadActionBtn]}
              onPress={handleLogout}
              disabled={loading}
            >
              <Text style={styles.keypadActionText}>Déconnexion</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.keypadButton}
              onPress={() => handlePinVerification('0')}
              disabled={loading}
            >
              <Text style={styles.keypadButtonText}>0</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.keypadButton, styles.keypadActionBtn]}
              onPress={() => setEnteredPin(prev => prev.slice(0, -1))}
              disabled={loading}
            >
              <Text style={styles.keypadActionText}>Retour</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- HOME / MOCK STATE ---
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>E</Text>
          </View>
          <Text style={styles.title}>Espace connecté</Text>
          <Text style={styles.subtitle}>Bienvenue sur l'application Echo Gestion</Text>
          <Text style={styles.emailBadge}>{userEmail}</Text>
        </View>

        <View style={styles.homeCard}>
          <Text style={styles.cardTitle}>Statut Session</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Connecté & Sécurisé par PIN</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617', // Slate 950
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 64,
    height: 64,
    backgroundColor: '#14522D', // Brand green
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#14522D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 16,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B', // Slate 500
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  emailBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    color: '#94A3B8',
    fontSize: 12,
    overflow: 'hidden',
  },
  form: {
    width: '100%',
  },
  label: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    height: 52,
    backgroundColor: '#0F172A', // Slate 900
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 15,
  },
  pinInput: {
    height: 52,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 20,
    letterSpacing: 10,
    textAlign: 'center',
  },
  button: {
    height: 52,
    backgroundColor: '#14522D',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    shadowColor: '#14522D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pinIndicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 48,
  },
  pinIndicatorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#334155',
  },
  pinIndicatorDotActive: {
    backgroundColor: '#14522D',
    borderColor: '#14522D',
    transform: [{ scale: 1.2 }],
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    maxWidth: 280,
    alignSelf: 'center',
  },
  keypadButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
  keypadActionBtn: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  keypadActionText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  homeCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 32,
  },
  cardTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981', // Emerald
  },
  statusText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '500',
  },
  logoutButton: {
    height: 52,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  logoutButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: 'bold',
  }
});
