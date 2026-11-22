"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

/**
 * Exponentieller Backoff fuer Wiederverbindungen (opt-in).
 * Baileys verbindet nicht selbst neu; wer nach `connection: 'close'` eine
 * neue Sitzung startet, kann hiermit die Wartezeit bestimmen, damit eine
 * kaputte Sitzung nicht im Takt gegen WhatsApp haemmert.
 *
 *   const backoff = makeReconnectBackoff()
 *   // bei close:  setTimeout(start, backoff.next())
 *   // bei open:   backoff.reset()
 *
 * Wartezeit = min(maxDelayMs, initialDelayMs * factor^versuch), dann um bis zu
 * +-jitter (Anteil) gestreut und wieder auf [0, maxDelayMs] begrenzt.
 */
const makeReconnectBackoff = (options = {}) => {
    const {
        initialDelayMs = 1000,
        maxDelayMs = 60000,
        factor = 2,
        jitter = 0.2,
        random = Math.random
    } = options
    if (!(initialDelayMs >= 0) || !(maxDelayMs >= 0) || !(factor >= 1) || !(jitter >= 0 && jitter <= 1)) {
        throw new RangeError('makeReconnectBackoff: initialDelayMs/maxDelayMs >= 0, factor >= 1, 0 <= jitter <= 1')
    }
    let attempt = 0
    return {
        /** Anzahl bisher vergebener Wartezeiten seit dem letzten reset() */
        get attempt() {
            return attempt
        },
        /** Wartezeit in ms fuer den naechsten Versuch */
        next() {
            const base = Math.min(maxDelayMs, initialDelayMs * Math.pow(factor, attempt))
            attempt += 1
            const spread = base * jitter
            const delay = base - spread + random() * 2 * spread
            return Math.round(Math.min(maxDelayMs, Math.max(0, delay)))
        },
        /** nach einer erfolgreichen Verbindung aufrufen */
        reset() {
            attempt = 0
        }
    }
}

module.exports = {
  makeReconnectBackoff
}
