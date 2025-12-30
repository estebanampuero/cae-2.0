import { db } from '../firebase';
import { 
  collection, getDocs, addDoc, query, where, deleteDoc, doc, orderBy, writeBatch 
} from 'firebase/firestore';
import { Center, Box, Doctor, Reservation, OccupiedSlotInfo } from '../types';
import { getChileTime } from '../utils/dateUtils';

// --- CENTERS ---
export const getCenters = async (orgId: string): Promise<Center[]> => {
  if (!orgId) return [];
  const q = query(collection(db, 'centers'), where('orgId', '==', orgId), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Center));
};

export const addCenter = async (name: string, orgId: string): Promise<Center> => {
  const ref = await addDoc(collection(db, 'centers'), { name, orgId });
  return { id: ref.id, name, orgId };
};

// --- BOXES ---
export const getBoxes = async (orgId: string, centerId?: string): Promise<Box[]> => {
  if (!orgId) return [];
  const constraints = [where('orgId', '==', orgId)];
  if (centerId) constraints.push(where('centerId', '==', centerId));
  const q = query(collection(db, 'boxes'), ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Box)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
};

export const addBox = async (name: string, centerId: string, orgId: string): Promise<Box> => {
  const ref = await addDoc(collection(db, 'boxes'), { name, centerId, orgId });
  return { id: ref.id, name, centerId, orgId };
};

// --- DOCTORS ---
export const getDoctors = async (orgId: string, centerId?: string): Promise<Doctor[]> => {
  if (!orgId) return [];
  const constraints = [where('orgId', '==', orgId)];
  if (centerId) constraints.push(where('centerId', '==', centerId));
  const q = query(collection(db, 'doctors'), ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Doctor)).sort((a,b) => a.name.localeCompare(b.name));
};

export const addDoctor = async (name: string, centerId: string, orgId: string): Promise<Doctor> => {
  const ref = await addDoc(collection(db, 'doctors'), { name, centerId, orgId });
  return { id: ref.id, name, centerId, orgId };
};

// --- RESERVATIONS ---
export const getReservationsForDate = async (orgId: string, centerId: string, date: Date): Promise<Reservation[]> => {
  if (!orgId) return [];
  const q = query(collection(db, 'reservations'), where('orgId', '==', orgId), where('centerId', '==', centerId));
  const snapshot = await getDocs(q);
  const allReservations = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const datePrefix = `${year}-${month}-${day}`;
  return allReservations.filter(r => r.startTime.startsWith(datePrefix));
};

export const getReservationsInRange = async (orgId: string, start: Date, end: Date, centerId?: string): Promise<Reservation[]> => {
    if (!orgId) return [];
    let constraints = [where('orgId', '==', orgId)];
    if (centerId) constraints.push(where('centerId', '==', centerId));
    const q = query(collection(db, 'reservations'), ...constraints);
    const snapshot = await getDocs(q);
    const reservations = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
    const startIso = start.toISOString();
    const endAdjusted = new Date(end);
    endAdjusted.setHours(23, 59, 59, 999);
    const endIso = endAdjusted.toISOString();
    return reservations.filter(r => r.startTime >= startIso && r.startTime <= endIso);
};

export const createReservationDB = async (res: Omit<Reservation, 'id' | 'createdAt'>) => {
  await addDoc(collection(db, 'reservations'), { ...res, createdAt: Date.now() });
};

export const deleteReservationDB = async (reservationId: string) => {
  await deleteDoc(doc(db, 'reservations', reservationId));
};

// --- NUEVA FUNCIÓN: BORRAR POR RANGO DE FECHAS Y HORA ESPECÍFICA ---
export const deleteReservationsInRange = async (
  orgId: string,
  centerId: string,
  boxId: string,
  doctorName: string,
  targetTime: string, // "HH:mm"
  startDate: string, // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
): Promise<number> => {
    // 1. Obtener todas las reservas en el rango de fechas para esa Org/Centro/Box/Médico
    // Para simplificar query (evitar índices complejos), traemos el rango y filtramos en memoria.
    
    const startIso = new Date(`${startDate}T00:00:00`).toISOString();
    const endObj = new Date(`${endDate}T00:00:00`);
    endObj.setHours(23, 59, 59, 999);
    const endIso = endObj.toISOString();

    const q = query(
        collection(db, 'reservations'),
        where('orgId', '==', orgId),
        where('centerId', '==', centerId),
        where('boxId', '==', boxId),
        where('doctorName', '==', doctorName)
        // No filtramos por fecha en query para evitar error de indice compuesto si no existe,
        // o puedes agregar where('startTime', '>=', startIso) si ya tienes el indice.
        // Haremos filtro en memoria para máxima seguridad sin configurar indices ahora.
    );

    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    let count = 0;

    snapshot.docs.forEach(docSnap => {
        const data = docSnap.data() as Reservation;
        
        // Filtro 1: Rango de Fechas
        if (data.startTime >= startIso && data.startTime <= endIso) {
            // Filtro 2: Hora exacta (ej: "08:00")
            // Convertimos la hora de la reserva a hora chilena para comparar
            const localTime = getChileTime(data.startTime);
            
            if (localTime === targetTime) {
                batch.delete(docSnap.ref);
                count++;
            }
        }
    });

    if (count > 0) {
        await batch.commit();
    }
    return count;
};


export const mapReservationsToSlots = (reservations: Reservation[]): Map<string, Record<string, OccupiedSlotInfo>> => {
  const map = new Map<string, Record<string, OccupiedSlotInfo>>();
  reservations.forEach(res => {
    const boxName = res.boxName;
    const time = getChileTime(res.startTime);  
    if (!map.has(boxName)) map.set(boxName, {});
    const boxSlots = map.get(boxName)!;
    boxSlots[time] = {
      eventId: res.id,
      summary: res.doctorName,
      observation: res.observation,
      boxId: res.boxId,
      startIso: res.startTime
    };
  });
  return map;
};