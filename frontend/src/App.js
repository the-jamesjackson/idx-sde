import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ListingsPage from './pages/ListingsPage';
import PropertyDetailPage from './pages/PropertyDetailPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="App">
        <Routes>
          <Route path="/" element={<ListingsPage />} />
          <Route path="/property/:id" element={<PropertyDetailPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;