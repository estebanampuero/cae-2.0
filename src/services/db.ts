import { db } from '../firebase';
import { 
  collection, getDocs, addDoc, query, where, deleteDoc, doc, orderBy, writeBatch, updateDoc 
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

// --- RESERVATIONS (SOFT DELETE LOGIC) ---

export const getReservationsForDate = async (orgId: string, centerId: string, date: Date): Promise<Reservation[]> => {
  if (!orgId) return [];
  const q = query(collection(db, 'reservations'), where('orgId', '==', orgId), where('centerId', '==', centerId));
  const snapshot = await getDocs(q);
  const allReservations = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const datePrefix = `${year}-${month}-${day}`;

  // FILTRO MEMORIA: Solo devolvemos las activas para mostrar en el calendario
  return allReservations.filter(r => 
      r.startTime.startsWith(datePrefix) && 
      r.status !== 'cancelled' // <--- CLAVE PARA NO MOSTRAR BORRADAS
  );
};

// --- OPTIMIZACIÓN: Filtrado directo en BD por rango de fechas ---
export const getReservationsInRange = async (orgId: string, start: Date, end: Date, centerId?: string): Promise<Reservation[]> => {
    if (!orgId) return [];
    
    // Generamos strings simples YYYY-MM-DD para usarlos como límites
    const startStr = start.toISOString().split('T')[0];
    
    // Para el final, sumamos 1 día para asegurar que incluimos todo el día final
    const endObj = new Date(end);
    endObj.setDate(endObj.getDate() + 1);
    const endStr = endObj.toISOString().split('T')[0];

    // Construimos la query OPTIMIZADA
    let constraints = [
      where('orgId', '==', orgId),
      where('startTime', '>=', startStr), // Trae desde la fecha inicio...
      where('startTime', '<', endStr)     // ...hasta antes del día siguiente al fin
    ];
    
    if (centerId) {
      constraints.push(where('centerId', '==', centerId));
    }
    
    const q = query(collection(db, 'reservations'), ...constraints);
    
    // Esta llamada ahora descarga SOLO los datos necesarios
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
};

export const createReservationDB = async (res: Omit<Reservation, 'id' | 'createdAt'>) => {
  await addDoc(collection(db, 'reservations'), { 
      ...res, 
      status: 'active', // <--- POR DEFECTO ACTIVA
      createdAt: Date.now() 
  });
};

// SOFT DELETE SINGLE
export const deleteReservationDB = async (reservationId: string) => {
  // En lugar de deleteDoc, hacemos updateDoc status='cancelled'
  const ref = doc(db, 'reservations', reservationId);
  await updateDoc(ref, {
      status: 'cancelled',
      cancelledAt: Date.now()
  });
};

// SOFT DELETE RANGE
export const deleteReservationsInRange = async (
  orgId: string,
  centerId: string,
  boxId: string,
  doctorName: string,
  targetTime: string,
  startDate: string,
  endDate: string
): Promise<number> => {
    const startIso = new Date(`${startDate}T00:00:00`).toISOString();
    const endObj = new Date(`${endDate}T00:00:00`);
    endObj.setHours(23, 59, 59, 999);
    const endIso = endObj.toISOString();

    const q = query(
        collection(db, 'reservations'),
        where('orgId', '==', orgId),
        where('centerId', '==', centerId),
        where('boxId', '==', boxId),
        where('doctorName', '==', doctorName),
        where('status', '!=', 'cancelled') // Solo buscar las que están activas
    );

    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    let count = 0;

    snapshot.docs.forEach(docSnap => {
        const data = docSnap.data() as Reservation;
        if (data.startTime >= startIso && data.startTime <= endIso) {
            const localTime = getChileTime(data.startTime);
            if (localTime === targetTime) {
                // SOFT DELETE EN BATCH
                batch.update(docSnap.ref, { 
                    status: 'cancelled',
                    cancelledAt: Date.now()
                });
                count++;
            }
        }
    });

    if (count > 0) {
        await batch.commit();
    }
    return count;
};

// --- UPDATE RESERVATION NOTE (NUEVO) ---
export const updateReservationNote = async (reservationId: string, newObservation: string) => {
  try {
    const reservationRef = doc(db, 'reservations', reservationId);
    await updateDoc(reservationRef, {
      observation: newObservation
    });
    console.log("Nota actualizada correctamente");
  } catch (e) {
    console.error("Error actualizando nota: ", e);
    throw e;
  }
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