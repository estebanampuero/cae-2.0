import React, { useEffect, useState, useMemo } from 'react';
import Calendar from './components/Calendar';
import ScheduleGrid from './components/ScheduleGrid';
import Toast from './components/Toast';
import AdminPanel from './components/AdminPanel';
import AnalyticsPanel from './components/AnalyticsPanel';
import { 
  getCenters, 
  getBoxes, 
  getDoctors, 
  getReservationsForDate, 
  createReservationDB, 
  deleteReservationDB,
  mapReservationsToSlots,
  addDoctor
} from './services/db';
import { formatToISOWithOffset, getDayName } from './utils/dateUtils';
import { Center, Box, Doctor, OccupiedSlotInfo } from './types';

const App: React.FC = () => {
  // Auth State (Mocked)
  const [user] = useState<any>({ uid: 'dev-user', email: 'admin@dev.com' });
  
  // Data State
  const [centers, setCenters] = useState<Center[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]); 
  
  // Selection State
  const [selectedCenterId, setSelectedCenterId] = useState('');
  const [selectedFilterBox, setSelectedFilterBox] = useState('all');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [otroMedicoName, setOtroMedicoName] = useState('');
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Calendar & Reservation State
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date()); 
  const [selectedBoxForRes, setSelectedBoxForRes] = useState<string | null>(null);
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Set<string>>(new Set());
  
  // New: Reservation Details
  const [observation, setObservation] = useState('');

  // New: Recurrence State
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [selectedWeekDays, setSelectedWeekDays] = useState<number[]>([]); // 0=Domingo, 1=Lunes...

  // Availability State
  const [occupiedSlots, setOccupiedSlots] = useState<Map<string, Record<string, OccupiedSlotInfo>>>(new Map());
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isReserving, setIsReserving] = useState(false);

  // UI State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(false);

  // Load Data on Mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [centersData, boxesData, doctorsData] = await Promise.all([
        getCenters(),
        getBoxes(),
        getDoctors() 
      ]);
      
      setCenters(centersData);
      setBoxes(boxesData);
      setAllDoctors(doctorsData);
    } catch (error) {
      console.error(error);
      showToast('Error al cargar datos. Revisa tu conexión.', 'error');
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  // Filtered Lists for Dropdowns
  const availableBoxes = useMemo(() => {
    if (!selectedCenterId) return [];
    return boxes
      .filter(b => b.centerId === selectedCenterId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [boxes, selectedCenterId]);

  const availableDoctorsForCenter = useMemo(() => {
    if (!selectedCenterId) return [];
    return allDoctors.filter(d => d.centerId === selectedCenterId);
  }, [allDoctors, selectedCenterId]);

  // Global Search Logic (Navigational)
  const filteredDoctorsGlobal = useMemo(() => {
    if (!searchTerm) return [];
    return allDoctors.filter(d => 
      d.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allDoctors, searchTerm]);

  // Local Search Logic (Current View Highlighting Count)
  const currentViewMatches = useMemo(() => {
    if (!searchTerm || occupiedSlots.size === 0) return 0;
    let count = 0;
    const term = searchTerm.toLowerCase();
    // Iterar sobre el mapa de slots ocupados
    for (const slots of occupiedSlots.values()) {
        Object.values(slots).forEach((info) => {
            // Buscar coincidencia en Nombre (summary) u Observación
            if (info.summary.toLowerCase().includes(term) || 
               (info.observation && info.observation.toLowerCase().includes(term))) {
                count++;
            }
        });
    }
    return count;
  }, [occupiedSlots, searchTerm]);

  const handleGlobalDoctorSelect = (doctor: Doctor) => {
    setSelectedCenterId(doctor.centerId);
    setSelectedDoctorId(doctor.id);
    setSelectedFilterBox('all');
    setSearchTerm(''); // Clear search to show full calendar
    setIsSearchOpen(false);
    showToast(`Mostrando agenda del Dr/a. ${doctor.name}`, 'info');
  };

  // Availability Logic
  const fetchAvailabilities = async () => {
    if (!selectedCenterId || !selectedDate) return;
    
    setIsCheckingAvailability(true);
    try {
      const reservations = await getReservationsForDate(selectedCenterId, selectedDate);
      const map = mapReservationsToSlots(reservations);
      setOccupiedSlots(map);
    } catch (e) {
      console.error(e);
      showToast('Error al consultar disponibilidad', 'error');
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  useEffect(() => {
    if (selectedCenterId && selectedDate) {
      fetchAvailabilities();
      setSelectedTimeSlots(new Set());
      setSelectedBoxForRes(null);
    } else {
      setOccupiedSlots(new Map());
    }
  }, [selectedCenterId, selectedDate]);

  const handleSlotClick = (boxName: string, time: string) => {
    if (selectedBoxForRes && selectedBoxForRes !== boxName) {
      setSelectedTimeSlots(new Set([time]));
      setSelectedBoxForRes(boxName);
      return;
    }
    const newSlots = new Set(selectedTimeSlots);
    if (newSlots.has(time)) newSlots.delete(time);
    else newSlots.add(time);

    setSelectedTimeSlots(newSlots);
    setSelectedBoxForRes(newSlots.size > 0 ? boxName : null);
  };

  const toggleWeekDay = (dayIndex: number) => {
    if (selectedWeekDays.includes(dayIndex)) {
        setSelectedWeekDays(selectedWeekDays.filter(d => d !== dayIndex));
    } else {
        setSelectedWeekDays([...selectedWeekDays, dayIndex]);
    }
  };

  const handleReservation = async () => {
    if (!selectedCenterId || !selectedBoxForRes || (!selectedDoctorId && !otroMedicoName) || !selectedDate || selectedTimeSlots.size === 0) {
      showToast('Completa los campos y selecciona un horario.', 'error');
      return;
    }

    if (isRecurring && (!recurrenceEndDate || selectedWeekDays.length === 0)) {
        showToast('Para reservas recurrentes selecciona días y fecha fin.', 'error');
        return;
    }

    let finalDoctorName = '';
    if (selectedDoctorId === 'otro') {
        finalDoctorName = otroMedicoName;
        if (otroMedicoName) {
            try {
               await addDoctor(otroMedicoName, selectedCenterId);
               const updatedDocs = await getDoctors();
               setAllDoctors(updatedDocs);
            } catch(e) { console.error("Error creating auto doctor", e); }
        }
    } else {
        const docObj = allDoctors.find(d => d.id === selectedDoctorId);
        finalDoctorName = docObj ? docObj.name : '';
    }

    const boxObj = boxes.find(b => b.name === selectedBoxForRes && b.centerId === selectedCenterId);
    if (!boxObj || !finalDoctorName) return showToast('Error en datos de reserva', 'error');

    // Conflict Check (Only for the CURRENT day visually)
    const boxOccupied = occupiedSlots.get(selectedBoxForRes) || {};
    const hasConflict = (Array.from(selectedTimeSlots) as string[]).some(t => boxOccupied[t]);
    if (hasConflict) {
      showToast('Horario ya ocupado para hoy. Actualizando...', 'error');
      fetchAvailabilities();
      return;
    }

    setIsReserving(true);
    try {
      const slots = (Array.from(selectedTimeSlots) as string[]).sort();
      const datesToProcess: Date[] = [];

      if (isRecurring) {
        let currentDate = new Date(selectedDate);
        const limitDate = new Date(recurrenceEndDate);
        limitDate.setHours(23, 59, 59);

        // Loop from start date until limit
        while (currentDate <= limitDate) {
            if (selectedWeekDays.includes(currentDate.getDay())) {
                datesToProcess.push(new Date(currentDate));
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
      } else {
          datesToProcess.push(selectedDate);
      }

      // Create reservations for all calculated dates
      let createdCount = 0;
      for (const dateTarget of datesToProcess) {
          for (const time of slots) {
              const [h, m] = time.split(':').map(Number);
              const endMapDate = new Date(dateTarget);
              endMapDate.setHours(h, m + 30, 0, 0); 
              const endTimeStr = `${String(endMapDate.getHours()).padStart(2, '0')}:${String(endMapDate.getMinutes()).padStart(2, '0')}`;
              
              await createReservationDB({
                centerId: selectedCenterId,
                boxId: boxObj.id,
                boxName: boxObj.name,
                doctorName: finalDoctorName,
                observation: observation, // Save Observation
                startTime: formatToISOWithOffset(dateTarget, time),
                endTime: formatToISOWithOffset(dateTarget, endTimeStr),
                userId: user.uid
              });
          }
          createdCount++;
      }

      showToast(`¡Reserva creada! ${isRecurring ? `(${createdCount} días)` : ''}`, 'success');
      setSelectedTimeSlots(new Set());
      setSelectedBoxForRes(null);
      setObservation('');
      setIsRecurring(false);
      setRecurrenceEndDate('');
      setSelectedWeekDays([]);
      fetchAvailabilities();
    } catch (e) {
      console.error(e);
      showToast('Error al reservar. Intente nuevamente.', 'error');
    } finally {
      setIsReserving(false);
    }
  };

  const handleDelete = async (reservationId: string, calendarId: string) => {
    try {
      await deleteReservationDB(reservationId);
      showToast('Reserva eliminada.', 'success');
      fetchAvailabilities();
    } catch (e) {
      showToast('Error al eliminar.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 font-sans pb-24 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-b-[3rem] shadow-xl z-0"></div>

      <div className="relative z-10 flex flex-col h-full">
        {/* Navigation Bar */}
        <nav className="flex justify-between items-center p-6 max-w-7xl mx-auto w-full text-white">
          <div className="flex items-center gap-2">
            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">LockedIn<span className="text-indigo-200">Work</span></span>
          </div>
          <div className="flex gap-3">
             <button 
                onClick={() => setShowAnalyticsPanel(true)}
                className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white px-4 py-2 rounded-full transition-all flex items-center gap-2 text-sm font-medium"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
                Analytics
            </button>
            <button 
                onClick={() => setShowAdminPanel(true)}
                className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white px-4 py-2 rounded-full transition-all flex items-center gap-2 text-sm font-medium"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                   <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
                Admin DB
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <div className="container mx-auto px-4 md:px-6 max-w-7xl mt-4">
            
            {/* Header Title & Global Search */}
            <div className="mb-10 text-white flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h1 className="text-3xl md:text-4xl font-bold mb-2">Panel de Reservas</h1>
                    <p className="text-indigo-100 opacity-90">Gestiona espacios y médicos de forma centralizada.</p>
                </div>

                {/* Search Bar Component */}
                <div className="relative w-full md:w-96 group z-50">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-indigo-300 group-focus-within:text-indigo-600 transition-colors" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar profesional, médico o detalle..."
                        className="block w-full pl-10 pr-3 py-3 rounded-xl leading-5 bg-white/10 backdrop-blur-md text-white placeholder-indigo-200 focus:bg-white focus:text-slate-900 focus:placeholder-slate-400 border border-transparent focus:border-white focus:ring-0 shadow-lg transition-all duration-300"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setIsSearchOpen(true);
                        }}
                        onFocus={() => setIsSearchOpen(true)}
                        onBlur={() => setTimeout(() => setIsSearchOpen(false), 200)}
                    />
                    
                    {/* Search Results Dropdown & Status */}
                    {isSearchOpen && searchTerm && (
                        <div className="absolute mt-2 w-full bg-white rounded-xl shadow-2xl overflow-hidden py-2 animate-fadeIn text-slate-700">
                             
                             {/* Section 1: Matches on Current Screen */}
                             {currentViewMatches > 0 && (
                                <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-100 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
                                    <span className="text-sm font-medium text-yellow-700">
                                        ¡Encontrados <strong>{currentViewMatches}</strong> en esta vista!
                                    </span>
                                </div>
                             )}

                             {/* Section 2: Global Doctors */}
                             {filteredDoctorsGlobal.length > 0 ? (
                                <>
                                    <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                                        Médicos en Base de Datos
                                    </div>
                                    {filteredDoctorsGlobal.map(doc => {
                                        const centerName = centers.find(c => c.id === doc.centerId)?.name || 'Centro desc.';
                                        return (
                                            <button
                                                key={doc.id}
                                                onClick={() => handleGlobalDoctorSelect(doc)}
                                                className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-0 flex flex-col"
                                            >
                                                <span className="font-semibold text-slate-800">{doc.name}</span>
                                                <span className="text-xs text-slate-500 uppercase tracking-wide">{centerName}</span>
                                            </button>
                                        );
                                    })}
                                </>
                             ) : currentViewMatches === 0 && (
                                 <div className="px-4 py-3 text-slate-400 text-sm text-center">
                                     No se encontraron médicos registrados.
                                 </div>
                             )}
                        </div>
                    )}
                </div>
            </div>

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left Sidebar: Filters & Calendar */}
                <div className="lg:col-span-4 xl:col-span-3 space-y-6">
                    
                    {/* Filters Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Configuración</h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Centro (CAE)</label>
                                <div className="relative">
                                    <select 
                                        value={selectedCenterId} 
                                        onChange={(e) => {
                                            setSelectedCenterId(e.target.value);
                                            setSelectedFilterBox('all');
                                            setSelectedDoctorId('');
                                            setOtroMedicoName('');
                                        }}
                                        className="block w-full rounded-lg border-slate-200 bg-slate-50 p-2.5 text-sm focus:border-indigo-500 focus:ring-indigo-500 hover:bg-slate-100 transition-colors cursor-pointer"
                                    >
                                        <option value="">Selecciona un Centro</option>
                                        {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Filtrar Box</label>
                                <select 
                                    value={selectedFilterBox} 
                                    onChange={(e) => setSelectedFilterBox(e.target.value)}
                                    disabled={!selectedCenterId}
                                    className="block w-full rounded-lg border-slate-200 bg-slate-50 p-2.5 text-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50"
                                >
                                    <option value="all">Todos los Boxes</option>
                                    {availableBoxes.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Médico Responsable</label>
                                <select 
                                    value={selectedDoctorId} 
                                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                                    disabled={!selectedCenterId}
                                    className="block w-full rounded-lg border-slate-200 bg-slate-50 p-2.5 text-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50"
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {availableDoctorsForCenter.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    <option value="otro">+ Nuevo Médico</option>
                                </select>
                                {selectedDoctorId === 'otro' && (
                                    <input 
                                        type="text" 
                                        placeholder="Nombre del nuevo médico" 
                                        value={otroMedicoName}
                                        onChange={(e) => setOtroMedicoName(e.target.value)}
                                        className="mt-2 block w-full rounded-lg border-slate-200 bg-white p-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" 
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Calendar Component */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <Calendar selectedDate={selectedDate} onDateSelect={setSelectedDate} />
                    </div>
                </div>

                {/* Right Area: Schedule Grid */}
                <div className="lg:col-span-8 xl:col-span-9">
                    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 min-h-[600px] flex flex-col relative overflow-hidden">
                         {/* Header of Grid Card */}
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-20">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">
                                    {selectedDate ? getDayName(selectedDate) : 'Selecciona una fecha'}
                                </h2>
                                <p className="text-sm text-slate-400">
                                    {selectedCenterId 
                                        ? centers.find(c => c.id === selectedCenterId)?.name 
                                        : 'Esperando selección de centro...'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-100 border border-slate-200"></span> Libre</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-200"></span> Ocupado</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 border border-yellow-500"></span> Buscado</span>
                            </div>
                        </div>

                        {/* Grid Content */}
                        <div className="flex-1 p-0 overflow-hidden relative bg-slate-50/50">
                             {selectedCenterId && selectedDate ? (
                                <ScheduleGrid 
                                    boxes={availableBoxes.map(b => b.name)} 
                                    occupiedSlots={occupiedSlots}
                                    selectedBox={selectedBoxForRes}
                                    selectedSlots={selectedTimeSlots}
                                    onSlotClick={handleSlotClick}
                                    onDeleteReservation={handleDelete}
                                    getCalendarIdForBox={() => ''} 
                                    isLoading={isCheckingAvailability}
                                    activeFilterBox={selectedFilterBox}
                                    searchTerm={searchTerm}
                                />
                             ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    <p className="max-w-xs mx-auto">Selecciona un <strong>Centro</strong> y una <strong>Fecha</strong> para ver la disponibilidad o usa el buscador superior.</p>
                                </div>
                             )}
                        </div>
                        
                        {/* Footer / Action Bar (Enhanced) */}
                         <div className="p-4 border-t border-slate-100 bg-white space-y-4">
                            
                            {/* Observation Field */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Observación / Detalles</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="Ej: Requiere ecógrafo, Primera consulta, etc."
                                    value={observation}
                                    onChange={(e) => setObservation(e.target.value)}
                                />
                            </div>

                            {/* Recurrence Options */}
                            <div className="flex items-start gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="flex items-center h-5">
                                    <input 
                                        id="recurrence" 
                                        type="checkbox" 
                                        checked={isRecurring}
                                        onChange={(e) => setIsRecurring(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label htmlFor="recurrence" className="font-medium text-slate-700 text-sm select-none cursor-pointer">Repetir Reserva</label>
                                    {isRecurring && (
                                        <div className="mt-3 space-y-3 animate-fadeIn">
                                            <div>
                                                <span className="text-xs text-slate-500 block mb-1">Repetir los días:</span>
                                                <div className="flex gap-1">
                                                    {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((day, idx) => (
                                                        <button 
                                                            key={idx}
                                                            onClick={() => toggleWeekDay(idx)}
                                                            className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${selectedWeekDays.includes(idx) ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                                                        >
                                                            {day}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-xs text-slate-500 block mb-1">Hasta la fecha:</span>
                                                <input 
                                                    type="date" 
                                                    value={recurrenceEndDate}
                                                    onChange={e => setRecurrenceEndDate(e.target.value)}
                                                    min={new Date().toISOString().split('T')[0]}
                                                    max="2027-12-31"
                                                    className="p-2 border border-slate-200 rounded-lg text-sm w-full"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2">
                                <div className="text-sm text-slate-500">
                                    {selectedTimeSlots.size > 0 
                                        ? `${selectedTimeSlots.size} bloques en ${selectedBoxForRes} ${isRecurring ? '(Recurrente)' : ''}` 
                                        : 'Selecciona bloques para reservar'}
                                </div>
                                <button 
                                    onClick={handleReservation}
                                    disabled={isReserving || selectedTimeSlots.size === 0}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-xl shadow-lg shadow-indigo-200 transition-all transform active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:transform-none flex items-center gap-2"
                                >
                                    {isReserving ? 'Guardando...' : 'Confirmar Reserva'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        
        {showAdminPanel && (
            <AdminPanel 
                onClose={() => setShowAdminPanel(false)} 
                onDataChange={loadInitialData}
            />
        )}
        
        {showAnalyticsPanel && (
            <AnalyticsPanel
                onClose={() => setShowAnalyticsPanel(false)}
            />
        )}
      </div>
    </div>
  );
};

export default App;