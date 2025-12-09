export interface Center {
  id: string;
  name: string;
}

export interface Box {
  id: string;
  name: string;
  centerId: string;
}

export interface Doctor {
  id: string;
  name: string;
  centerId: string; // Associated center
}

export interface Reservation {
  id: string;
  centerId: string;
  boxId: string;
  boxName: string; // Denormalized for easier display
  doctorName: string;
  observation?: string; // Nuevo campo
  startTime: string; // ISO String
  endTime: string; // ISO String
  userId: string; // Who created it
  createdAt: number;
}

export interface ReservationSlot {
  time: string; // "HH:mm"
  box: string;
}

export interface OccupiedSlotInfo {
  eventId: string; // This will now be the Firestore Document ID
  summary: string; // Doctor name usually
  observation?: string; // Para mostrar en el tooltip
}

// Helper for the grid availability map
export interface BoxAvailability {
  boxName: string;
  occupied: Record<string, OccupiedSlotInfo>; // Key is time "HH:mm"
}