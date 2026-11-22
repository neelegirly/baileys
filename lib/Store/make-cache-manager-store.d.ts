import { AuthenticationCreds } from '../Types'

/**
 * Konfiguration bzw. Store fuer `caching()` aus cache-manager v4.
 * cache-manager ist eine optionale Peer-Abhaengigkeit (^4.0.1); der Typ ist
 * hier bewusst lokal beschrieben, damit die Typen auch ohne das Paket laden.
 */
export interface CacheManagerStore {
    [key: string]: any
}

/** Benoetigt das optionale Paket `cache-manager@^4.0.1` (sonst Fehler mit Installationshinweis). */
export declare const makeCacheManagerAuthState: (store: CacheManagerStore, sessionKey: string) => Promise<{
    clearState: () => Promise<void>
    saveCreds: () => Promise<void>
    state: {
        creds: AuthenticationCreds
        keys: {
            get: (type: string, ids: string[]) => Promise<{}>
            set: (data: any) => Promise<void>
        }
    }
}>
