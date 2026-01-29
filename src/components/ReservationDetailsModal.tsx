import React, { useState, useEffect } from 'react';

interface ReservationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, note: string) => Promise<void>;
  onDelete: () => void; // Para integrar borrar aquí también si quieres
  data: {
    id: string;
    doctorName: string;
    time: string;
    boxName: string;
    observation: string;
  } | null;
  isProcessing: boolean;
}

const ReservationDetailsModal: React.FC<ReservationDetailsModalProps> = ({ 
  isOpen, onClose, onSave, onDelete, data, isProcessing 
}) => {
  const [note, setNote] = useState('');

  // Cargar la nota actual cuando se abre el modal
  useEffect(() => {
    if (data) {
      setNote(data.observation || '');
    }
  }, [data]);

  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Detalles de Reserva</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
        </div>
        
        <div className="p-6 space-y-4">
          {/* Info Resumen */}
          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
            <div className="text-indigo-900 font-bold text-lg">{data.doctorName}</div>
            <div className="text-indigo-600 text-sm flex gap-2 mt-1">
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-indigo-200">{data.time} hrs</span>
              <span>•</span>
              <span>{data.boxName}</span>
            </div>
          </div>

          {/* Campo Nota */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nota / Observación</label>
            <textarea 
              className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-24"
              placeholder="Escribe detalles adicionales aquí..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Botones */}
          <div className="flex justify-between items-center pt-2">
            <button 
              onClick={onDelete}
              className="text-red-500 hover:text-red-700 text-sm font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
            >
              Eliminar Reserva
            </button>
            <div className="flex gap-2">
              <button 
                onClick={onClose} 
                className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => onSave(data.id, note)}
                disabled={isProcessing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md transition-all disabled:opacity-50"
              >
                {isProcessing ? 'Guardando...' : 'Guardar Nota'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReservationDetailsModal;