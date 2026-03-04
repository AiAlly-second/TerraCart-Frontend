import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

/**
 * Custom hook to persist table parameter across navigation
 * When a user scans a QR code with ?table=X, this hook ensures
 * the table parameter is maintained throughout their session
 */
export const useTablePersistence = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const isOfficeQrContext = () => {
    try {
      const storedTable = localStorage.getItem('terra_selectedTable');
      if (!storedTable) return false;
      const parsed = JSON.parse(storedTable);
      if (!parsed || typeof parsed !== 'object') return false;
      if (parsed.qrContextType === 'OFFICE') return true;

      const hasOfficeName = String(parsed.officeName || '').trim().length > 0;
      const hasOfficeAddress =
        String(parsed.officeAddress || '').trim().length > 0;
      const hasOfficePhone = String(parsed.officePhone || '').trim().length > 0;
      const hasOfficeDeliveryCharge =
        Number(parsed.officeDeliveryCharge || 0) > 0;
      return (
        hasOfficeName ||
        hasOfficeAddress ||
        hasOfficePhone ||
        hasOfficeDeliveryCharge
      );
    } catch {
      return false;
    }
  };

  useEffect(() => {
    // Office QR is takeaway-only: never persist table query params across pages.
    if (isOfficeQrContext()) {
      if (sessionStorage.getItem('terra_table_param')) {
        sessionStorage.removeItem('terra_table_param');
        console.log('[TablePersistence] Office QR detected, cleared persisted table parameter');
      }

      if (searchParams.get('table') && location.pathname !== '/') {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('table');
        setSearchParams(newParams, { replace: true });
      }
      return;
    }

    // Get table parameter from URL
    const tableParam = searchParams.get('table');

    // If table parameter exists in URL, store it in sessionStorage
    if (tableParam) {
      sessionStorage.setItem('terra_table_param', tableParam);
      console.log('[TablePersistence] Stored table parameter:', tableParam);
    } else {
      // If no table in URL, check if we have one stored
      const storedTable = sessionStorage.getItem('terra_table_param');
      
      // Only add table param to URL if:
      // 1. We have a stored table
      // 2. Current path is not the landing page (to avoid loop)
      // 3. We're on a page that should have the table param
      if (storedTable && location.pathname !== '/' && !location.pathname.includes('/takeaway')) {
        // Add table param to current URL using React Router's setSearchParams
        // This ensures the router state is consistent with the URL
        const newParams = new URLSearchParams(searchParams);
        newParams.set('table', storedTable);
        
        console.log('[TablePersistence] Adding table parameter to URL via setSearchParams:', storedTable);
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [searchParams, location.pathname, setSearchParams]);

  // Provide a way to clear the table parameter (for takeaway/logout)
  const clearTableParam = () => {
    sessionStorage.removeItem('terra_table_param');
    console.log('[TablePersistence] Cleared table parameter');
  };

  // Get the current table parameter
  const getTableParam = () => {
    if (isOfficeQrContext()) return null;
    return searchParams.get('table') || sessionStorage.getItem('terra_table_param');
  };

  return {
    tableParam: getTableParam(),
    clearTableParam,
  };
};
