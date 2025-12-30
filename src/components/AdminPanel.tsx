import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { 
  addCenter, addBox, addDoctor, getCenters, getBoxes, getDoctors 
} from '../services/db';
import { Center } from '../types';
import { writeBatch, doc, collection, getCountFromServer, getDocs, updateDoc } from 'firebase/firestore'; 
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

interface AdminPanelProps {
  onClose: () => void;
  onDataChange: () => void;
}

type ImportType = 'reservations' | 'infrastructure' | 'doctors';

// --- AJUSTE CRÍTICO: Pausa más larga para dar tiempo a las reglas de seguridad ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- CONVERTIR STRING A HORA CHILENA REAL ---
const parseChileanDate = (dateString: string): Date => {
  if (!dateString) return new Date();
  const cleanDate = dateString.split('+')[0].trim().replace(' ', 'T');
  const date = new Date(cleanDate + 'Z');
  return date;
};

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, onDataChange }) => {
  const { userProfile } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'centers' | 'boxes' | 'doctors' | 'import'>('centers');
  const [centers, setCenters] = useState<Center[]>([]);
  
  // Form States
  const [centerName, setCenterName] = useState('');
  const [boxName, setBoxName] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState('');
  const [doctorName, setDoctorName] = useState('');

  // Import State
  const [importType, setImportType] = useState<ImportType>('reservations');
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (userProfile?.orgId) {
        loadCenters();
    }
  }, [userProfile]);

  const loadCenters = async () => {
    if (!userProfile?.orgId) return;
    const data = await getCenters(userProfile.orgId);
    setCenters(data);
  };

  // --- CREACIÓN MANUAL ---
  const handleAddCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!centerName || !userProfile?.orgId) return;
    setIsLoading(true);
    await addCenter(centerName, userProfile.orgId);
    setCenterName('');
    setMessage('CAE agregado correctamente');
    await loadCenters();
    onDataChange();
    setIsLoading(false);
  };

  const handleAddBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boxName || !selectedCenterId || !userProfile?.orgId) return;
    setIsLoading(true);
    await addBox(boxName, selectedCenterId, userProfile.orgId);
    setBoxName('');
    setMessage('Box agregado correctamente');
    onDataChange();
    setIsLoading(false);
  };

  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorName || !selectedCenterId || !userProfile?.orgId) return;
    setIsLoading(true);
    await addDoctor(doctorName, selectedCenterId, userProfile.orgId);
    setDoctorName('');
    setMessage('Médico agregado correctamente');
    onDataChange();
    setIsLoading(false);
  };

  // --- CONTROLADOR PRINCIPAL DE IMPORTACIÓN ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userProfile?.orgId) {
        setImportLog(prev => [...prev, "Error: No se identificó la organización del usuario."]);
        return;
    }

    setImporting(true);
    setImportLog(['Leyendo archivo...', 'Analizando estructura...']);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (importType === 'infrastructure') {
            await processInfrastructure(results.data);
        } else if (importType === 'doctors') {
            await processDoctors(results.data);
        } else {
            await processReservations(results.data);
        }
      },
      error: (err) => {
        setImportLog(prev => [...prev, `Error al leer CSV: ${err.message}`]);
        setImporting(false);
      }
    });
  };

  // 1. PROCESADOR DE INFRAESTRUCTURA
  const processInfrastructure = async (data: any[]) => {
      if (!userProfile?.orgId) return;
      const orgId = userProfile.orgId;
      setImportLog(l => [...l, `Procesando ${data.length} filas de infraestructura...`]);

      try {
          const currentCenters = await getCenters(orgId);
          const currentBoxes = await getBoxes(orgId);
          
          const centerMap = new Map(currentCenters.map(c => [c.name.toLowerCase().trim(), c]));
          const boxMap = new Map(currentBoxes.map(b => [`${b.centerId}_${b.name.toLowerCase().trim()}`, b]));

          let newCenters = 0;
          let newBoxes = 0;

          // Infraestructura suele ser poca data, no necesita batching extremo
          for (const row of data) {
              const rawCae = row.cae ? row.cae.trim() : '';
              const rawBox = row.box ? row.box.trim() : '';

              if (!rawCae || !rawBox) continue;

              let centerId = '';
              const centerKey = rawCae.toLowerCase();

              if (centerMap.has(centerKey)) {
                  centerId = centerMap.get(centerKey)!.id;
              } else {
                  const newC = await addCenter(rawCae, orgId);
                  centerMap.set(centerKey, newC);
                  centerId = newC.id;
                  newCenters++;
                  setImportLog(l => [...l, `[+] Nuevo CAE: ${rawCae}`]);
              }

              const boxKey = `${centerId}_${rawBox.toLowerCase()}`;
              if (!boxMap.has(boxKey)) {
                  const newB = await addBox(rawBox, centerId, orgId);
                  boxMap.set(boxKey, newB);
                  newBoxes++;
              }
          }
          setImportLog(l => [...l, `FIN: ${newCenters} CAEs y ${newBoxes} Boxes creados.`]);
          onDataChange();
      } catch (e: any) {
          setImportLog(l => [...l, `ERROR: ${e.message}`]);
      } finally {
          setImporting(false);
      }
  };

  // 2. PROCESADOR DE MÉDICOS
  const processDoctors = async (data: any[]) => {
      if (!userProfile?.orgId) return;
      const orgId = userProfile.orgId;
      setImportLog(l => [...l, `Procesando ${data.length} filas de médicos...`]);

      try {
          const currentCenters = await getCenters(orgId);
          const currentDoctors = await getDoctors(orgId);

          const centerMap = new Map(currentCenters.map(c => [c.name.toLowerCase().trim(), c]));
          const doctorMap = new Map(currentDoctors.map(d => [`${d.centerId}_${d.name.toLowerCase().trim()}`, d]));

          let newDoctors = 0;

          for (const row of data) {
              const rawCae = row.cae ? row.cae.trim() : '';
              const rawMedico = row.medico ? row.medico.trim() : '';
              if (!rawCae || !rawMedico) continue;

              let centerId = '';
              const centerKey = rawCae.toLowerCase();
              if (centerMap.has(centerKey)) {
                  centerId = centerMap.get(centerKey)!.id;
              } else {
                  const newC = await addCenter(rawCae, orgId);
                  centerMap.set(centerKey, newC);
                  centerId = newC.id;
              }

              const docKey = `${centerId}_${rawMedico.toLowerCase()}`;
              if (!doctorMap.has(docKey)) {
                  const newD = await addDoctor(rawMedico, centerId, orgId);
                  doctorMap.set(docKey, newD);
                  newDoctors++;
              }
          }
          setImportLog(l => [...l, `FIN: ${newDoctors} médicos creados.`]);
          onDataChange();
      } catch (e: any) {
          setImportLog(l => [...l, `ERROR: ${e.message}`]);
      } finally {
          setImporting(false);
      }
  };

  // 3. PROCESADOR DE RESERVAS (OPTIMIZADO PARA REGLAS SAAS)
  const processReservations = async (data: any[]) => {
    if (!userProfile?.orgId) return;
    const orgId = userProfile.orgId;

    try {
        const logs: string[] = [`Iniciando carga de ${data.length} reservas para Org: ${orgId}...`];
        setImportLog(logs);

        // Pre-carga de datos para evitar lecturas en el bucle
        const currentCenters = await getCenters(orgId);
        const currentBoxes = await getBoxes(orgId);
        
        const centerMap = new Map(currentCenters.map(c => [c.name.toLowerCase().trim(), c]));
        const boxMap = new Map(currentBoxes.map(b => [`${b.centerId}_${b.name.toLowerCase().trim()}`, b]));

        let newReservationsCount = 0;
        
        // --- AJUSTE DE RENDIMIENTO PARA REGLAS DE SEGURIDAD ---
        // Reducimos el batchSize para que Firebase pueda validar cada documento sin timeout
        const batchSize = 100; // Antes 400. Menos es más seguro.
        let batch = writeBatch(db);
        let opCount = 0;

        for (const row of data) {
            // Validaciones
            const rawCenterName = row.location || row.cae;
            const rawDescription = row.description || '';
            const rawBoxName = rawDescription.includes('-') ? rawDescription.split('-')[0].trim() : rawDescription.trim();
            const doctorName = row.summary ? row.summary.replace(/"/g, '').trim() : 'Sin Asignar';

            if (!rawCenterName || !rawBoxName || !row.start_time) continue;

            // 1. Resolver Centro (En memoria)
            let centerId = '';
            const centerKey = rawCenterName.toLowerCase().trim();
            if (centerMap.has(centerKey)) {
                centerId = centerMap.get(centerKey)!.id;
            } else {
                // Si no existe, lo creamos. (Esto puede ser lento si hay muchos nuevos, pero es raro en reservas)
                const newCenter = await addCenter(rawCenterName.trim(), orgId);
                centerMap.set(centerKey, newCenter);
                centerId = newCenter.id;
            }

            // 2. Resolver Box (En memoria)
            let boxId = '';
            const boxKey = `${centerId}_${rawBoxName.toLowerCase()}`;
            if (boxMap.has(boxKey)) {
                boxId = boxMap.get(boxKey)!.id;
            } else {
                const newBox = await addBox(rawBoxName, centerId, orgId);
                boxMap.set(boxKey, newBox);
                boxId = newBox.id;
            }

            // 3. Fechas
            const startDate = parseChileanDate(row.start_time);
            const endDate = parseChileanDate(row.end_time);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;

            const resRef = row.id ? doc(db, 'reservations', row.id) : doc(collection(db, 'reservations'));

            // ESCRITURA EN EL BATCH
            // Al incluir orgId aquí, la regla `resource.data.orgId == user.orgId` se cumplirá.
            batch.set(resRef, {
                orgId, 
                centerId,
                boxId,
                boxName: rawBoxName,
                doctorName: doctorName,
                observation: 'Importado Supabase',
                startTime: startDate.toISOString(), 
                endTime: endDate.toISOString(),
                userId: userProfile.uid,
                originalEventId: row.event_id || '', 
                createdAt: Date.now()
            }, { merge: true }); 

            opCount++;
            newReservationsCount++;

            // COMMIT DEL BATCH
            if (opCount >= batchSize) {
                await batch.commit(); // Aquí Firebase valida las reglas para los 100 docs
                
                setImportLog(prev => [
                    ...prev.slice(-5), 
                    `[PROGRESO] Guardadas ${newReservationsCount} / ${data.length}... Esperando 2s...`
                ]);
                
                // Pausa más larga para enfriar la evaluación de reglas
                await delay(2000); 

                batch = writeBatch(db); 
                opCount = 0;
            }
        }

        if (opCount > 0) {
            await batch.commit();
        }

        setImportLog(prev => [...prev, `¡ÉXITO! Se procesaron ${newReservationsCount} reservas.`]);
        onDataChange(); 
    } catch (error: any) {
        setImportLog(prev => [...prev, `ERROR CRÍTICO: ${error.message}`]);
    } finally {
        setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col transform transition-all animate-fadeIn max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800">Administrar Base de Datos</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
             </svg>
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex p-2 gap-2 bg-slate-50/50 overflow-x-auto">
          {[
            { id: 'centers', label: 'Centros' },
            { id: 'boxes', label: 'Boxes' },
            { id: 'doctors', label: 'Médicos' },
            { id: 'import', label: 'Importar' }
          ].map(tab => (
              <button 
                key={tab.id}
                className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                onClick={() => setActiveTab(tab.id as any)}
              >
                {tab.label}
              </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {message && (
            <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              {message}
            </div>
          )}

          {/* FORMULARIOS MANUALES */}
          {activeTab === 'centers' && (
            <form onSubmit={handleAddCenter} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre del Centro (CAE)</label>
                <input 
                  type="text" 
                  value={centerName} 
                  onChange={e => setCenterName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                  placeholder="Ej: CAE Cardiología"
                  autoFocus
                />
              </div>
              <button disabled={isLoading} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50">Crear Centro</button>
            </form>
          )}

          {activeTab === 'boxes' && (
            <form onSubmit={handleAddBox} className="space-y-4">
               <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Seleccionar Centro</label>
                <select 
                  value={selectedCenterId} 
                  onChange={e => setSelectedCenterId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">Selecciona...</option>
                  {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre del Box</label>
                <input 
                  type="text" 
                  value={boxName} 
                  onChange={e => setBoxName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                  placeholder="Ej: Box 101"
                />
              </div>
              <button disabled={isLoading || !selectedCenterId} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50">Crear Box</button>
            </form>
          )}

          {activeTab === 'doctors' && (
            <form onSubmit={handleAddDoctor} className="space-y-4">
               <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Seleccionar Centro</label>
                <select 
                  value={selectedCenterId} 
                  onChange={e => setSelectedCenterId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">Selecciona...</option>
                  {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre del Médico</label>
                <input 
                  type="text" 
                  value={doctorName} 
                  onChange={e => setDoctorName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                  placeholder="Ej: Dr. Juan Pérez"
                />
              </div>
              <button disabled={isLoading || !selectedCenterId} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50">Registrar Médico</button>
            </form>
          )}

          {/* SECCIÓN DE IMPORTACIÓN */}
          {activeTab === 'import' && (
              <div className="space-y-4">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-800">
                      <p className="font-bold mb-2">Importar a {userProfile?.displayName ? `Clínica de ${userProfile.displayName}` : 'Tu Organización'}</p>
                      <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="radio" 
                                name="importType" 
                                value="reservations" 
                                checked={importType === 'reservations'} 
                                onChange={() => setImportType('reservations')}
                                className="text-indigo-600 focus:ring-indigo-500"
                              />
                              <span><strong>Reservas</strong> (calendar_events_rows.csv)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="radio" 
                                name="importType" 
                                value="infrastructure" 
                                checked={importType === 'infrastructure'} 
                                onChange={() => setImportType('infrastructure')}
                                className="text-indigo-600 focus:ring-indigo-500"
                              />
                              <span><strong>Infraestructura</strong> (Config_Infra - Configuracion.csv)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="radio" 
                                name="importType" 
                                value="doctors" 
                                checked={importType === 'doctors'} 
                                onChange={() => setImportType('doctors')}
                                className="text-indigo-600 focus:ring-indigo-500"
                              />
                              <span><strong>Médicos</strong> (Config_Infra - Medicos.csv)</span>
                          </label>
                      </div>
                  </div>
                  
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors cursor-pointer relative group">
                      <input 
                        type="file" 
                        accept=".csv"
                        onChange={handleFileUpload}
                        disabled={importing}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="pointer-events-none group-hover:scale-105 transition-transform">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="text-slate-500 font-medium">
                              Arrastra el CSV aquí
                          </p>
                      </div>
                  </div>

                  {importing && (
                      <div className="bg-slate-900 text-slate-200 p-3 rounded-lg text-xs font-mono h-40 overflow-y-auto custom-scrollbar">
                          {importLog.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
                      </div>
                  )}
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;