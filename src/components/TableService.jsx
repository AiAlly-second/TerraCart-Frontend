import React, { useState, useEffect } from 'react';
import TableServicePopup from './TableServicePopup';
import { FiCoffee } from 'react-icons/fi';

export default function TableService({ onTableSelect }) {
  const [showPopup, setShowPopup] = useState(false);
  const [tableNumber, setTableNumber] = useState(() => {
    // Prefer assigned table from QR scan (terra_selectedTable), fallback to legacy tableNumber
    try {
      const cached = localStorage.getItem('terra_selectedTable');
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed?.number || parsed?.tableNumber || localStorage.getItem('tableNumber') || '';
      }
    } catch (e) {
      // ignore parse errors
    }
    return localStorage.getItem('tableNumber') || '';
  });

  // If table number changes, inform parent and save to localStorage
  useEffect(() => {
    if (tableNumber) {
      localStorage.setItem('tableNumber', tableNumber);
      onTableSelect?.(tableNumber);
    }
  }, [tableNumber, onTableSelect]);

  // Handle table selection (for new orders)
  const handleTableSelect = (number) => {
    // If already have a table from QR, do not allow manual change
    if (tableNumber) return;
    setTableNumber(number);
    setShowPopup(false);
  };

  return (
    <>
      <button
        onClick={() => {
          // If we already have a table from QR, do not open selector
          if (tableNumber) return;
          setShowPopup(true);
        }}
        className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
      >
        <FiCoffee />
        <span>
          {tableNumber ? `Table ${tableNumber}` : "Select Table"}
        </span>
      </button>

      <TableServicePopup
        showCard={showPopup}
        setShowCard={setShowPopup}
        currentTable={tableNumber}
        onTableSelect={handleTableSelect}
      />
    </>
  );
}