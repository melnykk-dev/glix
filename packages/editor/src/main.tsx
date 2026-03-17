import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initAutoSave } from './storage/AutoSave';
import { registerDefaultShortcuts } from './shortcuts/defaultShortcuts';

initAutoSave();
registerDefaultShortcuts();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
