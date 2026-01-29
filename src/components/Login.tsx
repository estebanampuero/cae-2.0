import React from 'react';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const { loginWithGoogle } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-b-[3rem] z-0"></div>
      
      <div className="relative z-10 bg-white p-10 rounded-3xl shadow-2xl w-full max-w-md text-center transform transition-all hover:scale-[1.01]">
        <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </div>
        
        <h1 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">LockedIn<span className="text-indigo-600">Work</span></h1>
        <p className="text-slate-500 mb-8 font-medium">Plataforma de gestión clínica inteligente.</p>
        
        <button 
          onClick={loginWithGoogle}
          className="w-full bg-white border border-slate-200 hover:bg-slate-50 hover:border-indigo-200 text-slate-700 font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 shadow-sm hover:shadow-lg active:scale-95 group"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6 group-hover:scale-110 transition-transform" alt="Google" />
          <span>Continuar con Google</span>
        </button>
        
        <p className="mt-8 text-xs text-slate-400">
          Al ingresar aceptas los términos de servicio y política de privacidad.
        </p>
      </div>
    </div>
  );
};

export default Login;