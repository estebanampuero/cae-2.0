import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Eliminamos la línea de index.css para que el build no falle
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se encontró el elemento root');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);