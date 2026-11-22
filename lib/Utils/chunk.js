"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

/**
 * Teilt ein Array in Stuecke der Groesse `size`; das letzte Stueck enthaelt
 * den Rest. Ersetzt lodash.chunk mit demselben Verhalten (auch fuer
 * Randfaelle: size fehlt = 1, Kommazahl wird abgeschnitten, size < 1 oder
 * leeres/fehlendes Array = []). Festgehalten in tests/chunk.test.cjs.
 * Intern, nicht Teil der oeffentlichen API.
 */
const chunk = (array, size = 1) => {
    const length = array == null ? 0 : array.length
    const step = Math.trunc(Number(size)) || 0
    if (!length || step < 1) {
        return []
    }
    const result = []
    for (let index = 0; index < length; index += step) {
        result.push(Array.prototype.slice.call(array, index, index + step))
    }
    return result
}

module.exports = {
  chunk
}
