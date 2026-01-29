import { useState, useMemo, useCallback } from 'react';
import { Reservation, Box } from '../types';

export type Granularity = 'day' | 'week' | 'month';

export interface DayConfig {
  start: number;
  end: number;
  isOpen: boolean;
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
  businessHours: BusinessHours,
  selectedBoxId: string // <--- NUEVO PARÁMETRO
) => {

  // 1. Filtrado Preliminar por Box y Separación de Status
  const { activeData, cancelledData } = useMemo(() => {
    const active: Reservation[] = [];
    const cancelled: Reservation[] = [];
    
    rawData.forEach(r => {
      // FILTRO POR BOX: Si no es 'all' y no coincide, ignorar registro
      if (selectedBoxId !== 'all' && r.boxId !== selectedBoxId) {
        return;
      }

      // Separar por estado (asumiendo que status 'cancelled' existe en tu DB)
      // Si usas soft-delete o un campo booleano, ajusta esta condición.
      if (r.status === 'cancelled') {
        cancelled.push(r);
      } else {
        active.push(r);
      }
    });
    return { activeData: active, cancelledData: cancelled };
  }, [rawData, selectedBoxId]); // Recalcular si cambia la data o el box seleccionado

  // 2. Cálculo de Tasa de Cancelación (Fórmula solicitada)
  const cancellationRate = useMemo(() => {
    const totalReservas = activeData.length + cancelledData.length;
    if (totalReservas === 0) return "0.0";
    
    // (Horas Canceladas / Horas Totales) * 100
    // En tu sistema de bloques fijos, contar reservas es equivalente a contar horas.
    return ((cancelledData.length / totalReservas) * 100).toFixed(1);
  }, [activeData, cancelledData]);

  // 3. Cálculo de Capacidad Dinámica (Ajustado por Box seleccionado)
  const totalCapacity = useMemo(() => {
    let totalSlotsPerBox = 0;
    const current = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    if (isNaN(current.getTime()) || isNaN(end.getTime())) return 0;

    const tempDate = new Date(current);
    let safety = 0;
    
    while (tempDate <= end && safety < 1000) {
      const day = tempDate.getDay();
      let config: DayConfig | null = null;

      if (day >= 1 && day <= 4) config = businessHours.weekdays;
      else if (day === 5) config = businessHours.friday;
      else if (day === 6) config = businessHours.saturday;
      else config = businessHours.sunday;

      if (config && config.isOpen) {
        const hours = config.end - config.start;
        if (hours > 0) totalSlotsPerBox += Math.floor(hours * 2); 
      }
      tempDate.setDate(tempDate.getDate() + 1);
      safety++;
    }

    // Si seleccionó un Box específico, la capacidad es esa.
    // Si seleccionó 'all', la capacidad es la suma de todos los boxes disponibles.
    const numberOfBoxes = selectedBoxId !== 'all' ? 1 : allBoxes.length;
    
    return totalSlotsPerBox * numberOfBoxes;
  }, [startDate, endDate, businessHours, allBoxes.length, selectedBoxId]);

  // 4. Timeline
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

  // 5. Ocupación por Box (Solo relevante si vemos todos, pero útil para comparar)
  const occupancyData = useMemo(() => {
    // Si hay un box seleccionado, solo mostramos ese box en el gráfico vertical
    const boxesToAnalyze = selectedBoxId !== 'all' 
      ? allBoxes.filter(b => b.id === selectedBoxId) 
      : allBoxes;

    const usageMap: Record<string, number> = {};
    boxesToAnalyze.forEach(b => { usageMap[b.name] = 0; });

    activeData.forEach(r => {
      if (usageMap[r.boxName] !== undefined) usageMap[r.boxName]++;
    });

    // Capacidad individual por box (para el gráfico de barras comparativo)
    const singleBoxCapacity = totalCapacity / (selectedBoxId !== 'all' ? 1 : allBoxes.length);

    return Object.entries(usageMap).map(([boxName, occupiedCount]) => {
        const cap = singleBoxCapacity > 0 ? singleBoxCapacity : 1;
        const occupiedPct = singleBoxCapacity === 0 ? 0 : parseFloat(((occupiedCount / cap) * 100).toFixed(1));
      
      return {
        name: boxName,
        occupied: occupiedCount,
        capacity: cap,
        occupiedPct: occupiedPct > 100 ? 100 : occupiedPct
      };
    }).sort((a, b) => b.occupiedPct - a.occupiedPct);
  }, [allBoxes, activeData, totalCapacity, selectedBoxId]);

  return {
    activeData,
    cancelledData,
    cancellationRate, // <--- EXPORTADO
    totalCapacity,
    getTimelineData,
    occupancyData
  };
};