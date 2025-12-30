import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { UserProfile, Organization } from '../types';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  organization: Organization | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  // Función principal: Gestionar usuario en BD
  const handleUserInDB = async (firebaseUser: User) => {
    const userRef = doc(db, 'users', firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // --- CASO 1: USUARIO EXISTENTE ---
      const profile = userSnap.data() as UserProfile;
      setUserProfile(profile);
      
      // Cargar su organización
      const orgRef = doc(db, 'organizations', profile.orgId);
      const orgSnap = await getDoc(orgRef);
      if (orgSnap.exists()) {
        setOrganization(orgSnap.data() as Organization);
      }
    } else {
      // --- CASO 2: USUARIO NUEVO ---
      
      let orgId = '';
      let role: 'owner' | 'editor' | 'viewer' = 'owner';
      let orgName = `Clínica de ${firebaseUser.displayName || 'Usuario'}`;

      // A) BUSCAR INVITACIÓN PENDIENTE POR EMAIL
      const email = firebaseUser.email?.toLowerCase();
      if (email) {
          const q = query(collection(db, 'invitations'), where('email', '==', email));
          const inviteSnap = await getDocs(q);

          if (!inviteSnap.empty) {
              // ¡Encontró invitación!
              const inviteData = inviteSnap.docs[0].data();
              orgId = inviteData.orgId;
              role = inviteData.role;
              
              // Eliminar la invitación para que no quede "colgando"
              await deleteDoc(inviteSnap.docs[0].ref);
              
              // Cargar nombre de la org existente para el estado local
              const existingOrgSnap = await getDoc(doc(db, 'organizations', orgId));
              if (existingOrgSnap.exists()) {
                  const orgData = existingOrgSnap.data() as Organization;
                  orgName = orgData.name;
                  setOrganization(orgData);
              }
          }
      }

      // B) SI NO ES INVITADO, VERIFICAR PERMISO (ALLOWLIST)
      if (!orgId) {
          // Consultar la colección 'allowlist' usando el email como ID
          // Si el documento no existe, se deniega el acceso.
          const allowRef = doc(db, 'allowlist', email || 'unknown');
          const allowSnap = await getDoc(allowRef);

          if (!allowSnap.exists()) {
              alert("ACCESO DENEGADO: Tu correo no está autorizado para crear una nueva clínica. Contacta a soporte para adquirir una licencia.");
              await signOut(auth);
              return; // Detener ejecución para no crear usuario en DB
          }

          // Si pasa el bloqueo, creamos la organización
          const newOrgRef = doc(collection(db, 'organizations'));
          orgId = newOrgRef.id;
          const newOrg: Organization = {
            id: orgId,
            name: orgName,
            ownerId: firebaseUser.uid,
            createdAt: Date.now()
          };
          await setDoc(newOrgRef, newOrg);
          setOrganization(newOrg);
      }

      // C) CREAR PERFIL DE USUARIO
      const newProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || 'Usuario',
        orgId: orgId,
        role: role
      };

      await setDoc(userRef, newProfile);
      setUserProfile(newProfile);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await handleUserInDB(user);
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setOrganization(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error login:", error);
    }
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, organization, loading, loginWithGoogle, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};