// Define explícitamente la zona horaria de Chile para evitar inconsistencias
const CHILE_TZ = 'America/Santiago';

/**
 * Genera un ISO String (ej: "2024-05-20T08:00:00.000-04:00") 
 * combinando una fecha base y una hora (ej: "08:00"), 
 * calculando el OFFSET correcto para ESE día específico en Chile (Invierno vs Verano).
 */
export const formatToISOWithOffset = (date: Date, timeStr: string): string => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // Creamos la fecha usando el constructor local.
  // JS usará la configuración regional del sistema para asignar el offset correcto (GMT-3 o GMT-4)
  // según la fecha histórica (Enero vs Julio).
  const targetDate = new Date(year, month, day, hours, minutes, 0, 0);
  
  return toLocalISOString(targetDate);
};

/**
 * Helper interno para convertir una fecha a formato ISO preservando 
 * la zona horaria y offset local (en lugar de convertir a UTC Z).
 */
const toLocalISOString = (date: Date): string => {
  const tzo = -date.getTimezoneOffset();
  const dif = tzo >= 0 ? '+' : '-';
  const pad = (num: number) => (num < 10 ? '0' : '') + num;

  return date.getFullYear() +
    '-' + pad(date.getMonth() + 1) +
    '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) +
    ':' + pad(date.getMinutes()) +
    ':' + pad(date.getSeconds()) +
    dif + pad(Math.floor(Math.abs(tzo) / 60)) +
    ':' + pad(Math.abs(tzo) % 60);
};

export const getMonthName = (date: Date): string => {
  return new Intl.DateTimeFormat('es-CL', {
    month: 'long',
    year: 'numeric',
    timeZone: CHILE_TZ
  }).format(date).replace(/^\w/, (c) => c.toUpperCase());
};

export const getDayName = (date: Date): string => {
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: CHILE_TZ
  }).format(date);
};

/**
 * Toma cualquier string ISO (UTC o con Offset) y devuelve la hora HH:mm en Chile
 * ajustada automáticamente al horario de esa fecha.
 */
export const getChileTime = (isoString: string): string => {
  if (!isoString) return '';
  const date = new Date(isoString);
  
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: CHILE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
};