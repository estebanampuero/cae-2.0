// src/services/adminBulkActions.ts
import { db } from '../firebase'; // Ajusta la ruta a tu config de firebase
import { 
  writeBatch, doc, collection, getDocs, updateDoc, getCountFromServer 
} from 'firebase/firestore';
import { addCenter, addBox, addDoctor, getCenters, getBoxes, getDoctors } from './db'; // Ajusta ruta a tus servicios existentes
import { delay, parseChileanDate } from '../utils/timeUtils';

type LogCallback = (msg: string) => void;

// --- VERIFICAR CANTIDAD ---
export const countReservationsInCloud = async (): Promise<number> => {
    const coll = collection(db, "reservations");
    const snapshot = await getCountFromServer(coll);
    return snapshot.data().count;
};

// --- RESCATE DE DATOS HUÉRFANOS ---
export const rescueOrphanData = async (orgId: string, onLog: LogCallback) => {
    const collectionsToCheck = ['centers', 'boxes', 'doctors', 'reservations'];
    let totalMigrated = 0;

    for (const colName of collectionsToCheck) {
        onLog(`Analizando colección: ${colName}...`);
        
        const q = collection(db, colName);
        const snapshot = await getDocs(q);
        
        let batch = writeBatch(db);
        let batchCount = 0;
        let colMigrated = 0;

        for (const docSnapshot of snapshot.docs) {
            const data = docSnapshot.data();
            
            if (!data.orgId || data.orgId !== orgId) {
                batch.update(doc(db, colName, docSnapshot.id), { orgId: orgId });
                batchCount++;
                colMigrated++;
                totalMigrated++;
            }

            if (batchCount >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                batchCount = 0;
                await delay(500);
            }
        }

        if (batchCount > 0) await batch.commit();
        onLog(`  > ${colMigrated} documentos recuperados/reasignados en ${colName}`);
    }
    return totalMigrated;
};

// --- PROCESADORES DE CSV ---

export const processInfrastructureCSV = async (data: any[], orgId: string, onLog: LogCallback) => {
    const logs: string[] = [`Procesando ${data.length} filas de infraestructura...`];
    // Enviamos log inicial
    onLog(logs[0]);

    const currentCenters = await getCenters(orgId);
    const currentBoxes = await getBoxes(orgId);
    
    const centerMap = new Map(currentCenters.map(c => [c.name.toLowerCase().trim(), c]));
    const boxMap = new Map(currentBoxes.map(b => [`${b.centerId}_${b.name.toLowerCase().trim()}`, b]));

    let newCenters = 0;
    let newBoxes = 0;

    for (const row of data) {
        const rawCae = row.cae ? row.cae.trim() : '';
        const rawBox = row.box ? row.box.trim() : '';

        if (!rawCae || !rawBox) continue;

        let centerId = '';
        const centerKey = rawCae.toLowerCase();

        if (centerMap.has(centerKey)) {
            centerId = centerMap.get(centerKey)!.id;
        } else {
            const newC = await addCenter(rawCae, orgId);
            centerMap.set(centerKey, newC);
            centerId = newC.id;
            newCenters++;
            onLog(`[+] Nuevo CAE: ${rawCae}`);
        }

        const boxKey = `${centerId}_${rawBox.toLowerCase()}`;
        if (!boxMap.has(boxKey)) {
            const newB = await addBox(rawBox, centerId, orgId);
            boxMap.set(boxKey, newB);
            newBoxes++;
            if (newBoxes % 10 === 0) onLog(`[+] Agregados ${newBoxes} boxes...`);
        }
    }
    onLog(`FIN: Se crearon ${newCenters} CAEs y ${newBoxes} Boxes nuevos.`);
};

