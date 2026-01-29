export interface Center {
  id: string;
  name: string;
  orgId: string;
}

export interface Box {
  id: string;
  name: string;
  centerId: string;
  orgId: string;
}

export interface Doctor {
  id: string;
  name: string;
  centerId: string; 
  orgId: string;
}

export interface Reservation {
  id: string;
  orgId: string;
  centerId: string;
  boxId: string;
  boxName: string;
  doctorName: string;
  observation?: string;
  startTime: string; 
  endTime: string; 
  userId: string;
  originalEventId?: string;
  createdAt: number;
  
  // --- NUEVOS CAMPOS SOFT DELETE ---
  status?: 'active' | 'cancelled'; // Opcional para soportar datos viejos (undefined = active)
  cancelledAt?: number;
}

export interface ReservationSlot {
  time: string; 
  box: string;
}

export interface OccupiedSlotInfo {
  eventId: string;
  summary: string;
  observation?: string;
  boxId: string;
  startIso: string;
}

export interface BoxAvailability {
  boxName: string;
  occupied: Record<string, OccupiedSlotInfo>; 
}

export type UserRole = 'owner' | 'editor' | 'viewer';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  orgId: string;
  role: UserRole;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}