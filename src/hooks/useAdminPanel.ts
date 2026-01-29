// src/hooks/useAdminPanel.ts
import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { useAuth } from '../context/AuthContext'; // Ajusta ruta
import { Center } from '../types'; // Ajusta ruta
import { addCenter, addBox, addDoctor, getCenters } from '../services/db';
import { 
    processInfrastructureCSV, 
    processDoctorsCSV, 
    processReservationsCSV, 
    rescueOrphanData, 
    countReservationsInCloud 
} from '../services/adminBulkActions';

export type TabType = 'centers' | 'boxes' | 'doctors' | 'import' | 'utils';
export type ImportType = 'reservations' | 'infrastructure' | 'doctors';

export const useAdminPanel = (onDataChange: () => void) => {
    const { userProfile } = useAuth();
    
    // UI State
    const [activeTab, setActiveTab] = useState<TabType>('centers');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    
    // Data State
    const [centers, setCenters] = useState<Center[]>([]);

    // Form State
    const [centerName, setCenterName] = useState('');
    const [boxName, setBoxName] = useState('');
    const [selectedCenterId, setSelectedCenterId] = useState('');
    const [doctorName, setDoctorName] = useState('');

    // Import State
    const [importType, setImportType] = useState<ImportType>('reservations');
    const [importing, setImporting] = useState(false);
    const [importLog, setImportLog] = useState<string[]>([]);

    useEffect(() => {
        if (userProfile?.orgId) {
            loadCenters();
        }
    }, [userProfile]);

    const loadCenters = async () => {
        if (!userProfile?.orgId) return;
        const data = await getCenters(userProfile.orgId);
        setCenters(data);
    };

    const addLog = (msg: string) => setImportLog(prev => [...prev, msg]);

    // --- ACTIONS ---

    const submitCenter = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!centerName || !userProfile?.orgId) return;
        setIsLoading(true);
        await addCenter(centerName, userProfile.orgId);
        setCenterName('');
        setMessage('CAE agregado correctamente');
        await loadCenters();
        onDataChange();
        setIsLoading(false);
    };

    const submitBox = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!boxName || !selectedCenterId || !userProfile?.orgId) return;
        setIsLoading(true);
        await addBox(boxName, selectedCenterId, userProfile.orgId);
        setBoxName('');
        setMessage('Box agregado correctamente');
        onDataChange();
        setIsLoading(false);
    };

    const submitDoctor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!doctorName || !selectedCenterId || !userProfile?.orgId) return;
        setIsLoading(true);
        await addDoctor(doctorName, selectedCenterId, userProfile.orgId);
        setDoctorName('');
        setMessage('Médico agregado correctamente');
        onDataChange();
        setIsLoading(false);
    };

    const handleCountCheck = async () => {
        try {
            setMessage('Contando documentos en la nube...');
            const count = await countReservationsInCloud();
            setMessage(`Total de reservas en la colección (Global): ${count}`);
        } catch (e: any) {
            setMessage(`Error al contar: ${e.message}`);
        }
    };

    const handleRescueData = async () => {
        if (!userProfile?.orgId) return;
        if (!window.confirm("IMPORTANTE: ¿Seguro que deseas asignar todos los datos huérfanos a tu organización actual?")) return;

        setIsLoading(true);
        setImportLog(["Iniciando rescate de datos..."]);
        try {
            const count = await rescueOrphanData(userProfile.orgId, addLog);
            setMessage(`Proceso finalizado. ${count} documentos reasignados.`);
            onDataChange();
        } catch (e: any) {
            addLog(`ERROR: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userProfile?.orgId) {
            addLog("Error: No se identificó la organización o el archivo.");
            return;
        }

        setImporting(true);
        setImportLog(['Leyendo archivo...', 'Analizando estructura...']);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    if (importType === 'infrastructure') {
                        await processInfrastructureCSV(results.data, userProfile.orgId, addLog);
                    } else if (importType === 'doctors') {
                        await processDoctorsCSV(results.data, userProfile.orgId, addLog);
                    } else {
                        await processReservationsCSV(results.data, userProfile.orgId, userProfile.uid, addLog);
                    }
                    onDataChange();
                } catch (e: any) {
                    addLog(`Error crítico: ${e.message}`);
                } finally {
                    setImporting(false);
                }
            },
            error: (err) => {
                addLog(`Error al leer CSV: ${err.message}`);
                setImporting(false);
            }
        });
    };

    return {
        state: {
            activeTab, centers, isLoading, message, 
            centerName, boxName, doctorName, selectedCenterId,
            importType, importing, importLog, userProfile
        },
        setters: {
            setActiveTab, setCenterName, setBoxName, 
            setDoctorName, setSelectedCenterId, setImportType
        },
        actions: {
            submitCenter, submitBox, submitDoctor, 
            handleCountCheck, handleRescueData, handleFileUpload
        }
    };
};