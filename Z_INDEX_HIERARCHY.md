# Z-Index Hierarchy - Customer Frontend

This document defines the z-index layering system used across the customer frontend to prevent UI overlay issues.

## Z-Index Layers

### Base Layer (0-99)
- **0**: Background images, decorative elements
- **1-10**: Regular page content, cards, sections

### Content Layer (100-999)
- **100**: Cart checkout bar
- **500-999**: Floating action buttons (not yet used)

### UI Elements (1000-9999)
- **1000**: Accessibility tools button
- **9000**: Blind eye button (on SecondPage)
- **9999**: Floating action buttons (general)

### Alerts & Overlays (10000-19999)
- **10000**: Alert notifications
- **10001**: Confirm dialogs, Blind eye button (Menu/Landing)
- **2000**: Process overlay

### Header (100000-100009)
- **100010**: Main header (fixed position)

### Modals (100010-100099)
- **100020**: Reserved (previously used, now updated)
- **100030**: Invoice modals, customer info modals (overlay)
- **100031**: Invoice modal content (above overlay)

### Voice Assistant Popup (100000+)
- **100000**: Voice assistant backdrop
- **100005**: Voice assistant popup content

## Rules for Adding New Elements

1. **Choose the appropriate layer** based on element type:
   - Backgrounds: 0-99
   - Page content: 100-999
   - Floating buttons: 1000-9999
   - Alerts/notifications: 10000-19999
   - Fixed header: 100010
   - Full-screen modals: 100030+

2. **Modal overlays should always be above the header** (z-index > 100010)

3. **Modal content should be 1 higher than its overlay** to ensure proper stacking

4. **Avoid arbitrary high values** - use the defined layers

5. **Document any new z-index values** in this file

## Current Files Using Z-Index

- `frontend/src/components/Header.jsx`: 100000, 100005, 100010
- `frontend/src/pages/MenuPage.css`: 10001, 20000 → **100030 (updated)**
- `frontend/src/pages/OrderSummary.css`: 10002 → **100030 (updated)**, 10003 → **100031 (updated)**
- `frontend/src/pages/SecondPage.css`: 100020 → **100030 (updated)**
- `frontend/src/pages/CartPage.css`: 100
- `frontend/src/components/Confirm.css`: 10001
- `frontend/src/components/Alert.css`: 10000
- `frontend/src/components/ProcessOverlay.css`: 2000
- `frontend/src/components/AccessibilityTools.css`: 1000

## Recent Fixes

### 2026-02-03: Invoice Modal Z-Index Fix
**Issue**: Invoice overlay was appearing under the header in customer frontend UI

**Root Cause**: 
- Header has `z-index: 100010`
- Invoice modal overlay had `z-index: 20000`
- Since 20000 < 100010, the invoice appeared under the header

**Solution**: Updated all modal overlays to `z-index: 100030` (above header)
- `frontend/src/pages/MenuPage.css`: `.invoice-modal-overlay` → 100030
- `frontend/src/pages/OrderSummary.css`: `.bill-modal-overlay` → 100030, modal content → 100031
- `frontend/src/pages/SecondPage.css`: `.customer-info-modal-overlay` → 100030

**Result**: All modals now properly appear above the header


