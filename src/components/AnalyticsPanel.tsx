import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import * as XLSX from 'xlsx'; // <--- Usamos esta librería para la exportación
import { getCenters, getReservationsInRange, getBoxes } from '../services/db';
import { Center, Box } from '../types';
import { useAuth } from '../context/AuthContext';
import { useAnalytics, Granularity, BusinessHours } from '../hooks/useAnalytics';

// Colores Institucionales / SaaS
const COLORS = {
  primary: '#4f46e5', // Indigo 600
  success: '#10b981', // Emerald 500
  warning: '#f59e0b', // Amber 500
  danger: '#ef4444',  // Red 500
  grid: '#f1f5f9',    // Slate 100
  text: '#64748b'     // Slate 500
};

interface AnalyticsPanelProps {
  onClose: () => void;
}

const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ onClose }) => {
  const { userProfile } = useAuth();
  
  // --- Filtros Globales ---
  const [selectedCenterId, setSelectedCenterId] = useState('');
  const [selectedBoxFilter, setSelectedBoxFilter] = useState('all');
  
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0], // Últimos 30 días
    end: new Date().toISOString().split('T')[0]
  });
  const [granularity, setGranularity] = useState<Granularity>('day');

  // --- Data States ---
  const [centers, setCenters] = useState<Center[]>([]);
  const [allBoxes, setAllBoxes] = useState<Box[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // --- Configuración de Capacidad ---
  const [configHours, setConfigHours] = useState<BusinessHours>({
    weekdays: { start: 8, end: 20, isOpen: true },
    friday: { start: 8, end: 16, isOpen: true },
    saturday: { start: 9, end: 14, isOpen: false }, 
    sunday: { start: 0, end: 0, isOpen: false }
  });
  const [showConfig, setShowConfig] = useState(false);

  // --- Carga Inicial ---
  useEffect(() => {
    if (userProfile?.orgId) {
      getCenters(userProfile.orgId).then(data => {
        setCenters(data);
        if (data.length > 0) setSelectedCenterId(data[0].id);
      });
    }
  }, [userProfile]);

  // --- Resetear filtro de box al cambiar centro ---
  useEffect(() => {
    setSelectedBoxFilter('all');
  }, [selectedCenterId]);

  // --- Fetch Data ---
  useEffect(() => {
    const fetchData = async () => {
      if (!userProfile?.orgId || !selectedCenterId) return;
      
      setIsLoading(true);
      try {
        const [boxesData, reservationsData] = await Promise.all([
          getBoxes(userProfile.orgId, selectedCenterId),
          getReservationsInRange(
            userProfile.orgId, 
            new Date(dateRange.start), 
            new Date(dateRange.end), 
            selectedCenterId
          )
        ]);
        setAllBoxes(boxesData);
        setRawData(reservationsData);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [selectedCenterId, dateRange, userProfile]);

  // --- Hook de Lógica ---
  const { 
    activeData, 
    cancelledData, 
    cancellationRate,
    occupancyData, 
    getTimelineData 
  } = useAnalytics(
    rawData, 
    allBoxes, 
    dateRange.start, 
    dateRange.end, 
    configHours, 
    selectedBoxFilter
  );

  const timelineData = getTimelineData(granularity);

  // --- KPIs Calculations ---
  const totalReservas = activeData.length;
  //const tasaCancelacion = (cancelledData.length / (totalReservas + cancelledData.length || 1) * 100).toFixed(1);

  // --- NUEVA FUNCIÓN DE EXPORTACIÓN ---
  const handleExportReport = () => {
    if (activeData.length === 0 && cancelledData.length === 0) return;

    // 1. Crear Libro de Trabajo
    const wb = XLSX.utils.book_new();
    const currentDate = new Date().toISOString().split('T')[0];

    // 2. Hoja 1: Resumen General (KPIs)
    const summaryData = [
      { Indicador: "Centro", Valor: centers.find(c => c.id === selectedCenterId)?.name || 'N/A' },
      { Indicador: "Periodo Inicio", Valor: dateRange.start },
      { Indicador: "Periodo Fin", Valor: dateRange.end },
      { Indicador: "Total Atenciones Agendadas", Valor: totalReservas },
      { Indicador: "Total Cancelaciones", Valor: cancelledData.length },
      { Indicador: "Tasa de Cancelación", Valor: `${cancellationRate}%` },
      { Indicador: "Box Analizado", Valor: selectedBoxFilter === 'all' ? 'Todos' : allBoxes.find(b => b.id === selectedBoxFilter)?.name },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen General");

    // 3. Hoja 2: Detalle de Reservas (Todas)
    // Combinamos activas y canceladas para un reporte completo
    const allReservations = [...activeData, ...cancelledData].sort((a,b) => a.startTime.localeCompare(b.startTime));
    const detailData = allReservations.map(r => ({
      Fecha: r.startTime.split('T')[0],
      Hora: r.startTime.split('T')[1].substring(0, 5),
      Box: r.boxName,
      Profesional: r.doctorName,
      Estado: r.status === 'cancelled' ? 'Cancelada' : 'Realizada',
      Observacion: r.observation || 'Sin nota'
    }));
    const wsDetail = XLSX.utils.json_to_sheet(detailData);
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detalle Reservas");

    // 4. Hoja 3: Ocupación por Box
    const boxStatsData = occupancyData.map(d => ({
      Box: d.name,
      Bloques_Ocupados: d.occupied,
      Capacidad_Total_Bloques: d.capacity,
      Porcentaje_Ocupacion: `${d.occupiedPct}%`
    }));
    const wsBoxes = XLSX.utils.json_to_sheet(boxStatsData);
    XLSX.utils.book_append_sheet(wb, wsBoxes, "Eficiencia Boxes");

    // 5. Descargar archivo
    XLSX.writeFile(wb, `Reporte_Gestion_${currentDate}.xlsx`);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-50 w-full max-w-7xl h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn">
        
        {/* 1. Header & Toolbar */}
        <div className="bg-white border-b border-slate-200 px-8 py-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Gestión del Centro</h2>
            <p className="text-sm text-slate-500 mt-1">Estadísticas de atención y ocupación de recursos</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Selector Centro */}
            <select 
              value={selectedCenterId}
              onChange={(e) => setSelectedCenterId(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-medium"
            >
              {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* Selector BOX */}
            <select 
              value={selectedBoxFilter}
              onChange={(e) => setSelectedBoxFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-medium"
              disabled={!selectedCenterId}
            >
              <option value="all">Todos los Boxes</option>
              {allBoxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>

            {/* Selectores Fecha */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-1">
              <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="bg-transparent border-none text-sm text-slate-600 focus:ring-0"
              />
              <span className="text-slate-400 mx-2">→</span>
              <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="bg-transparent border-none text-sm text-slate-600 focus:ring-0"
              />
            </div>

            {/* Botón Configuración */}
            <button 
              onClick={() => setShowConfig(!showConfig)}
              className={`p-2.5 rounded-lg border transition-colors ${showConfig ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'}`}
              title="Configurar Horarios de Atención"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* NUEVO BOTÓN DE EXPORTACIÓN */}
            <button 
              onClick={handleExportReport}
              disabled={activeData.length === 0 && cancelledData.length === 0}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-md shadow-emerald-200 flex items-center gap-2 disabled:opacity-50 disabled:shadow-none"
              title="Descargar Reporte Excel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Exportar</span>
            </button>

            <button onClick={onClose} className="p-2.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 2. Configuration Panel */}
        {showConfig && (
          <div className="bg-indigo-50 border-b border-indigo-100 px-8 py-4 animate-slideDown">
            <div className="text-sm text-indigo-900 font-bold mb-3">
              Configurar Disponibilidad del Centro (Para cálculo de ocupación):
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {(['weekdays', 'friday', 'saturday', 'sunday'] as const).map(dayKey => {
                const labels: Record<string, string> = { 
                  weekdays: 'Lun - Jue', 
                  friday: 'Viernes', 
                  saturday: 'Sábado', 
                  sunday: 'Domingo' 
                };

                return (
                  <div key={dayKey} className={`flex flex-col gap-2 p-3 rounded-xl border transition-all ${configHours[dayKey].isOpen ? 'bg-white border-indigo-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs uppercase font-bold ${configHours[dayKey].isOpen ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {labels[dayKey]}
                      </span>
                      <input 
                        type="checkbox"
                        checked={configHours[dayKey].isOpen}
                        onChange={(e) => setConfigHours({
                          ...configHours, 
                          [dayKey]: { ...configHours[dayKey], isOpen: e.target.checked }
                        })}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                      />
                    </div>
                    <div className="flex gap-2 items-center">
                      <input 
                        type="number" 
                        className="w-full p-1.5 rounded border border-slate-200 text-sm text-center disabled:bg-slate-100"
                        value={configHours[dayKey].start}
                        disabled={!configHours[dayKey].isOpen}
                        onChange={(e) => setConfigHours({
                          ...configHours, 
                          [dayKey]: { ...configHours[dayKey], start: Number(e.target.value) }
                        })}
                      />
                      <span className="text-slate-400 font-bold">-</span>
                      <input 
                        type="number" 
                        className="w-full p-1.5 rounded border border-slate-200 text-sm text-center disabled:bg-slate-100"
                        value={configHours[dayKey].end}
                        disabled={!configHours[dayKey].isOpen}
                        onChange={(e) => setConfigHours({
                          ...configHours, 
                          [dayKey]: { ...configHours[dayKey], end: Number(e.target.value) }
                        })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-indigo-400 mt-3 italic">
              * Desmarca los días en que el servicio no está operativo.
            </p>
          </div>
        )}

        {/* 3. Main Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          
          {/* KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <KpiCard 
              title="Atenciones Agendadas" 
              value={totalReservas} 
              trend="+12%" 
              trendUp={true} 
              iconPath="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              color="indigo"
            />
            <KpiCard 
              title="Tasa Cancelación / No Presentación" 
              value={`${cancellationRate}%`} 
              subtitle={`${cancelledData.length} canceladas`}
              trend="-2%" 
              trendUp={true} 
              iconPath="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              color="rose"
            />
            <KpiCard 
              title={selectedBoxFilter !== 'all' ? 'Box Actual' : 'Box Más Utilizado'}
              value={occupancyData[0]?.name || '-'} 
              subtitle={`${occupancyData[0]?.occupied || 0} atenciones`}
              iconPath="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              color="amber"
            />
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {/* Timeline Chart */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-700">Evolución de Atenciones</h3>
                <div className="bg-slate-100 p-1 rounded-lg flex text-xs font-medium">
                  {(['day', 'week', 'month'] as const).map(g => (
                    <button 
                      key={g}
                      onClick={() => setGranularity(g)}
                      className={`px-3 py-1 rounded-md transition-all ${granularity === g ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {g === 'day' ? 'Día' : g === 'week' ? 'Semana' : 'Mes'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer>
                  <AreaChart data={timelineData}>
                    <defs>
                      <linearGradient id="colorReservas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
                    <XAxis dataKey="date" tick={{fontSize: 12, fill: COLORS.text}} axisLine={false} tickLine={false} dy={10} />
                    <YAxis tick={{fontSize: 12, fill: COLORS.text}} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                    <Area type="monotone" dataKey="reservas" stroke={COLORS.primary} strokeWidth={3} fillOpacity={1} fill="url(#colorReservas)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Occupancy Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
              <h3 className="font-bold text-slate-700 mb-2">
                {selectedBoxFilter !== 'all' ? 'Uso del Recurso' : 'Uso por Box'}
              </h3>
              <p className="text-xs text-slate-400 mb-4">Basado en horario operativo configurado</p>
              <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={occupancyData.slice(0, 7)} margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={COLORS.grid} />
                    <XAxis type="number" unit="%" hide />
                    <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 11, fill: COLORS.text}} axisLine={false} tickLine={false} />
                    <RechartsTooltip cursor={{fill: 'transparent'}} />
                    <Bar dataKey="occupiedPct" fill={COLORS.success} radius={[0, 4, 4, 0]} barSize={20} background={{ fill: '#f1f5f9', radius: [0, 4, 4, 0] }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// --- Subcomponente KPI ---
const KpiCard = ({ title, value, subtitle, trend, trendUp, iconPath, color }: any) => {
  const bgColors: any = { indigo: 'bg-indigo-50 text-indigo-600', rose: 'bg-rose-50 text-rose-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600' };
  const textColors: any = { indigo: 'text-indigo-600', rose: 'text-rose-600', emerald: 'text-emerald-600', amber: 'text-amber-600' };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between hover:shadow-md transition-shadow">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className={`text-2xl font-bold ${textColors[color]}`}>{value}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            <span>{trendUp ? '↑' : '↓'}</span>
            <span>{trend} vs mes anterior</span>
          </div>
        )}
      </div>
      <div className={`p-3 rounded-xl ${bgColors[color]}`}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
        </svg>
      </div>
    </div>
  );
};

export default AnalyticsPanel;