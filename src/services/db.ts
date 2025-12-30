import { db } from '../firebase';
import { 
  collection, getDocs, addDoc, query, where, deleteDoc, doc, orderBy, limit 
} from 'firebase/firestore';
import { Center, Box, Doctor, Reservation, OccupiedSlotInfo } from '../types';
import { getChileTime } from '../utils/dateUtils';

// --- CENTERS (CAEs) ---
// Obtiene solo los centros de la organización del usuario
export const getCenters = async (orgId: string): Promise<Center[]> => {
  if (!orgId) return [];
  const q = query(
    collection(db, 'centers'), 
    where('orgId', '==', orgId),
    orderBy('name')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Center));
};

export const addCenter = async (name: string, orgId: string): Promise<Center> => {
  const ref = await addDoc(collection(db, 'centers'), { name, orgId });
  return { id: ref.id, name, orgId };
};

// --- BOXES ---
// Obtiene boxes. Si se pasa centerId, filtra específicamente por ese centro.
export const getBoxes = async (orgId: string, centerId?: string): Promise<Box[]> => {
  if (!orgId) return [];
  
  const constraints = [where('orgId', '==', orgId)];
  
  // Relación Crítica: Box pertenece a un Centro
  if (centerId) {
    constraints.push(where('centerId', '==', centerId));
  }

  const q = query(collection(db, 'boxes'), ...constraints);
  
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(d => ({ id: d.id, ...d.data() } as Box))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
};

export const addBox = async (name: string, centerId: string, orgId: string): Promise<Box> => {
  const ref = await addDoc(collection(db, 'boxes'), { name, centerId, orgId });
  return { id: ref.id, name, centerId, orgId };
};

// --- DOCTORS ---
// Obtiene médicos. Vital filtrar por centerId para que el dropdown de la App muestre los correctos.
export const getDoctors = async (orgId: string, centerId?: string): Promise<Doctor[]> => {
  if (!orgId) return [];

  const constraints = [where('orgId', '==', orgId)];
  
  // Relación Crítica: Médico asignado a un Centro
  if (centerId) {
    constraints.push(where('centerId', '==', centerId));
  }

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

  // Filtramos estrictamente por Org y Centro para que la grilla no mezcle datos
  const q = query(
    collection(db, 'reservations'), 
    where('orgId', '==', orgId),
    where('centerId', '==', centerId)
  );

  const snapshot = await getDocs(q);
  const allReservations = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));

  // Filtro de fecha en memoria (Más rápido y barato que índices complejos de fecha para este caso)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const datePrefix = `${year}-${month}-${day}`;

  return allReservations.filter(r => r.startTime.startsWith(datePrefix));
};

export const getReservationsInRange = async (orgId: string, start: Date, end: Date, centerId?: string): Promise<Reservation[]> => {
    if (!orgId) return [];

    let constraints = [where('orgId', '==', orgId)];
    
    // Si el panel de analytics tiene seleccionado un centro, filtramos.
    if (centerId) {
        constraints.push(where('centerId', '==', centerId));
    }

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
  // Guardamos todos los IDs de relación para mantener integridad
  await addDoc(collection(db, 'reservations'), {
    ...res,
    createdAt: Date.now()
  });
};

export const deleteReservationDB = async (reservationId: string) => {
  await deleteDoc(doc(db, 'reservations', reservationId));
};

export const mapReservationsToSlots = (reservations: Reservation[]): Map<string, Record<string, OccupiedSlotInfo>> => {
  const map = new Map<string, Record<string, OccupiedSlotInfo>>();
  
  reservations.forEach(res => {
    const boxName = res.boxName;
    const time = getChileTime(res.startTime);  
    
    if (!map.has(boxName)) {
      map.set(boxName, {});
    }
    
    const boxSlots = map.get(boxName)!;
    boxSlots[time] = {
      eventId: res.id,
      summary: res.doctorName,
      observation: res.observation 
    };
  });

  return map;
};