export const processDoctorsCSV = async (data: any[], orgId: string, onLog: LogCallback) => {
    onLog(`Procesando ${data.length} filas de médicos...`);

    const currentCenters = await getCenters(orgId);
    const currentDoctors = await getDoctors(orgId);

    const centerMap = new Map(currentCenters.map(c => [c.name.toLowerCase().trim(), c]));
    const doctorMap = new Map(currentDoctors.map(d => [`${d.centerId}_${d.name.toLowerCase().trim()}`, d]));

    let newDoctors = 0;

    for (const row of data) {
        const rawCae = row.cae ? row.cae.trim() : '';
        const rawMedico = row.medico ? row.medico.trim() : '';

        if (!rawCae || !rawMedico) continue;

        let centerId = '';
        const centerKey = rawCae.toLowerCase();

        if (centerMap.has(centerKey)) {
            centerId = centerMap.get(centerKey)!.id;
        } else {
            const newC = await addCenter(rawCae, orgId);
            centerMap.set(centerKey, newC);
            centerId = newC.id;
            onLog(`[+] Nuevo CAE creado por médico: ${rawCae}`);
        }

        const docKey = `${centerId}_${rawMedico.toLowerCase()}`;
        if (!doctorMap.has(docKey)) {
            const newD = await addDoctor(rawMedico, centerId, orgId);
            doctorMap.set(docKey, newD);
            newDoctors++;
            if (newDoctors % 5 === 0) onLog(`[+] Agregados ${newDoctors} médicos...`);
        }
    }
    onLog(`FIN: Se agregaron ${newDoctors} médicos nuevos.`);
};

export const processReservationsCSV = async (data: any[], orgId: string, userId: string, onLog: LogCallback) => {
    onLog(`Iniciando carga de ${data.length} reservas para Org: ${orgId}...`);

    const currentCenters = await getCenters(orgId);
    const currentBoxes = await getBoxes(orgId);
    
    const centerMap = new Map(currentCenters.map(c => [c.name.toLowerCase().trim(), c]));
    const boxMap = new Map(currentBoxes.map(b => [`${b.centerId}_${b.name.toLowerCase().trim()}`, b]));

    let newReservationsCount = 0;
    const batchSize = 400; 
    let batch = writeBatch(db);
    let opCount = 0;

    for (const row of data) {
        const rawCenterName = row.location || row.cae;
        const rawDescription = row.description || '';
        const rawBoxName = rawDescription.includes('-') ? rawDescription.split('-')[0].trim() : rawDescription.trim();
        const doctorName = row.summary ? row.summary.replace(/"/g, '').trim() : 'Sin Asignar';

        if (!rawCenterName || !rawBoxName || !row.start_time) continue;

        // 1. Resolver Centro
        let centerId = '';
        const centerKey = rawCenterName.toLowerCase().trim();
        if (centerMap.has(centerKey)) {
            centerId = centerMap.get(centerKey)!.id;
        } else {
            const newCenter = await addCenter(rawCenterName.trim(), orgId);
            centerMap.set(centerKey, newCenter);
            centerId = newCenter.id;
        }

        // 2. Resolver Box
        let boxId = '';
        const boxKey = `${centerId}_${rawBoxName.toLowerCase()}`;
        if (boxMap.has(boxKey)) {
            boxId = boxMap.get(boxKey)!.id;
        } else {
            const newBox = await addBox(rawBoxName, centerId, orgId);
            boxMap.set(boxKey, newBox);
            boxId = newBox.id;
        }

        // 3. Fechas
        const startDate = parseChileanDate(row.start_time);
        const endDate = parseChileanDate(row.end_time);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;

        const resRef = row.id ? doc(db, 'reservations', row.id) : doc(collection(db, 'reservations'));

        batch.set(resRef, {
            orgId,
            centerId,
            boxId,
            boxName: rawBoxName,
            doctorName: doctorName,
            observation: 'Importado Supabase',
            startTime: startDate.toISOString(), 
            endTime: endDate.toISOString(),
            userId: userId,
            originalEventId: row.event_id || '', 
            createdAt: Date.now()
        }, { merge: true }); 

        opCount++;
        newReservationsCount++;

        if (opCount >= batchSize) {
            await batch.commit();
            onLog(`[PROGRESO] Guardadas ${newReservationsCount} / ${data.length}... Pausando 1s...`);
            await delay(1000); 
            batch = writeBatch(db); 
            opCount = 0;
        }
    }

    if (opCount > 0) {
        await batch.commit();
    }
    onLog(`¡ÉXITO! Se procesaron ${newReservationsCount} reservas.`);
};