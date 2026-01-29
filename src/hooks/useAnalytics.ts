import { useState, useMemo, useCallback } from 'react';
import { Reservation, Box } from '../types';

export type Granularity = 'day' | 'week' | 'month';

// 1. Modificamos la interfaz para incluir 'isOpen'
export interface DayConfig {
  start: number;
  end: number;
  isOpen: boolean; // <--- Nuevo campo
}

export interface BusinessHours {
  weekdays: DayConfig;
  friday: DayConfig;
  saturday: DayConfig;
  sunday: DayConfig;
}

export const useAnalytics = (
  rawData: Reservation[], 
  allBoxes: Box[], 
  startDate: string, 
  endDate: string,
  businessHours: BusinessHours
) => {

  const { activeData, cancelledData } = useMemo(() => {
    const active: Reservation[] = [];
    const cancelled: Reservation[] = [];
    
    rawData.forEach(r => {
      if (r.status === 'cancelled') cancelled.push(r);
      else active.push(r);
    });
    return { activeData: active, cancelledData: cancelled };
  }, [rawData]);

  // 2. Cálculo de Capacidad con el filtro de 'isOpen'
  const totalCapacityPerBox = useMemo(() => {
    let totalSlots = 0;
    const current = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    if (isNaN(current.getTime()) || isNaN(end.getTime())) return 0;

    const tempDate = new Date(current);
    
    // Bucle de seguridad (evitar loops infinitos si las fechas están mal)
    let safety = 0;
    while (tempDate <= end && safety < 1000) {
      const day = tempDate.getDay(); // 0=Dom, 1=Lun...
      let config: DayConfig | null = null;

      // Seleccionar configuración según el día
      if (day >= 1 && day <= 4) config = businessHours.weekdays;
      else if (day === 5) config = businessHours.friday;
      else if (day === 6) config = businessHours.saturday;
      else config = businessHours.sunday;

      // LA LÓGICA CLAVE: Solo sumar si está configurado como "Abierto"
      if (config && config.isOpen) {
        const hours = config.end - config.start;
        if (hours > 0) totalSlots += Math.floor(hours * 2); // Bloques de 30 min
      }

      tempDate.setDate(tempDate.getDate() + 1);
      safety++;
    }
    return totalSlots;
  }, [startDate, endDate, businessHours]);

  const getTimelineData = useCallback((granularity: Granularity) => {
    const map: Record<string, number> = {};
    
    activeData.forEach(r => {
      const date = new Date(r.startTime);
      let key = '';

      if (granularity === 'day') key = r.startTime.split('T')[0];
      else if (granularity === 'month') key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      else if (granularity === 'week') {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        d.setDate(diff);
        key = d.toISOString().split('T')[0];
      }

      map[key] = (map[key] || 0) + 1;
    });

    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, reservas: value }));
  }, [activeData]);

  const occupancyData = useMemo(() => {
    const usageMap: Record<string, number> = {};
    allBoxes.forEach(b => { usageMap[b.name] = 0; });

    activeData.forEach(r => {
      if (usageMap[r.boxName] !== undefined) usageMap[r.boxName]++;
    });

    return Object.entries(usageMap).map(([boxName, occupiedCount]) => {
      const capacity = totalCapacityPerBox > 0 ? totalCapacityPerBox : 1; // Evitar división por cero
      
      // Si la capacidad es 0 (ej: rango de fechas donde está todo cerrado), ocupación es 0
      const occupiedPct = totalCapacityPerBox === 0 ? 0 : parseFloat(((occupiedCount / capacity) * 100).toFixed(1));
      
      return {
        name: boxName,
        occupied: occupiedCount,
        capacity: capacity,
        occupiedPct: occupiedPct > 100 ? 100 : occupiedPct
      };
    }).sort((a, b) => b.occupiedPct - a.occupiedPct);
  }, [allBoxes, activeData, totalCapacityPerBox]);

  return {
    activeData,
    cancelledData,
    totalCapacityPerBox,
    getTimelineData,
    occupancyData
  };
};