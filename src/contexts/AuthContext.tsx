import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  GoogleAuthProvider, 
  signInWithPopup,
  User,
  updateProfile
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<User | null>;
  login: (email: string, password: string) => Promise<User | null>;
  loginWithGoogle: () => Promise<User | null>;
  logout: () => Promise<void>;
  isProfileComplete: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const auth = getAuth();
  const db = getFirestore();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        // Check if user profile is complete
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        setIsProfileComplete(userDoc.exists());
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [auth, db]);

  async function signUp(email: string, password: string, displayName: string) {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update profile with display name
      if (result.user) {
        await updateProfile(result.user, { displayName });
        
        // Create user document in Firestore
        await setDoc(doc(db, 'users', result.user.uid), {
          email,
          displayName,
          createdAt: new Date().toISOString(),
          location: null,
          connections: []
        });
      }
      
      return result.user;
    } catch (error: any) {
      toast.error(error.message);
      return null;
    }
  }

  async function login(email: string, password: string) {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (error: any) {
      toast.error(error.message);
      return null;
    }
  }

  async function loginWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check if this is a new user
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      
      if (!userDoc.exists()) {
        // Create user document for new Google sign-ins
        await setDoc(doc(db, 'users', result.user.uid), {
          email: result.user.email,
          displayName: result.user.displayName,
          createdAt: new Date().toISOString(),
          location: null,
          connections: []
        });
      }
      
      return result.user;
    } catch (error: any) {
      toast.error(error.message);
      return null;
    }
  }

  async function logout() {
    try {
      await signOut(auth);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  const value = {
    currentUser,
    loading,
    signUp,
    login,
    loginWithGoogle,
    logout,
    isProfileComplete,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
} 