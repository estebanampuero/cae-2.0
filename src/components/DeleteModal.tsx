import React, { useState } from 'react';

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSingle: () => void;
  onConfirmRange: (startDate: string, endDate: string) => void;
  doctorName: string;
  time: string;
  isProcessing: boolean;
}

const DeleteModal: React.FC<DeleteModalProps> = ({ 
  isOpen, onClose, onConfirmSingle, onConfirmRange, doctorName, time, isProcessing 
}) => {
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Eliminar Reserva</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
        </div>
        
        <div className="p-6">
            <div className="mb-6 bg-red-50 p-3 rounded-lg text-red-800 text-sm border border-red-100">
                Se eliminará la reserva de: <br/>
                <strong>{doctorName}</strong> a las <strong>{time} hrs</strong>.
            </div>

            <div className="flex gap-4 mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                        type="radio" 
                        name="delMode" 
                        checked={mode === 'single'} 
                        onChange={() => setMode('single')}
                        className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Solo esta fecha</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                        type="radio" 
                        name="delMode" 
                        checked={mode === 'range'} 
                        onChange={() => setMode('range')}
                        className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Rango de fechas</span>
                </label>
            </div>

            {mode === 'range' && (
                <div className="space-y-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Desde</label>
                        <input 
                            type="date" 
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Hasta</label>
                        <input 
                            type="date" 
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                </div>
            )}

            <div className="flex justify-end gap-2">
                <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">
                    Cancelar
                </button>
                <button 
                    onClick={() => {
                        if (mode === 'single') onConfirmSingle();
                        else onConfirmRange(startDate, endDate);
                    }}
                    disabled={isProcessing || (mode === 'range' && (!startDate || !endDate))}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md transition-all disabled:opacity-50"
                >
                    {isProcessing ? 'Procesando...' : mode === 'single' ? 'Eliminar Una' : 'Eliminar Rango'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;