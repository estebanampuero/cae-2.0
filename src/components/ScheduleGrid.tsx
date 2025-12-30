import React, { useMemo } from 'react';
import { OccupiedSlotInfo } from '../types';

interface ScheduleGridProps {
  boxes: string[];
  occupiedSlots: Map<string, Record<string, OccupiedSlotInfo>>;
  selectedBox: string | null;
  selectedSlots: Set<string>;
  onSlotClick: (box: string, time: string) => void;
  // MODIFICADO: Firma actualizada para soportar el Modal de Borrado por Rango
  onDeleteReservation: (info: OccupiedSlotInfo, time: string, boxName: string) => void;
  getCalendarIdForBox: (box: string) => string | undefined;
  isLoading: boolean;
  activeFilterBox: string;
  searchTerm: string; // Nueva propiedad para búsqueda
}

const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  boxes,
  occupiedSlots,
  selectedBox,
  selectedSlots,
  onSlotClick,
  onDeleteReservation,
  getCalendarIdForBox,
  isLoading,
  activeFilterBox,
  searchTerm
}) => {
  const visibleBoxes = useMemo(() => {
    if (!activeFilterBox || activeFilterBox === 'all') return boxes;
    return boxes.filter(b => b === activeFilterBox);
  }, [boxes, activeFilterBox]);

  const timeIntervals = useMemo(() => {
    const times = [];
    for (let hour = 8; hour < 20; hour++) {
      for (let min = 0; min < 60; min += 30) {
        times.push(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
      }
    }
    return times;
  }, []);

  if (isLoading) {
    return (
      <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 font-medium">Cargando disponibilidad...</p>
      </div>
    );
  }

  if (visibleBoxes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8 text-slate-400 bg-slate-50/50">
        No hay boxes configurados en este centro o filtro.
      </div>
    );
  }

  const gridTemplateColumns = `70px repeat(${visibleBoxes.length}, minmax(140px, 1fr))`;

  return (
    <div className="h-full overflow-auto custom-scrollbar relative bg-white">
      <div className="grid" style={{ gridTemplateColumns }}>
        
        {/* Header Row */}
        <div className="sticky top-0 left-0 z-30 bg-white border-b border-slate-100 h-14"></div>
        {visibleBoxes.map(box => (
          <div key={box} className="sticky top-0 z-20 bg-white border-b border-slate-100 h-14 flex items-center justify-center font-bold text-slate-700 text-sm px-2 shadow-sm">
             <span className="truncate">{box}</span>
          </div>
        ))}

        {/* Time Rows */}
        {timeIntervals.map((time) => (
          <React.Fragment key={time}>
            {/* Time Label */}
            <div className="sticky left-0 z-10 bg-slate-50 border-r border-slate-100 text-xs font-semibold text-slate-400 flex items-center justify-center h-16">
              {time}
            </div>

            {/* Slots */}
            {visibleBoxes.map(box => {
              const boxOccupied = occupiedSlots.get(box) || {};
              const occupiedInfo = boxOccupied[time];
              const isSelected = selectedBox === box && selectedSlots.has(time);

              // --- LÓGICA DE BÚSQUEDA (Visual) ---
              const isSearchActive = searchTerm.length > 0;
              let isMatch = false;
              let isDimmed = false;

              if (occupiedInfo) {
                  if (isSearchActive) {
                      const term = searchTerm.toLowerCase();
                      const matchName = occupiedInfo.summary.toLowerCase().includes(term);
                      const matchObs = occupiedInfo.observation && occupiedInfo.observation.toLowerCase().includes(term);
                      
                      if (matchName || matchObs) {
                          isMatch = true;
                      } else {
                          isDimmed = true;
                      }
                  }
              }
              // -----------------------------------

              return (
                <div key={`${box}-${time}`} className="h-16 p-2 border-b border-r border-slate-50 flex items-center justify-center relative group">
                  {occupiedInfo ? (
                    <div className={`
                        w-full h-full border rounded-lg px-3 flex flex-col justify-center text-xs relative overflow-hidden transition-all duration-300
                        ${isMatch 
                            ? 'bg-yellow-50 border-yellow-400 ring-4 ring-yellow-200/50 z-10 scale-105 shadow-lg' 
                            : isDimmed 
                                ? 'bg-slate-50 border-slate-100 text-slate-300 opacity-40' 
                                : 'bg-slate-100 border-slate-200 text-slate-600 hover:shadow-md'
                        }
                    `}>
                      {!isDimmed && <div className={`absolute left-0 top-0 bottom-0 w-1 ${isMatch ? 'bg-yellow-500' : 'bg-slate-400'}`}></div>}
                      
                      <span className="font-semibold truncate leading-tight" title={occupiedInfo.summary}>
                        {occupiedInfo.summary || 'Reservado'}
                      </span>
                      
                      {occupiedInfo.observation && (
                          <span className="text-[10px] truncate opacity-80" title={occupiedInfo.observation}>
                              {occupiedInfo.observation}
                          </span>
                      )}

                      <button
                        onClick={(e) => {
                            e.stopPropagation();
                            // MODIFICADO: Llama a la función del padre (App.tsx) que abre el Modal
                            onDeleteReservation(occupiedInfo, time, box);
                        }}
                        className={`absolute top-1 right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors shadow-sm z-20
                            ${isMatch ? 'text-yellow-600 opacity-100' : 'text-slate-400 opacity-0 group-hover:opacity-100'}
                        `}
                        title="Eliminar reserva"
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSlotClick(box, time)}
                      className={`w-full h-full rounded-lg text-sm font-medium transition-all duration-200 border
                        ${isSelected 
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200 scale-[1.02]' 
                          : isSearchActive 
                             ? 'bg-white border-transparent' // Ocultar '+' si buscamos para limpiar vista
                             : 'bg-white border-transparent text-transparent hover:border-indigo-100 hover:bg-indigo-50 hover:text-indigo-400'
                        }
                      `}
                    >
                      {isSelected ? 'Reservar' : (!isSearchActive && '+')}
                    </button>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ScheduleGrid;