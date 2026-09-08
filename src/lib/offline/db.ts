/**
 * Lasha Offline Persistence Layer
 *
 * IndexedDB-based persistence for offline operations.
 * Provides a simple key-value store with transaction support.
 *
 * Design principles:
 * - Simple API wrapping IndexedDB
 * - Transaction-safe operations
 * - Automatic cleanup of old data
 * - No external dependencies (uses native IndexedDB)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredOperation {
  operationId: string;
  operationType: string;
  entityId: string;
  payload: Record<string, any>;
  clientCreatedAt: number;
  status: "pending" | "syncing" | "synced" | "failed" | "expired";
  retryCount: number;
  lastError?: string;
  lastAttemptAt?: number;
  syncedAt?: number;
}

export interface StoredLocation {
  id: string;
  lat: number;
  lng: number;
  timestamp: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
}

export interface StoredDelivery {
  deliveryId: string;
  data: Record<string, any>;
  lastSyncedAt: number;
}

// ─── Database Configuration ───────────────────────────────────────────────────

const DB_NAME = "lasha-offline";
const DB_VERSION = 1;

const STORES = {
  OPERATIONS: "pending_operations",
  LOCATIONS: "gps_buffer",
  DELIVERIES: "cached_deliveries",
  METADATA: "metadata",
} as const;

// ─── Database Singleton ───────────────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;

/**
 * Get or create the IndexedDB database instance.
 */
export function getDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error}`));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores
      if (!db.objectStoreNames.contains(STORES.OPERATIONS)) {
        const opsStore = db.createObjectStore(STORES.OPERATIONS, { keyPath: "operationId" });
        opsStore.createIndex("by_status", ["status"]);
        opsStore.createIndex("by_entity", ["entityId"]);
        opsStore.createIndex("by_created", ["clientCreatedAt"]);
      }

      if (!db.objectStoreNames.contains(STORES.LOCATIONS)) {
        const locStore = db.createObjectStore(STORES.LOCATIONS, { keyPath: "id", autoIncrement: true });
        locStore.createIndex("by_timestamp", ["timestamp"]);
      }

      if (!db.objectStoreNames.contains(STORES.DELIVERIES)) {
        db.createObjectStore(STORES.DELIVERIES, { keyPath: "deliveryId" });
      }

      if (!db.objectStoreNames.contains(STORES.METADATA)) {
        db.createObjectStore(STORES.METADATA, { keyPath: "key" });
      }
    };
  });
}

// ─── Operation Queue Operations ───────────────────────────────────────────────

/**
 * Add a pending operation to the queue.
 */
export async function addOperation(operation: StoredOperation): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.OPERATIONS, "readwrite");
    const store = tx.objectStore(STORES.OPERATIONS);
    const request = store.put(operation);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to add operation: ${request.error}`));
  });
}

/**
 * Get all pending operations.
 */
export async function getPendingOperations(): Promise<StoredOperation[]> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.OPERATIONS, "readonly");
    const store = tx.objectStore(STORES.OPERATIONS);
    const index = store.index("by_status");
    const request = index.getAll("pending");

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Failed to get operations: ${request.error}`));
  });
}

/**
 * Get operations that are currently syncing (for retry).
 */
export async function getSyncingOperations(): Promise<StoredOperation[]> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.OPERATIONS, "readonly");
    const store = tx.objectStore(STORES.OPERATIONS);
    const index = store.index("by_status");
    const request = index.getAll("syncing");

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Failed to get operations: ${request.error}`));
  });
}

/**
 * Update operation status.
 */
export async function updateOperationStatus(
  operationId: string,
  status: StoredOperation["status"],
  error?: string
): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.OPERATIONS, "readwrite");
    const store = tx.objectStore(STORES.OPERATIONS);
    const getRequest = store.get(operationId);

    getRequest.onsuccess = () => {
      const operation = getRequest.result;
      if (!operation) {
        reject(new Error("Operation not found"));
        return;
      }

      operation.status = status;
      operation.lastAttemptAt = Date.now();

      if (status === "syncing") {
        operation.retryCount++;
      }

      if (status === "failed" && error) {
        operation.lastError = error;
      }

      if (status === "synced") {
        operation.syncedAt = Date.now();
      }

      const putRequest = store.put(operation);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(new Error(`Failed to update operation: ${putRequest.error}`));
    };

    getRequest.onerror = () => reject(new Error(`Failed to get operation: ${getRequest.error}`));
  });
}

