
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Fix: Access document through window as any to bypass "Cannot find name 'document'" error
const rootElement = (window as any).document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
