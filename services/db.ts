import { db } from '../firebase';
import { 
  collection, getDocs, addDoc, query, where, deleteDoc, doc, orderBy 
} from 'firebase/firestore';
import { Center, Box, Doctor, Reservation, OccupiedSlotInfo } from '../types';
import { getChileTime } from '../utils/dateUtils';

// --- CENTERS (CAEs) ---
export const getCenters = async (): Promise<Center[]> => {
  const q = query(collection(db, 'centers'), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Center));
};

export const addCenter = async (name: string): Promise<Center> => {
  const ref = await addDoc(collection(db, 'centers'), { name });
  return { id: ref.id, name };
};

// --- BOXES ---
export const getBoxes = async (centerId?: string): Promise<Box[]> => {
  const colRef = collection(db, 'boxes');
  const q = centerId 
    ? query(colRef, where('centerId', '==', centerId))
    : query(colRef);
  
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(d => ({ id: d.id, ...d.data() } as Box))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
};

export const addBox = async (name: string, centerId: string): Promise<Box> => {
  const ref = await addDoc(collection(db, 'boxes'), { name, centerId });
  return { id: ref.id, name, centerId };
};

// --- DOCTORS ---
export const getDoctors = async (centerId?: string): Promise<Doctor[]> => {
  const colRef = collection(db, 'doctors');
  const q = centerId
    ? query(colRef, where('centerId', '==', centerId))
    : query(colRef);

  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Doctor)).sort((a,b) => a.name.localeCompare(b.name));
};

export const addDoctor = async (name: string, centerId: string): Promise<Doctor> => {
  const ref = await addDoc(collection(db, 'doctors'), { name, centerId });
  return { id: ref.id, name, centerId };
};

// --- RESERVATIONS ---

export const getReservationsForDate = async (centerId: string, date: Date): Promise<Reservation[]> => {
  // Query simple por CenterId
  const q = query(
    collection(db, 'reservations'), 
    where('centerId', '==', centerId)
  );

  const snapshot = await getDocs(q);
  const allReservations = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const datePrefix = `${year}-${month}-${day}`;

  return allReservations.filter(r => r.startTime.startsWith(datePrefix));
};

// Actualizado para asegurar cobertura total del día final
export const getReservationsInRange = async (start: Date, end: Date, centerId?: string): Promise<Reservation[]> => {
    let q = query(collection(db, 'reservations'));
    
    if (centerId) {
        q = query(collection(db, 'reservations'), where('centerId', '==', centerId));
    }

    const snapshot = await getDocs(q);
    const reservations = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));

    // Convertir a string ISO para comparación
    const startIso = start.toISOString();
    // Ajustar el fin al último milisegundo si viene como fecha base
    const endAdjusted = new Date(end);
    endAdjusted.setHours(23, 59, 59, 999);
    const endIso = endAdjusted.toISOString();

    return reservations.filter(r => r.startTime >= startIso && r.startTime <= endIso);
};

export const createReservationDB = async (res: Omit<Reservation, 'id' | 'createdAt'>) => {
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
      observation: res.observation // Mapeamos la observación
    };
  });

  return map;
};