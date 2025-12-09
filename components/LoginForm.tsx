import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

interface LoginFormProps {
  onLogin: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onLogin();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Correo o contraseña incorrectos.');
      } else {
        setError('Error al iniciar sesión. Verifica tu conexión.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-100 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-2xl animate-fadeIn">
        <h2 className="text-2xl font-bold text-slate-800 text-center mb-2">Acceso Restringido</h2>
        <p className="text-center text-slate-500 mb-6">Ingresa con tus credenciales de Firebase.</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-slate-600 mb-1">Correo Electrónico</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              placeholder="admin@lockedinwork.com"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-slate-600 mb-1">Contraseña</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-indigo-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-indigo-300 disabled:opacity-50 disabled:scale-100"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
          {error && <p className="text-red-500 text-sm text-center mt-4">{error}</p>}
        </form>
      </div>
    </div>
  );
};

export default LoginForm;