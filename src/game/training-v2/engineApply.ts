import {
  DEFAULT_DEFAULT_GENOME,
  DEFAULT_RICEFISH_GENOME,
  DEFAULT_RICEFISH_PLUS_GENOME,
  type DefaultGenome,
  type RicefishGenome,
  type RicefishPlusGenome,
} from './genomes';

export function applyDefaultGenome(genome?: DefaultGenome): DefaultGenome {
  return genome ?? DEFAULT_DEFAULT_GENOME;
}

export function applyRicefishGenome(genome?: RicefishGenome): RicefishGenome {
  return genome ?? DEFAULT_RICEFISH_GENOME;
}

export function applyRicefishPlusGenome(genome?: RicefishPlusGenome): RicefishPlusGenome {
  return genome ?? DEFAULT_RICEFISH_PLUS_GENOME;
}
