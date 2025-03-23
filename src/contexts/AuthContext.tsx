import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  Auth, 
  User, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { collection, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { toast } from 'sonner';

interface AuthProviderProps {
  children: React.ReactNode;
}

interface UserProfile {
  displayName?: string | null;
  photoURL?: string | null;
}

export interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (profile: UserProfile) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function signUp(email: string, password: string, name: string) {
    try {
      // Create user with email and password
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Update user profile with name
      await updateProfile(user, {
        displayName: name
      });
      
      // Create user profile in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        displayName: name,
        createdAt: Timestamp.now(),
        connections: [],
        // Initialize empty photoURL field to be updated later
        photoURL: user.photoURL
      });
      
      return;
    } catch (error: any) {
      toast.error(error.message);
      throw error;
    }
  }

  async function login(email: string, password: string) {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      toast.error(error.message);
      throw error;
    }
  }

  async function loginWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if user document exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      // If user document doesn't exist, create it
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', user.uid), {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          createdAt: Timestamp.now(),
          connections: []
        });
      }
    } catch (error: any) {
      toast.error(error.message);
      throw error;
    }
  }

  async function logout() {
    try {
      await signOut(auth);
    } catch (error: any) {
      toast.error(error.message);
      throw error;
    }
  }

  async function resetPassword(email: string) {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      toast.error(error.message);
      throw error;
    }
  }
  
  // New function to update user profile
  async function updateUserProfile(profile: UserProfile) {
    try {
      if (!currentUser) {
        throw new Error('No user logged in');
      }
      
      // Update profile in Firebase Auth
      await updateProfile(currentUser, profile);
      
      // Update profile in Firestore
      await setDoc(doc(db, 'users', currentUser.uid), 
        { 
          displayName: profile.displayName, 
          photoURL: profile.photoURL 
        }, 
        { merge: true }
      );
      
      // Update local state to reflect changes
      setCurrentUser(prevUser => {
        if (prevUser) {
          return { ...prevUser, ...profile };
        }
        return prevUser;
      });
      
    } catch (error: any) {
      toast.error(error.message);
      throw error;
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    isAuthenticated: !!currentUser,
    loading,
    signUp,
    login,
    loginWithGoogle,
    logout,
    resetPassword,
    updateUserProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
} 