/**
 * Remove synced operations older than the specified age.
 */
export async function cleanupSyncedOperations(maxAgeMs: number): Promise<number> {
  const db = await getDatabase();
  const cutoff = Date.now() - maxAgeMs;
  let removedCount = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.OPERATIONS, "readwrite");
    const store = tx.objectStore(STORES.OPERATIONS);
    const index = store.index("by_status");
    const request = index.openCursor("synced");

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const operation = cursor.value;
        if (operation.syncedAt && operation.syncedAt < cutoff) {
          cursor.delete();
          removedCount++;
        }
        cursor.continue();
      } else {
        resolve(removedCount);
      }
    };

    request.onerror = () => reject(new Error(`Failed to cleanup: ${request.error}`));
  });
}

// ─── GPS Buffer Operations ────────────────────────────────────────────────────

/**
 * Add a location to the GPS buffer.
 */
export async function addLocation(location: Omit<StoredLocation, "id">): Promise<number> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.LOCATIONS, "readwrite");
    const store = tx.objectStore(STORES.LOCATIONS);
    const request = store.add({ ...location, id: 0 }); // auto-increment

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(new Error(`Failed to add location: ${request.error}`));
  });
}

/**
 * Get all buffered locations.
 */
export async function getBufferedLocations(): Promise<StoredLocation[]> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.LOCATIONS, "readonly");
    const store = tx.objectStore(STORES.LOCATIONS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Failed to get locations: ${request.error}`));
  });
}

/**
 * Clear all buffered locations (after successful sync).
 */
export async function clearBufferedLocations(): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.LOCATIONS, "readwrite");
    const store = tx.objectStore(STORES.LOCATIONS);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to clear locations: ${request.error}`));
  });
}

/**
 * Remove oldest locations if buffer exceeds max size.
 */
export async function trimLocationBuffer(maxSize: number): Promise<number> {
  const db = await getDatabase();
  let trimmedCount = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.LOCATIONS, "readwrite");
    const store = tx.objectStore(STORES.LOCATIONS);
    const countRequest = store.count();

    countRequest.onsuccess = () => {
      const count = countRequest.result;
      if (count <= maxSize) {
        resolve(0);
        return;
      }

      const toRemove = count - maxSize;
      const index = store.index("by_timestamp");
      const request = index.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor && trimmedCount < toRemove) {
          cursor.delete();
          trimmedCount++;
          cursor.continue();
        } else {
          resolve(trimmedCount);
        }
      };

      request.onerror = () => reject(new Error(`Failed to trim locations: ${request.error}`));
    };

    countRequest.onerror = () => reject(new Error(`Failed to count locations: ${countRequest.error}`));
  });
}

// ─── Cached Delivery Operations ───────────────────────────────────────────────

/**
 * Cache a delivery for offline viewing.
 */
export async function cacheDelivery(delivery: StoredDelivery): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.DELIVERIES, "readwrite");
    const store = tx.objectStore(STORES.DELIVERIES);
    const request = store.put(delivery);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to cache delivery: ${request.error}`));
  });
}

/**
 * Get a cached delivery.
 */
export async function getCachedDelivery(deliveryId: string): Promise<StoredDelivery | null> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.DELIVERIES, "readonly");
    const store = tx.objectStore(STORES.DELIVERIES);
    const request = store.get(deliveryId);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(new Error(`Failed to get delivery: ${request.error}`));
  });
}

// ─── Metadata Operations ──────────────────────────────────────────────────────

/**
 * Get a metadata value.
 */
export async function getMetadata(key: string): Promise<any> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.METADATA, "readonly");
    const store = tx.objectStore(STORES.METADATA);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(new Error(`Failed to get metadata: ${request.error}`));
  });
}

/**
 * Set a metadata value.
 */
export async function setMetadata(key: string, value: any): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.METADATA, "readwrite");
    const store = tx.objectStore(STORES.METADATA);
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to set metadata: ${request.error}`));
  });
}
