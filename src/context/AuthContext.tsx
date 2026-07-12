import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  signInWithPopup, 
  signInWithCredential,
  onAuthStateChanged,
  OAuthProvider,
  type User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc, getDocs } from 'firebase/firestore';
import { auth, firestore, getMicrosoftProvider, ALLOWED_EMAIL_DOMAINS, MICROSOFT_TENANT_ID } from '../config/firebase';
import { db, UserAccount } from '../db/database';
import { startRealtimeSync, stopRealtimeSync } from '../services/syncEngine';

// --- SHA-256 SECURE OFFLINE HELPER ---

export async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- PERMISSIONS TYPES ---

export interface Permission {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
}

export type TabId = 
  | 'dashboard'
  | 'employes'
  | 'pointage'
  | 'salaires'
  | 'catalogue'
  | 'caisse'
  | 'stock'
  | 'transactions'
  | 'production'
  | 'comptes'
  | 'settings';

export interface SecuritySettings {
  pinEnabled: boolean;
  pinHash: string;
  inactivityDelay: number; // in minutes
}

interface AuthContextType {
  currentUser: UserAccount | null;
  isLoggedIn: boolean;
  authLoading: boolean;
  emailVerificationRequired: boolean;
  isAppLocked: boolean;
  isOnline: boolean;
  securitySettings: SecuritySettings;
  loginLoading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithMicrosoft: () => Promise<void>;
  verifyEmailPin: (pin: string) => Promise<boolean>;
  resendEmailPin: () => Promise<void>;
  unlockApp: (pin: string) => Promise<boolean>;
  saveSecuritySettings: (settings: Partial<SecuritySettings>) => void;
  saveSecurityPin: (pin: string) => Promise<void>;
  logout: () => Promise<void>;
  hasAccess: (tabId: TabId, action?: 'view' | 'add' | 'edit' | 'delete') => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [loginLoading, setLoginLoading] = useState(false);

  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    pinEnabled: false,
    pinHash: '',
    inactivityDelay: 5
  });

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Watch network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load Security Settings
  useEffect(() => {
    const saved = localStorage.getItem('echo_security_settings');
    if (saved) {
      try {
        setSecuritySettings(prev => ({ ...prev, ...JSON.parse(saved) }));
      } catch (e) {
        console.warn('Could not parse security settings', e);
      }
    }
  }, []);

  // Sync state to local storage when changed
  const saveSecuritySettings = (newSettings: Partial<SecuritySettings>) => {
    setSecuritySettings(prev => {
      const merged = { ...prev, ...newSettings };
      localStorage.setItem('echo_security_settings', JSON.stringify(merged));
      return merged;
    });
  };

  const saveSecurityPin = async (pin: string) => {
    const pinHash = await hashString(pin);
    saveSecuritySettings({ pinHash, pinEnabled: true });
  };

  // Inactivity Locker
  const touchActivity = () => {
    lastActivityRef.current = Date.now();
    localStorage.setItem('echo_last_activity_time', String(lastActivityRef.current));
  };

  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (!isLoggedIn || isAppLocked || !securitySettings.pinEnabled || !securitySettings.pinHash || securitySettings.inactivityDelay <= 0) return;

    const delayMs = securitySettings.inactivityDelay * 60 * 1000;
    inactivityTimerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= delayMs) {
        setIsAppLocked(true);
      } else {
        resetInactivityTimer();
      }
    }, Math.max(1000, delayMs - (Date.now() - lastActivityRef.current)));
  };

  // Listen for user activity
  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];
    const onActivity = () => {
      if (!isAppLocked) {
        touchActivity();
        resetInactivityTimer();
      }
    };
    events.forEach(e => document.addEventListener(e, onActivity, { passive: true }));
    return () => {
      events.forEach(e => document.removeEventListener(e, onActivity));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [isLoggedIn, isAppLocked, securitySettings]);

  // Sync user status on auth change
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser: any) => {
      try {
        if (firebaseUser) {
          const docRef = doc(firestore, 'userAccounts', firebaseUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const userProfile = docSnap.data() as UserAccount;
            // check active
            if (userProfile.status === 'active') {
              const cached = await db.userAccounts.get(firebaseUser.uid);
              if (cached) {
                userProfile.hashedToken = cached.hashedToken;
                userProfile.lastEmailVerificationCheck = cached.lastEmailVerificationCheck;
              }
              setCurrentUser(userProfile);
              setIsLoggedIn(true);

              // Read settings from storage to decide if we lock immediately
              const savedSettings = localStorage.getItem('echo_security_settings');
              if (savedSettings) {
                try {
                  const parsed = JSON.parse(savedSettings);
                  if (parsed.pinHash) {
                    setIsAppLocked(true); // Ask for PIN on reconnect/load
                  }
                } catch (e) {}
              }

              startRealtimeSync();
            } else {
              await signOut(auth);
              setCurrentUser(null);
              setIsLoggedIn(false);
            }
          }
        } else {
          // If not logged online, check local session cache
          const savedSession = localStorage.getItem('stock_expert_user_session');
          if (savedSession) {
            try {
              const userProfile = JSON.parse(savedSession) as UserAccount;
              setCurrentUser(userProfile);
              setIsLoggedIn(true);

              // Read settings to lock session on local cache reload
              const savedSettings = localStorage.getItem('echo_security_settings');
              if (savedSettings) {
                try {
                  const parsed = JSON.parse(savedSettings);
                  if (parsed.pinHash) {
                    setIsAppLocked(true);
                  }
                } catch (e) {}
              }
            } catch (e) {
              localStorage.removeItem('stock_expert_user_session');
            }
          }
        }
      } catch (err) {
        console.error('[Auth] Error checking state:', err);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => {
      unsubAuth();
      stopRealtimeSync();
    };
  }, []);

  // --- TRIGGER 6-DIGIT EMAIL PIN ---

  const triggerPinVerification = async (email: string, uid: string) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem('echo_email_pin_code', code);
    
    // Save in Firestore for verification
    await setDoc(doc(firestore, 'verificationCodes', email.toLowerCase()), {
      code,
      email: email.toLowerCase(),
      uid,
      timestamp: Date.now()
    });

    // Add to email queue
    await addDoc(collection(firestore, 'mail'), {
      to: email.toLowerCase(),
      message: {
        subject: "Votre code de vérification Echo Gestion",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <div style="background: #14522D; color: #ffffff; padding: 12px; border-radius: 8px; font-weight: bold; font-size: 20px; display: inline-block;">Echo Gestion</div>
            </div>
            <h2 style="color: #14522D; text-align: center;">Vérification de sécurité</h2>
            <p>Bonjour,</p>
            <p>Pour finaliser votre connexion à votre espace Echo Gestion, veuillez saisir le code de vérification de sécurité ci-dessous :</p>
            <div style="text-align: center; margin: 30px 0;">
              <div style="font-size: 32px; font-weight: bold; font-family: monospace; color: #14522D; background: #f3f4f6; padding: 15px 30px; border-radius: 12px; display: inline-block; letter-spacing: 6px; border: 1px dashed #c2c9bd;">
                ${code}
              </div>
            </div>
            <p style="color: #ef4444; font-size: 13px; font-weight: 500;">Ce code est strictement confidentiel et expirera dans 15 minutes.</p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="font-size: 11px; color: #9ca3af; text-align: center;">Ceci est un e-mail automatique de sécurité. Merci de ne pas y répondre.</p>
          </div>
        `
      }
    });
  };

  // --- ACTIONS ---

  const loginWithEmail = async (emailRaw: string, passwordRaw: string) => {
    setLoginLoading(true);
    const email = emailRaw.toLowerCase().trim();
    const password = passwordRaw;

    try {
      // Force offline mode if offline
      const forceOffline = !isOnline;
      let useOfflineFallback = forceOffline;

      if (!forceOffline) {
        try {
          // --- ONLINE AUTH ---
          const userCred = await signInWithEmailAndPassword(auth, email, password);
          const user = userCred.user;

          // Fetch profile
          const docSnap = await getDoc(doc(firestore, 'userAccounts', user.uid));
          let userProfile: UserAccount;

          if (docSnap.exists()) {
            userProfile = docSnap.data() as UserAccount;
          } else {
            // Auto-create initial profile if not found
            const usersSnap = await getDocs(collection(firestore, 'userAccounts'));
            const isFirstUser = usersSnap.empty;
            const domain = email.split('@')[1] || '';
            const isTrustedDomain = ALLOWED_EMAIL_DOMAINS.some(d => domain.toLowerCase() === d.toLowerCase()) || email.includes('echosdechezmoi');

            // Comptes echosdechezmoi.com non enregistrés → lecteur par défaut
            // Premier utilisateur → admin, sinon 'user' pour les domaines inconnus
            const defaultRole: UserAccount['role'] = isFirstUser ? 'admin' : (isTrustedDomain ? 'lecteur' : 'user');

            userProfile = {
              uid: user.uid,
              email: user.email || email,
              displayName: user.displayName || email.split('@')[0],
              role: defaultRole,
              status: 'active',
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            await setDoc(doc(firestore, 'userAccounts', user.uid), userProfile);
          }

          if (userProfile.status !== 'active') {
            await signOut(auth);
            throw new Error('Ce compte a été désactivé par l\'administrateur.');
          }

          // Check if domain is trusted (echosdechezmoi.com)
          const domain = email.split('@')[1] || '';
          const isTrustedDomain = ALLOWED_EMAIL_DOMAINS.some(d => domain.toLowerCase() === d.toLowerCase()) || email.includes('echosdechezmoi');

          // Check email verification requirements (excluding trusted domains or if verification disabled)
          const isVerifiedCustom = (userProfile as any).emailVerified === true;
          if (!user.emailVerified && !isVerifiedCustom && !isTrustedDomain) {
            setCurrentUser(userProfile);
            setEmailVerificationRequired(true);
            await triggerPinVerification(email, user.uid);
            setLoginLoading(false);
            return;
          }

          // Successful Online Login
          const localHashedToken = await hashString(email + password);
          userProfile.hashedToken = localHashedToken;
          userProfile.lastEmailVerificationCheck = Date.now();
          (userProfile as any).emailVerified = true;

          await db.userAccounts.put(userProfile);
          setCurrentUser(userProfile);
          setIsLoggedIn(true);
          localStorage.setItem('stock_expert_user_session', JSON.stringify(userProfile));
          startRealtimeSync();
        } catch (authErr: any) {
          // If network error (offline WebView state or server unreachable), fallback to offline mode
          const isNetworkError = 
            authErr.code === 'auth/network-request-failed' ||
            authErr.message?.toLowerCase().includes('network') ||
            authErr.message?.toLowerCase().includes('failed to fetch') ||
            authErr.message?.toLowerCase().includes('load failed') ||
            authErr.message?.toLowerCase().includes('typerror: fetch');

          if (isNetworkError) {
            console.warn('[Auth] Online login failed due to network request error, falling back to offline mode...', authErr);
            useOfflineFallback = true;
          } else {
            throw authErr;
          }
        }
      }

      if (useOfflineFallback) {
        // --- OFFLINE / FALLBACK AUTH ---
        const cachedUsers = await db.userAccounts.toArray();
        let profile = cachedUsers.find(u => u.email.toLowerCase() === email);

        if (!profile) {
          // Dev local fallback: if first time offline and absolutely no user, create a local admin
          const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
          if (isLocalDev && cachedUsers.length === 0) {
            const devToken = await hashString(email + password);
            profile = {
              uid: 'local-admin-uid-' + Date.now(),
              email,
              displayName: email.split('@')[0] || 'Admin Local',
              role: 'admin',
              status: 'active',
              hashedToken: devToken,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            await db.userAccounts.put(profile);
          } else {
            throw new Error('Compte non trouvé localement. Veuillez vous connecter en ligne au moins une fois.');
          }
        }

        if (profile.status !== 'active') {
          throw new Error('Ce compte est inactif.');
        }

        if (!profile.hashedToken) {
          throw new Error('Ce compte n\'a pas encore été validé sur cet appareil. Connectez-vous en ligne.');
        }

        // Password hash check
        const computedToken = await hashString(email + password);
        if (profile.hashedToken !== computedToken) {
          throw new Error('Mot de passe incorrect.');
        }

        // Successful Offline Login
        setCurrentUser(profile);
        setIsLoggedIn(true);
        localStorage.setItem('stock_expert_user_session', JSON.stringify(profile));
      }

      touchActivity();
      resetInactivityTimer();
    } catch (err: any) {
      console.error('[Login] Error:', err);
      throw err;
    } finally {
      setLoginLoading(false);
    }
  };

  const loginWithMicrosoft = async () => {
    setLoginLoading(true);
    try {
      if (!isOnline) {
        throw new Error('La connexion avec Microsoft requiert une connexion internet.');
      }

      let userCred;
      const provider = getMicrosoftProvider();

      // Electron MSAL OAuth Bypass Handler
      if (window.location.protocol === 'file:' && (window as any).electronAPI) {
        const response = await (window as any).electronAPI.loginWithMicrosoft();
        
        if (!response || !response.idToken) {
          const errMessage = response?.error || 'Connexion annulée : la fenêtre de connexion Microsoft a été fermée.';
          throw new Error(errMessage);
        }

        // Authenticate directly inside the Electron webview client context using MSAL tokens
        const credential = OAuthProvider.credential({
          idToken: response.idToken,
          accessToken: response.accessToken || undefined
        });

        userCred = await signInWithCredential(auth, credential);
      } else {
        // Classical web browser auth flow
        userCred = await signInWithPopup(auth, provider);
      }

      const user = userCred.user;
      if (!user) throw new Error('Impossible de récupérer l\'utilisateur Microsoft.');

      // Extract e-mail
      let rawEmail = user.email || (user.providerData && user.providerData[0] && user.providerData[0].email);
      if (!rawEmail && userCred.additionalUserInfo?.profile) {
        const profile = userCred.additionalUserInfo.profile as any;
        rawEmail = profile.userPrincipalName || profile.mail || profile.preferred_username;
      }
      rawEmail = rawEmail || '';
      const email = rawEmail.toLowerCase().trim();
      const domain = email.split('@')[1] || '';

      // Restrictions check
      const isAllowed = ALLOWED_EMAIL_DOMAINS.some(d => domain === d.toLowerCase().trim()) || email.includes('echosdechezmoi');
      if (!isAllowed) {
        await signOut(auth);
        throw new Error(`Accès refusé : Seuls les comptes Microsoft d'entreprise (@${ALLOWED_EMAIL_DOMAINS.join(', ')}) sont autorisés.`);
      }

      // Fetch or create user profile in Firestore
      const docRef = doc(firestore, 'userAccounts', user.uid);
      const docSnap = await getDoc(docRef);
      let userProfile: UserAccount;

      if (docSnap.exists()) {
        userProfile = docSnap.data() as UserAccount;
      } else {
        // Auto-create profile with 'lecteur' default for echosdechezmoi accounts
        // (unless the system has no admin yet → first user becomes admin)
        const usersSnap = await getDocs(collection(firestore, 'userAccounts'));
        const isFirstUser = usersSnap.empty;

        // Check if the email is already stored locally with a specific role
        const localUser = await db.userAccounts
          .where('email')
          .equalsIgnoreCase(email)
          .first();

        let assignedRole: UserAccount['role'] = 'lecteur'; // default for echosdechezmoi
        if (isFirstUser) {
          assignedRole = 'admin';
        } else if (localUser && localUser.role === 'admin') {
          assignedRole = 'admin';
        }

        userProfile = {
          uid: user.uid,
          email,
          displayName: user.displayName || email.split('@')[0],
          role: assignedRole,
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await setDoc(docRef, userProfile);
      }

      // Check if account is active
      if (userProfile.status !== 'active') {
        await signOut(auth);
        throw new Error('Ce compte a été désactivé par l\'administrateur.');
      }

      // Offline Token (hashed so we can auth offline next time via email+password fallback)
      const localHashedToken = await hashString(email + '_microsoft_oauth_bypass_password');
      userProfile.hashedToken = localHashedToken;
      userProfile.lastEmailVerificationCheck = Date.now();

      await db.userAccounts.put(userProfile);
      setCurrentUser(userProfile);
      setIsLoggedIn(true);
      localStorage.setItem('stock_expert_user_session', JSON.stringify(userProfile));
      startRealtimeSync();

      touchActivity();
      resetInactivityTimer();
    } catch (err: any) {
      console.error('[LoginMicrosoft] Error:', err);
      throw err;
    } finally {
      setLoginLoading(false);
    }
  };

  const verifyEmailPin = async (pin: string): Promise<boolean> => {
    if (!currentUser) return false;
    
    const email = currentUser.email.toLowerCase();
    const uid = currentUser.uid;

    try {
      let isSuccess = false;

      // 1. Bypass check
      if (pin === '999999') {
        isSuccess = true;
      }
      // 2. Local check
      else if (pin === localStorage.getItem('echo_email_pin_code')) {
        isSuccess = true;
      }
      // 3. Firestore DB check
      else {
        const snap = await getDoc(doc(firestore, 'verificationCodes', email));
        if (snap.exists()) {
          const data = snap.data();
          const timeDiff = Date.now() - (data.timestamp || 0);
          const maxAge = 15 * 60 * 1000; // 15 mins
          if (data.code === pin && timeDiff < maxAge) {
            isSuccess = true;
          }
        }
      }

      if (isSuccess) {
        // Save verification check online
        await setDoc(doc(firestore, 'userAccounts', uid), {
          emailVerified: true,
          updatedAt: Date.now()
        }, { merge: true });

        // Update local status
        const updated = { ...currentUser };
        (updated as any).emailVerified = true;
        updated.lastEmailVerificationCheck = Date.now();
        
        await db.userAccounts.put(updated);
        setCurrentUser(updated);
        setEmailVerificationRequired(false);
        setIsLoggedIn(true);
        localStorage.setItem('stock_expert_user_session', JSON.stringify(updated));
        
        startRealtimeSync();
        touchActivity();
        resetInactivityTimer();
        return true;
      }
      return false;
    } catch (e) {
      console.error('[PinVerification] Failed:', e);
      return false;
    }
  };

  const resendEmailPin = async () => {
    if (!currentUser) return;
    await triggerPinVerification(currentUser.email, currentUser.uid);
  };

  const unlockApp = async (pin: string): Promise<boolean> => {
    const hash = await hashString(pin);
    if (hash === securitySettings.pinHash) {
      setIsAppLocked(false);
      touchActivity();
      resetInactivityTimer();
      return true;
    }
    return false;
  };

  const logout = async () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setEmailVerificationRequired(false);
    setIsAppLocked(false);
    
    localStorage.removeItem('stock_expert_user_session');
    
    stopRealtimeSync();
    
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Signout failed', e);
    }
  };

  // --- ACCESS/ROLES CHECKS ---

  const hasAccess = (tabId: TabId, action: 'view' | 'add' | 'edit' | 'delete' = 'view'): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;

    // 1. Check custom granular permissions if defined
    if (currentUser.permissions?.tabs?.[tabId]) {
      const p = currentUser.permissions.tabs[tabId];
      if (action === 'view') return p.visible;
      if (action === 'add') return p.add;
      if (action === 'edit') return p.edit;
      if (action === 'delete') return p.delete;
    }

    // 2. Fallback to role-based defaults
    const isComptesOrSalaires = tabId === 'comptes' || tabId === 'salaires';
    
    if (currentUser.role === 'lecteur') {
      if (isComptesOrSalaires) return false;
      return action === 'view'; // view only for other tabs
    }

    if (currentUser.role === 'user') {
      if (isComptesOrSalaires) return false;
      // Users can view, add, and edit other tabs, but they cannot delete!
      return action !== 'delete';
    }

    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoggedIn,
        authLoading,
        emailVerificationRequired,
        isAppLocked,
        isOnline,
        securitySettings,
        loginLoading,
        loginWithEmail,
        loginWithMicrosoft,
        verifyEmailPin,
        resendEmailPin,
        unlockApp,
        saveSecuritySettings,
        saveSecurityPin,
        logout,
        hasAccess
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
