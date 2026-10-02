import React, { createContext, useState, useContext, useEffect } from 'react';
import { hasTeacherRole, supabase } from '@/api/supabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    let active = true;

    let sessionVersion = 0;

    const syncSession = async (session) => {
      const version = ++sessionVersion;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser));
      setIsTeacher(false);

      try {
        const teacherRole = currentUser ? await hasTeacherRole(currentUser.id) : false;
        if (active && version === sessionVersion) setIsTeacher(teacherRole);
      } catch (error) {
        console.error('Teacher role check failed:', error);
      } finally {
        if (active && version === sessionVersion) {
          setIsLoadingAuth(false);
          setAuthChecked(true);
        }
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) syncSession(session);
    }).catch((error) => {
      console.error('Supabase session check failed:', error);
      if (active) {
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setTimeout(() => { if (active) syncSession(session); }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const logout = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      authChecked,
      isTeacher,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
