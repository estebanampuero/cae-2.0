import React, { useState } from 'react';
import { getMonthName } from '../utils/dateUtils';

interface CalendarProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
}

const Calendar: React.FC<CalendarProps> = ({ selectedDate, onDateSelect }) => {
  const [currentViewDate, setCurrentViewDate] = useState(new Date());

  const year = currentViewDate.getFullYear();
  const month = currentViewDate.getMonth();

  const handlePrevMonth = () => setCurrentViewDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentViewDate(new Date(year, month + 1, 1));

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayIndex = (firstDay.getDay() + 6) % 7; 

  const days = [];
  for (let i = 0; i < startingDayIndex; i++) {
    days.push(<div key={`empty-${i}`} />);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(year, month, i);
    const isSelected = selectedDate && 
      date.getDate() === selectedDate.getDate() && 
      date.getMonth() === selectedDate.getMonth() && 
      date.getFullYear() === selectedDate.getFullYear();
    
    const isToday = new Date().toDateString() === date.toDateString();

    let btnClass = "w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-200 mx-auto ";
    
    if (isSelected) {
      btnClass += "bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-200 scale-110";
    } else if (isToday) {
      btnClass += "bg-slate-100 text-slate-700 font-bold border border-slate-200";
    } else {
      btnClass += "text-slate-600 hover:bg-indigo-50 hover:text-indigo-600";
    }

    days.push(
      <button key={i} onClick={() => onDateSelect(date)} className={btnClass}>
        {i}
      </button>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4 px-1">
        <button onClick={handlePrevMonth} className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          {getMonthName(currentViewDate)}
        </span>
        <button onClick={handleNextMonth} className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      
      {/* CORRECCIÓN AQUÍ: Usamos 'i' (índice) como key en lugar de 'd' (letra) */}
      <div className="grid grid-cols-7 gap-y-2 mb-2 text-center">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className="text-[10px] font-bold text-slate-300">{d}</div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-y-3">
        {days}
      </div>
    </div>
  );
};

export default Calendar;