// --- UTILS PARA CHILE ---

// Obtiene el offset manual (para guardar)
export const getSantiagoOffset = (date: Date): string => {
  const year = date.getFullYear();
  // Lógica aproximada cambio de hora Chile (Primer Sábado Abril / Septiembre)
  const firstOfSep = new Date(year, 8, 1);
  const firstSaturdaySep = new Date(firstOfSep);
  firstSaturdaySep.setDate(1 + (6 - firstOfSep.getDay() + 7) % 7);
  firstSaturdaySep.setHours(23, 59, 59);

  const firstOfApr = new Date(year, 3, 1);
  const firstSaturdayApr = new Date(firstOfApr);
  firstSaturdayApr.setDate(1 + (6 - firstOfApr.getDay() + 7) % 7);
  firstSaturdayApr.setHours(23, 59, 59);

  return date >= firstSaturdaySep || date < firstSaturdayApr ? '-03:00' : '-04:00';
};

export const formatToISOWithOffset = (date: Date, time: string): string => {
  const [hours, minutes] = time.split(':');
  const dateWithTime = new Date(date);
  dateWithTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  
  const year = dateWithTime.getFullYear();
  const month = String(dateWithTime.getMonth() + 1).padStart(2, '0');
  const day = String(dateWithTime.getDate()).padStart(2, '0');
  
  const offset = getSantiagoOffset(dateWithTime);
  
  // Guardamos con el offset explícito para que Firebase lo entienda bien
  return `${year}-${month}-${day}T${time}:00${offset}`;
};

export const getMonthName = (date: Date): string => {
  return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" }).replace(/^\w/, (c) => c.toUpperCase());
};

export const getDayName = (date: Date): string => {
  return date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
};

// --- NUEVA FUNCIÓN CLAVE ---
// Toma cualquier string ISO (UTC o Offset) y devuelve la hora HH:mm en Chile
export const getChileTime = (isoString: string): string => {
  if (!isoString) return '';
  const date = new Date(isoString);
  
  // Usamos Intl nativo para forzar la zona horaria de Chile
  // Esto maneja automáticamente el cambio de hora (invierno/verano)
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
};