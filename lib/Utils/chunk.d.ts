/** Teilt ein Array in Stuecke der Groesse `size` (letztes Stueck = Rest). Intern. */
export declare const chunk: <T>(array: ArrayLike<T> | null | undefined, size?: number) => T[][]
