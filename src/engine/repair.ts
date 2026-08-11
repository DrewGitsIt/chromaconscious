import type { Oklch } from './types'
import { clamp, deltaEok, toGamut } from './color'

/**
 * Pairwise palette repair: a small contrast graph over the resolved seeds.
 * Edges declare the minimum perceptual distance a pair must keep (charts must
 * be tellable-apart, the accent must not impersonate a status color, …).
 * Violated edges are fixed by nudging seeds in small steps — lightness first,
 * hue second — with each seed's total drift capped by a ΔE budget derived
 * from fidelity. What the budgets can't fix is returned as residuals and
 * surfaced in the report instead of being silently forced.
 */

export interface RepairNode {
  id: string
  color: Oklch
  /** Maximum ΔE-OK this node may drift from its starting color. */
  budget: number
  /** Mono lock: hue and chroma are this node's identity — repair may only move lightness. */
  lightnessOnly?: boolean
}

export interface RepairEdge {
  a: string
  b: string
  minDeltaE: number
  /** Human-readable reason, shown in the report when unresolved. */
  label: string
}

export interface RepairResidual {
  a: string
  b: string
  deltaE: number
  required: number
  label: string
}

// Lightness moves come first: they separate a pair while keeping each color
// recognizably itself. Hue rotation is the bigger intervention; chroma is a
// last resort (only upward — desaturating reads as "worse", never "different").
const MOVES = (c: Oklch, lightnessOnly = false): Oklch[] => {
  const moves: Oklch[] = [
    { ...c, l: clamp(c.l + 0.035, 0.08, 0.97) },
    { ...c, l: clamp(c.l - 0.035, 0.08, 0.97) },
  ]
  if (!lightnessOnly) {
    moves.push(
      { ...c, h: (c.h + 8) % 360 },
      { ...c, h: (c.h - 8 + 360) % 360 },
      { ...c, c: clamp(c.c + 0.02, 0, 0.32) },
    )
  }
  return moves
}

export function repairSeeds(
  nodes: RepairNode[],
  edges: RepairEdge[],
  maxRounds = 64,
): { colors: Map<string, Oklch>; residuals: RepairResidual[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const original = new Map(nodes.map((n) => [n.id, n.color]))
  const colors = new Map(nodes.map((n) => [n.id, n.color]))
  const live = edges.filter((e) => byId.has(e.a) && byId.has(e.b))

  const deficit = (e: RepairEdge) =>
    Math.max(0, e.minDeltaE - deltaEok(colors.get(e.a)!, colors.get(e.b)!))
  const totalDeficit = () => live.reduce((s, e) => s + deficit(e), 0)

  const stuck = new Set<RepairEdge>()
  for (let round = 0; round < maxRounds; round++) {
    let worst: RepairEdge | null = null
    let worstD = 1e-4
    for (const e of live) {
      if (stuck.has(e)) continue
      const d = deficit(e)
      if (d > worstD) {
        worstD = d
        worst = e
      }
    }
    if (!worst) break

    // Try every allowed move on both endpoints; keep the one that reduces the
    // graph's total deficit most (so a fix here can't silently break an edge
    // elsewhere). Ties go to the earliest move — i.e. lightness.
    const before = totalDeficit()
    let best: { id: string; color: Oklch; gain: number } | null = null
    for (const id of [worst.a, worst.b]) {
      const node = byId.get(id)!
      const current = colors.get(id)!
      for (const move of MOVES(current, node.lightnessOnly)) {
        const mapped = toGamut(move)
        if (deltaEok(mapped, original.get(id)!) > node.budget) continue
        colors.set(id, mapped)
        const gain = before - totalDeficit()
        colors.set(id, current)
        if (gain > 1e-6 && (!best || gain > best.gain)) best = { id, color: mapped, gain }
      }
    }
    if (!best) {
      stuck.add(worst)
      continue
    }
    colors.set(best.id, best.color)
    // The move shifted the graph — previously unfixable edges may have opened up.
    stuck.clear()
  }

  const residuals = live
    .filter((e) => deficit(e) > 1e-3)
    .map((e) => ({
      a: e.a,
      b: e.b,
      deltaE: deltaEok(colors.get(e.a)!, colors.get(e.b)!),
      required: e.minDeltaE,
      label: e.label,
    }))
  return { colors, residuals }
}
