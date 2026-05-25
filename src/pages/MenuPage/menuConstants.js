/** Shared Menu route constants — preserve keys for backward compatibility. */
import { getCustomerApiOrigin } from "../../utils/customerApiOrigin";

export const nodeApi = getCustomerApiOrigin();

export const TAP_TO_ORDER_AI_ENDPOINT = `${nodeApi}/api/voice-order/tap-to-order`;
export const TAP_TO_ORDER_TRANSCRIBE_ENDPOINT = `${nodeApi}/api/voice-order/tap-to-order/transcribe`;
export const MENU_PAGE_TRANSLATION_ENDPOINT = `${nodeApi}/api/translations/menu-page`;

export const MENU_BACK_PRESERVE_KEY = "terra_preserve_menu_state_on_back";
export const MENU_SESSION_MARKER_KEY = "terra_menu_session_active_tab";
export const TAP_TO_ORDER_MAX_RECORD_MS = 12000;
export const TAP_TO_ORDER_SILENCE_STOP_MS = 1800;
export const TAP_TO_ORDER_AUDIO_LEVEL_THRESHOLD = 0.015;

export const SERVICE_TYPE_KEY = "terra_serviceType";
export const TABLE_SELECTION_KEY = "terra_selectedTable";
export const FEEDBACK_SUBMITTED_ORDERS_KEY = "terra_feedbackSubmittedOrders";
export const TAKEAWAY_TOKEN_PREVIEW_KEY = "terra_takeaway_token_preview";

export const CANCELLED_OR_RETURNED_STATUS_TOKENS = new Set([
  "CANCELLED",
  "CANCELED",
  "RETURNED",
]);

export const TAKEAWAY_LIKE_SERVICE_TYPES = ["TAKEAWAY", "PICKUP", "DELIVERY"];

export const INVOICE_EXPORT_WIDTH = 760;

export const SPICE_LEVEL_LABELS = {
  MILD: "Mild",
  MEDIUM: "Medium",
  HOT: "Hot",
  EXTREME: "Extreme",
};

export const STATIC_MENU_TEXT_TRANSLATION_KEYS = {
  "hot / cold": "hotCold",
  "hot/cold": "hotCold",
  "hot & cold": "hotCold",
  "hot and cold": "hotCold",
};
