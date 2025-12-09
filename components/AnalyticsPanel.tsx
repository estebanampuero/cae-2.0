import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import * as XLSX from 'xlsx'; // Importar librería de Excel
import { getCenters, getReservationsInRange, getBoxes } from '../services/db';
import { Center, Reservation, Box } from '../types';
import { getChileTime } from '../utils/dateUtils';

interface AnalyticsPanelProps {
  onClose: () => void;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#10b981', '#f59e0b'];

const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ onClose }) => {
  // State for Filters
  const [centers, setCenters] = useState<Center[]>([]);
  const [selectedCenterId, setSelectedCenterId] = useState('');
  
  // State for Calculation Context (Total Boxes available)
  const [allBoxes, setAllBoxes] = useState<Box[]>([]);
  
  // Date Filters (Default: Last 7 days)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); 
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Time Filters (Default: Business hours)
  const [startTimeFilter, setStartTimeFilter] = useState('08:00');
  const [endTimeFilter, setEndTimeFilter] = useState('20:00');

  const [isLoading, setIsLoading] = useState(false);
  const [rawData, setRawData] = useState<Reservation[]>([]);

  // 1. Load centers on mount
  useEffect(() => {
    getCenters().then(setCenters);
  }, []);

  // 2. Load boxes when Center selection changes
  useEffect(() => {
    const fetchBoxes = async () => {
        const boxesData = await getBoxes(selectedCenterId || undefined);
        setAllBoxes(boxesData);
    };
    fetchBoxes();
  }, [selectedCenterId]);

  // 3. Fetch data when date/center filters change
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T00:00:00`); 
        const data = await getReservationsInRange(start, end, selectedCenterId || undefined);
        setRawData(data);
      } catch (error) {
        console.error("Error fetching analytics:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [startDate, endDate, selectedCenterId]);

  // --- DATA PROCESSING ---
  
  const filteredData = useMemo(() => {
      if (!rawData.length) return [];
      return rawData.filter(r => {
          const time = getChileTime(r.startTime); 
          return time >= startTimeFilter && time <= endTimeFilter;
      });
  }, [rawData, startTimeFilter, endTimeFilter]);

  // --- LOGICA DE NEGOCIO AVANZADA PARA CAPACIDAD ---
  const totalCapacityPerBox = useMemo(() => {
    let totalSlots = 0;
    
    const [startH, startM] = startTimeFilter.split(':').map(Number);
    const [endH, endM] = endTimeFilter.split(':').map(Number);
    const filterStartDec = startH + (startM / 60);
    const filterEndDec = endH + (endM / 60);

    const current = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    let safeGuard = 0;
    while (current <= end && safeGuard < 1000) {
        const dayOfWeek = current.getDay(); 
        let businessOpen = 0;
        let businessClose = 0;

        if (dayOfWeek >= 1 && dayOfWeek <= 4) {
            // Lunes a Jueves
            businessOpen = 8.0;
            businessClose = 20.0;
        } else if (dayOfWeek === 5) {
            // Viernes
            businessOpen = 8.0;
            businessClose = 16.0;
        } else {
            // Sábado y Domingo (0 y 6) -> 0 Horas
            businessOpen = 0;
            businessClose = 0;
        }

        const effectiveStart = Math.max(businessOpen, filterStartDec);
        const effectiveEnd = Math.min(businessClose, filterEndDec);

        if (effectiveEnd > effectiveStart) {
            const hoursAvailable = effectiveEnd - effectiveStart;
            totalSlots += Math.floor(hoursAvailable * 2);
        }

        current.setDate(current.getDate() + 1);
        safeGuard++;
    }

    return totalSlots;
  }, [startDate, endDate, startTimeFilter, endTimeFilter]);


  // --- CHARTS DATA PREPARATION ---

  // 1. Occupancy % per Box
  const dataOccupancy = useMemo(() => {
    const usageMap: Record<string, number> = {};
    allBoxes.forEach(b => { usageMap[b.name] = 0; });

    filteredData.forEach(r => {
        if (usageMap[r.boxName] !== undefined) {
            usageMap[r.boxName]++;
        }
    });

    return Object.entries(usageMap).map(([boxName, occupiedCount]) => {
        const capacity = totalCapacityPerBox > 0 ? totalCapacityPerBox : 1;
        const validOccupied = occupiedCount > capacity ? capacity : occupiedCount;
        const free = capacity - validOccupied;
        
        const occupiedPct = parseFloat(((validOccupied / capacity) * 100).toFixed(1));
        const freePct = parseFloat(((free / capacity) * 100).toFixed(1));

        return {
            name: boxName,
            occupied: validOccupied,
            free: free,
            occupiedPct,
            freePct
        };
    }).sort((a, b) => b.occupiedPct - a.occupiedPct);
  }, [allBoxes, filteredData, totalCapacityPerBox]);


  // 2. Line Chart Data (Timeline) - EXCLUYENDO FINES DE SEMANA
  const dataTimeline = useMemo(() => {
    const map: Record<string, number> = {};
    let cur = new Date(`${startDate}T00:00:00`);
    const last = new Date(`${endDate}T00:00:00`);
    let loops = 0;
    
    // Inicializar solo días hábiles
    while (cur <= last && loops < 365) {
        const dayOfWeek = cur.getDay();
        // Solo agregar al mapa si NO es domingo (0) ni sábado (6)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            const k = cur.toISOString().split('T')[0];
            map[k] = 0;
        }
        cur.setDate(cur.getDate() + 1);
        loops++;
    }

    filteredData.forEach(r => {
        const day = r.startTime.split('T')[0];
        // Solo contar si el día existe en el mapa (es día hábil)
        if (map[day] !== undefined) map[day]++;
    });

    return Object.keys(map).sort().map(date => {
        const parts = date.split('-');
        return { date: `${parts[2]}/${parts[1]}`, reservas: map[date] };
    });
  }, [filteredData, startDate, endDate]);

  // 3. Pie Chart Data (Doctors)
  const dataByDoctor = useMemo(() => {
    const map: Record<string, number> = {};
    filteredData.forEach(r => {
        const name = r.doctorName;
        map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
  }, [filteredData]);

  // KPIs
  const totalReservations = filteredData.length;
  const uniqueDoctors = new Set(filteredData.map(r => r.doctorName)).size;
  const busyBox = dataOccupancy.length > 0 ? dataOccupancy[0].name : '-';
  
  // KPI: Promedio Diario (CALCULADO SOLO SOBRE DÍAS HÁBILES)
  const workingDays = useMemo(() => {
      let count = 0;
      let cur = new Date(`${startDate}T00:00:00`);
      const last = new Date(`${endDate}T00:00:00`);
      let loops = 0;
      while (cur <= last && loops < 365) {
          const day = cur.getDay();
          if (day !== 0 && day !== 6) count++;
          cur.setDate(cur.getDate() + 1);
          loops++;
      }
      return count > 0 ? count : 1;
  }, [startDate, endDate]);

  const dailyAverage = (totalReservations / workingDays).toFixed(1);

  // --- EXPORT TO EXCEL ---
  const handleExportExcel = () => {
    if (filteredData.length === 0) {
        alert("No hay datos para exportar en este rango.");
        return;
    }

    // 1. Hoja de Resumen (KPIs)
    const summaryData = [
        { Metrica: "Fecha Reporte", Valor: new Date().toLocaleString('es-CL') },
        { Metrica: "Rango Inicio", Valor: startDate },
        { Metrica: "Rango Fin", Valor: endDate },
        { Metrica: "Días Hábiles en Rango", Valor: workingDays },
        { Metrica: "Total Reservas Filtradas", Valor: totalReservations },
        { Metrica: "Promedio Diario (Días Hábiles)", Valor: dailyAverage },
        { Metrica: "Médicos Activos", Valor: uniqueDoctors },
        { Metrica: "Box Más Usado", Valor: busyBox },
        { Metrica: "Capacidad Bloques/Box (aprox)", Valor: totalCapacityPerBox }
    ];

    // 2. Hoja de Ocupación por Box
    const occupancySheetData = dataOccupancy.map(d => ({
        Box: d.name,
        'Bloques Ocupados': d.occupied,
        'Bloques Libres': d.free,
        '% Ocupación': `${d.occupiedPct}%`,
        '% Disponibilidad': `${d.freePct}%`
    }));

    // 3. Hoja de Detalle de Reservas
    const detailSheetData = filteredData.map(r => {
        // Formato de fecha completo para Excel
        const dateObj = new Date(r.startTime);
        const fullDateTime = new Intl.DateTimeFormat('es-CL', {
            timeZone: 'America/Santiago',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        }).format(dateObj);

        return {
            ID: r.id,
            Centro: centers.find(c => c.id === r.centerId)?.name || 'Desconocido',
            Box: r.boxName,
            Profesional: r.doctorName,
            Fecha_Hora: fullDateTime,
            Observacion: r.observation || '-',
            Usuario_Registro: r.userId
        };
    });

    // Crear Libro
    const wb = XLSX.utils.book_new();
    
    // Convertir JSON a Hojas
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsOccupancy = XLSX.utils.json_to_sheet(occupancySheetData);
    const wsDetail = XLSX.utils.json_to_sheet(detailSheetData);

    // Ajustar anchos de columna básicos
    const colsSummary = [{ wch: 25 }, { wch: 30 }];
    const colsOccupancy = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    const colsDetail = [{ wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 30 }];

    wsSummary['!cols'] = colsSummary;
    wsOccupancy['!cols'] = colsOccupancy;
    wsDetail['!cols'] = colsDetail;

    // Agregar Hojas al Libro
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen");
    XLSX.utils.book_append_sheet(wb, wsOccupancy, "Ocupación Boxes");
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detalle Reservas");

    // Descargar
    XLSX.writeFile(wb, `Reporte_Gestion_CAE_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col overflow-hidden animate-fadeIn">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Analytics Dashboard</h2>
                    <p className="text-xs text-slate-500">Métricas de ocupación y rendimiento</p>
                </div>
            </div>
            
            <div className="flex gap-2">
                <button 
                    onClick={handleExportExcel}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Exportar Excel
                </button>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>

        {/* Filters Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-4 items-end">
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Fecha Inicio</label>
                <input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Fecha Fin</label>
                <input 
                    type="date" 
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
            </div>
             <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Hora Inicio</label>
                <input 
                    type="time" 
                    value={startTimeFilter} 
                    onChange={e => setStartTimeFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
            </div>
             <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Hora Fin</label>
                <input 
                    type="time" 
                    value={endTimeFilter} 
                    onChange={e => setEndTimeFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
            </div>

            <div className="min-w-[200px]">
                <label className="block text-xs font-bold text-slate-500 mb-1">Filtrar por Centro</label>
                <select 
                    value={selectedCenterId} 
                    onChange={e => setSelectedCenterId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                    <option value="">Todos los Centros</option>
                    {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>
            <div className="ml-auto text-xs text-slate-400 self-center">
                {isLoading ? 'Actualizando datos...' : `Última act: ${new Date().toLocaleTimeString()}`}
            </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50/30 custom-scrollbar">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Total Reservas</p>
                        <h3 className="text-3xl font-bold text-indigo-600">{totalReservations}</h3>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Promedio Diario</p>
                        <h3 className="text-3xl font-bold text-blue-600">{dailyAverage}</h3>
                        <p className="text-xs text-slate-400 mt-1">reservas / día (Hábiles)</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Médicos Activos</p>
                        <h3 className="text-3xl font-bold text-violet-600">{uniqueDoctors}</h3>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-slate-500 font-medium">Box Más Ocupado</p>
                        <h3 className="text-xl font-bold text-emerald-600 truncate max-w-[150px]">{busyBox}</h3>
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
                
                {/* 1. CHART: Occupancy Percentage */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <h4 className="text-base font-bold text-slate-700">Porcentaje de Ocupación vs Disponibilidad</h4>
                            <p className="text-xs text-slate-400">
                                Capacidad calculada: Lun-Jue (8-20h), Vie (8-16h), Fines de semana (Cerrado).
                            </p>
                        </div>
                        <div className="text-right">
                            <span className="block text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                                Total Bloques Disponibles: {totalCapacityPerBox} / box
                            </span>
                        </div>
                    </div>
                    
                    <div className="h-[350px] w-full" style={{ minHeight: '350px' }}>
                        {dataOccupancy.length > 0 ? (
                             <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dataOccupancy} margin={{top: 20, right: 30, left: 20, bottom: 5}}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" tick={{fontSize: 12}} />
                                    <YAxis unit="%" tick={{fontSize: 12}} />
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        formatter={(value: number, name: string) => {
                                            return name === 'occupiedPct' 
                                              ? [`${value}% Ocupado`, 'Ocupación'] 
                                              : [`${value}% Libre`, 'Disponibilidad'];
                                        }}
                                    />
                                    <Legend />
                                    <Bar dataKey="occupiedPct" name="Ocupado (%)" stackId="a" fill="#6366f1" radius={[0, 0, 4, 4]} />
                                    <Bar dataKey="freePct" name="Libre (%)" stackId="a" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400">Seleccione un Centro para ver detalles de sus boxes.</div>
                        )}
                    </div>
                </div>

                {/* 2. Line Chart */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h4 className="text-base font-bold text-slate-700 mb-6">Tendencia de Reservas (Días Hábiles)</h4>
                    <div className="h-[300px] w-full" style={{ minHeight: '300px' }}>
                         <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={dataTimeline}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="date" stroke="#94a3b8" tick={{fontSize: 12}} />
                                <YAxis stroke="#94a3b8" tick={{fontSize: 12}} allowDecimals={false} />
                                <Tooltip contentStyle={{borderRadius: '8px'}} />
                                <Line type="monotone" dataKey="reservas" stroke="#6366f1" strokeWidth={3} dot={{r: 4}} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3. Pie Chart */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h4 className="text-base font-bold text-slate-700 mb-6">Top Médicos (Reservas)</h4>
                    <div className="h-[300px] w-full" style={{ minHeight: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={dataByDoctor}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {dataByDoctor.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPanel;