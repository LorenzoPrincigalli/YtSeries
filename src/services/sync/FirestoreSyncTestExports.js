/**
 * Re-exports pure functions for Node tests (avoids loading Chrome-only modules).
 */
export {
  seriesToFirestorePayload,
  mergeRemoteIntoSeries
} from './FirebaseSyncService.js'
