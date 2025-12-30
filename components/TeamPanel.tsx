import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';

interface TeamPanelProps {
  onClose: () => void;
}

interface Invitation {
  id: string;
  email: string;
  role: 'editor' | 'viewer';
  orgId: string;
  status: 'pending';
}

const TeamPanel: React.FC<TeamPanelProps> = ({ onClose }) => {
  const { organization, userProfile } = useAuth();
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invitation[]>([]);
  
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('editor');
  const [isLoading, setIsLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (organization) {
        loadTeam();
        loadInvites();
    }
  }, [organization]);

  const loadTeam = async () => {
    if (!organization) return;
    const q = query(collection(db, 'users'), where('orgId', '==', organization.id));
    const snapshot = await getDocs(q);
    const members = snapshot.docs.map(d => d.data() as UserProfile);
    setTeamMembers(members);
  };

  const loadInvites = async () => {
    if (!organization) return;
    const q = query(collection(db, 'invitations'), where('orgId', '==', organization.id));
    const snapshot = await getDocs(q);
    const invites = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
    setPendingInvites(invites);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization || !newEmail) return;
    setIsLoading(true);
    setMsg('');

    try {
      // Verificar si ya es miembro
      const existingMember = teamMembers.find(m => m.email === newEmail);
      if (existingMember) {
          setMsg('Este usuario ya es parte del equipo.');
          setIsLoading(false);
          return;
      }

      // Crear invitación
      await addDoc(collection(db, 'invitations'), {
          email: newEmail.toLowerCase().trim(),
          orgId: organization.id,
          role: newRole,
          status: 'pending',
          createdAt: Date.now(),
          invitedBy: userProfile?.email
      });

      setMsg('Invitación enviada correctamente.');
      setNewEmail('');
      loadInvites();
      
    } catch (error) {
      console.error(error);
      setMsg('Error al enviar invitación.');
    } finally {
      setIsLoading(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
      if(!window.confirm("¿Cancelar invitación?")) return;
      try {
          await deleteDoc(doc(db, 'invitations', inviteId));
          loadInvites();
      } catch (e) { console.error(e); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-fadeIn max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Gestionar Equipo</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          {/* Info Organización */}
          <div className="mb-6 bg-indigo-50 p-4 rounded-lg text-sm text-indigo-800 border border-indigo-100">
            <p className="font-semibold">{organization?.name}</p>
            <p className="text-xs mt-1 opacity-80">Tu Rol: {userProfile?.role === 'owner' ? 'Dueño (Admin)' : userProfile?.role}</p>
          </div>

          {/* Lista de Miembros */}
          <h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider mb-3">Miembros Activos</h3>
          <ul className="space-y-2 mb-6">
            {teamMembers.map(member => (
              <li key={member.uid} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                        {member.displayName.charAt(0)}
                    </div>
                    <div>
                        <div className="font-medium text-slate-700 text-sm">{member.displayName}</div>
                        <div className="text-[10px] text-slate-400">{member.email}</div>
                    </div>
                </div>
                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${member.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {member.role}
                </span>
              </li>
            ))}
          </ul>

          {/* Lista de Invitaciones */}
          {pendingInvites.length > 0 && (
              <div className="mb-6">
                  <h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider mb-3">Invitaciones Pendientes</h3>
                  <ul className="space-y-2">
                    {pendingInvites.map(inv => (
                        <li key={inv.id} className="flex justify-between items-center p-3 bg-yellow-50 border border-yellow-100 rounded-lg border-dashed">
                            <div>
                                <div className="font-medium text-slate-700 text-sm">{inv.email}</div>
                                <div className="text-[10px] text-yellow-600">Esperando registro...</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] bg-white px-2 py-1 rounded border border-yellow-200 text-slate-500 capitalize">{inv.role}</span>
                                {userProfile?.role === 'owner' && (
                                    <button onClick={() => cancelInvite(inv.id)} className="text-red-400 hover:text-red-600" title="Cancelar">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                  </ul>
              </div>
          )}

          {/* Formulario de Invitación */}
          {userProfile?.role === 'owner' && (
             <form onSubmit={handleInvite} className="border-t border-slate-100 pt-5">
                <label className="block text-xs font-bold text-slate-700 mb-2">Invitar nuevo colaborador</label>
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    placeholder="correo@ejemplo.com" 
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="flex-1 p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                  <select 
                    value={newRole} 
                    onChange={e => setNewRole(e.target.value as any)}
                    className="p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Lector</option>
                  </select>
                  <button disabled={isLoading} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {isLoading ? '...' : 'Enviar'}
                  </button>
                </div>
                {msg && <p className={`text-xs mt-2 ${msg.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}
                <p className="text-[10px] text-slate-400 mt-2">
                  * El usuario debe iniciar sesión con este correo Google para unirse automáticamente.
                </p>
             </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamPanel;