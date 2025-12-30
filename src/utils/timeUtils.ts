// src/utils/timeUtils.ts

// Función para pausar la ejecución (evitar rate limiting)
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Convertir string a hora chilena real
export const parseChileanDate = (dateString: string): Date => {
  if (!dateString) return new Date();
  // Limpiamos el string para quitar el "+00" y dejarlo como "YYYY-MM-DDTHH:mm:ss"
  const cleanDate = dateString.split('+')[0].trim().replace(' ', 'T');
  // Creamos una fecha asumiendo que esos números son UTC (la 'Z' al final lo indica).
  const date = new Date(cleanDate + 'Z');
  return date;
};