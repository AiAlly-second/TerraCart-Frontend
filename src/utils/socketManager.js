import { io } from "socket.io-client";
import { getCustomerApiOrigin } from "./customerApiOrigin";
import { STABILITY_FLAGS, STABILITY_THRESHOLDS } from "./stabilityFlags";

const SOCKET_ORIGIN = getCustomerApiOrigin();

let socketInstance = null;
const joinedRooms = new Set();
const joinRateWindow = [];
const reconnectWindow = [];

const trimWindow = (arr, windowMs) => {
  const cutoff = Date.now() - windowMs;
  while (arr.length > 0 && arr[0] < cutoff) {
    arr.shift();
  }
};

const markRoomJoin = () => {
  if (!STABILITY_FLAGS.ENABLE_STABILITY_OBSERVABILITY) return;
  joinRateWindow.push(Date.now());
  trimWindow(joinRateWindow, 60_000);
  if (joinRateWindow.length > STABILITY_THRESHOLDS.MAX_ROOM_JOINS_PER_MINUTE) {
    console.warn("[CustomerSocket] join amplification risk", {
      joinsPerMinute: joinRateWindow.length,
      threshold: STABILITY_THRESHOLDS.MAX_ROOM_JOINS_PER_MINUTE,
    });
  }
};

const markReconnect = () => {
  if (!STABILITY_FLAGS.ENABLE_STABILITY_OBSERVABILITY) return;
  reconnectWindow.push(Date.now());
  trimWindow(reconnectWindow, 60_000);
  if (reconnectWindow.length > STABILITY_THRESHOLDS.MAX_RECONNECTS_PER_MINUTE) {
    console.warn("[CustomerSocket] reconnect storm risk", {
      reconnectsPerMinute: reconnectWindow.length,
      threshold: STABILITY_THRESHOLDS.MAX_RECONNECTS_PER_MINUTE,
    });
  }
};

const restoreJoinedRooms = () => {
  if (!socketInstance) return;
  for (const roomKey of joinedRooms) {
    const delimiter = roomKey.indexOf("|");
    if (delimiter <= 0 || delimiter >= roomKey.length - 1) continue;
    const eventName = roomKey.slice(0, delimiter);
    const roomValue = roomKey.slice(delimiter + 1);
    socketInstance.emit(eventName, roomValue);
    markRoomJoin();
  }
};

const createSocket = () => {
  const socket = io(SOCKET_ORIGIN, {
    transports: ["polling", "websocket"],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1200,
    reconnectionDelayMax: 15000,
    reconnectionAttempts: Number.parseInt(
      import.meta.env.VITE_SOCKET_RECONNECT_ATTEMPTS || "50",
      10,
    ),
    randomizationFactor: STABILITY_FLAGS.ENABLE_SOCKET_BACKOFF_JITTER ? 0.6 : 0,
    timeout: 60000,
    connectTimeout: 60000,
    forceNew: false,
  });

  let connectErrorCount = 0;
  let reconnectCooldownUntil = 0;

  socket.on("connect", () => {
    connectErrorCount = 0;
    reconnectCooldownUntil = 0;
    restoreJoinedRooms();
  });

  socket.on("reconnect", () => {
    markReconnect();
    restoreJoinedRooms();
  });

  socket.on("connect_error", () => {
    connectErrorCount += 1;
    markReconnect();
    const now = Date.now();
    if (
      STABILITY_FLAGS.ENABLE_SOCKET_BACKOFF_JITTER &&
      connectErrorCount > 8 &&
      now > reconnectCooldownUntil
    ) {
      reconnectCooldownUntil = now + 15_000;
      socket.io.opts.reconnectionDelay = Math.min(
        30_000,
        Number(socket.io.opts.reconnectionDelay || 1200) + 1200,
      );
      socket.io.opts.reconnectionDelayMax = Math.min(
        45_000,
        Number(socket.io.opts.reconnectionDelayMax || 15000) + 3000,
      );
    }
  });

  return socket;
};

export const getCustomerSocket = () => {
  if (!socketInstance) {
    socketInstance = createSocket();
  }
  return socketInstance;
};

export const safeCustomerSocketOn = (eventName, handler) => {
  const socket = getCustomerSocket();
  socket.off(eventName, handler);
  socket.on(eventName, handler);

  if (STABILITY_FLAGS.ENABLE_STABILITY_OBSERVABILITY) {
    const listenerCount = Array.isArray(socket.listeners?.(eventName))
      ? socket.listeners(eventName).length
      : null;
    if (
      Number.isFinite(listenerCount) &&
      listenerCount > STABILITY_THRESHOLDS.MAX_LISTENER_ATTACHES_PER_EVENT
    ) {
      console.warn("[CustomerSocket] duplicate listener risk", {
        eventName,
        listenerCount,
        threshold: STABILITY_THRESHOLDS.MAX_LISTENER_ATTACHES_PER_EVENT,
      });
    }
  }

  return () => socket.off(eventName, handler);
};

export const joinCustomerRoomOnce = (eventName, roomValue, { force = false } = {}) => {
  const socket = getCustomerSocket();
  const isStructuredPayload =
    roomValue !== null &&
    typeof roomValue === "object" &&
    !Array.isArray(roomValue);
  const room =
    isStructuredPayload
      ? JSON.stringify(roomValue)
      : String(roomValue || "").trim();
  if (!room || room === "{}") return false;

  const dedupeKey = `${eventName}|${room}`;
  if (
    STABILITY_FLAGS.ENABLE_SOCKET_ROOM_JOIN_DEDUPE &&
    !force &&
    joinedRooms.has(dedupeKey)
  ) {
    return false;
  }

  socket.emit(eventName, isStructuredPayload ? roomValue : room);
  joinedRooms.add(dedupeKey);
  markRoomJoin();
  return true;
};

export const clearCustomerSocketRoomMembership = () => {
  joinedRooms.clear();
};

export const getCustomerSocketSnapshot = () => ({
  isConnected: Boolean(socketInstance?.connected),
  joinedRoomCount: joinedRooms.size,
  joinsPerMinute: joinRateWindow.length,
  reconnectsPerMinute: reconnectWindow.length,
});
