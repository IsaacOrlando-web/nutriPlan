// Small linear model builder plus two solver backends. Owner: Math.
// HiGHS (WebAssembly, MILP) is primary; javascript-lp-solver is the fallback named in the spec.
// The optimizer builds a LinearModel once and either backend can solve it.

export type VarKind = "continuous" | "integer" | "binary";

export interface LinearVar {
  name: string;
  lb: number;
  ub: number; // Infinity allowed
  kind: VarKind;
}

export interface LinearConstraint {
  name: string;
  terms: Map<string, number>;
  lo?: number;
  hi?: number;
}

export class LinearModel {
  vars = new Map<string, LinearVar>();
  objective = new Map<string, number>();
  constraints: LinearConstraint[] = [];

  addVar(name: string, kind: VarKind, lb = 0, ub = Infinity): string {
    if (this.vars.has(name)) throw new Error(`duplicate variable ${name}`);
    this.vars.set(name, { name, lb, ub: kind === "binary" ? Math.min(ub, 1) : ub, kind });
    return name;
  }

  addObjective(name: string, coef: number): void {
    if (coef === 0) return;
    this.objective.set(name, (this.objective.get(name) ?? 0) + coef);
  }

  /** terms: list of [variable, coefficient]; repeated variables are summed. */
  addConstraint(name: string, terms: [string, number][], bounds: { lo?: number; hi?: number }): void {
    const map = new Map<string, number>();
    for (const [v, c] of terms) {
      if (c === 0) continue;
      map.set(v, (map.get(v) ?? 0) + c);
    }
    if (map.size === 0) return;
    this.constraints.push({ name, terms: map, lo: bounds.lo, hi: bounds.hi });
  }

  get size(): { vars: number; constraints: number; integers: number } {
    let integers = 0;
    for (const v of this.vars.values()) if (v.kind !== "continuous") integers++;
    return { vars: this.vars.size, constraints: this.constraints.length, integers };
  }
}

export interface LinearSolution {
  status: "optimal" | "feasible" | "infeasible" | "error";
  objective: number;
  values: Record<string, number>;
  solver: "highs" | "jslp";
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`non-finite coefficient ${n}`);
  const s = Number(n.toPrecision(10)).toString();
  return s.includes("e") ? n.toFixed(10) : s;
}

function expr(terms: Map<string, number>): string {
  const parts: string[] = [];
  let i = 0;
  for (const [v, c] of terms) {
    const sign = c < 0 ? "-" : "+";
    const abs = Math.abs(c);
    const piece = `${i === 0 && sign === "+" ? "" : sign + " "}${abs === 1 ? "" : fmt(abs) + " "}${v}`;
    parts.push(piece);
    i++;
  }
  // Break long expressions across lines; LP format allows it.
  const lines: string[] = [];
  for (let k = 0; k < parts.length; k += 8) lines.push(parts.slice(k, k + 8).join(" "));
  return lines.join("\n  ");
}

/** Serializes to CPLEX LP format (what HiGHS reads). */
export function toLpFormat(model: LinearModel): string {
  const out: string[] = ["Minimize", ` obj: ${model.objective.size ? expr(model.objective) : "0 " + model.vars.keys().next().value}`];
  out.push("Subject To");
  for (const c of model.constraints) {
    if (c.lo !== undefined && c.hi !== undefined && c.lo === c.hi) {
      out.push(` ${c.name}: ${expr(c.terms)} = ${fmt(c.lo)}`);
      continue;
    }
    if (c.lo !== undefined) out.push(` ${c.name}_lo: ${expr(c.terms)} >= ${fmt(c.lo)}`);
    if (c.hi !== undefined) out.push(` ${c.name}_hi: ${expr(c.terms)} <= ${fmt(c.hi)}`);
  }
  out.push("Bounds");
  const generals: string[] = [];
  const binaries: string[] = [];
  for (const v of model.vars.values()) {
    if (v.kind === "binary") {
      binaries.push(v.name);
      continue;
    }
    const ub = Number.isFinite(v.ub) ? fmt(v.ub) : "+inf";
    out.push(` ${fmt(v.lb)} <= ${v.name} <= ${ub}`);
    if (v.kind === "integer") generals.push(v.name);
  }
  if (generals.length) out.push("General", ...chunk(generals));
  if (binaries.length) out.push("Binary", ...chunk(binaries));
  out.push("End");
  return out.join("\n");
}

function chunk(names: string[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < names.length; i += 12) lines.push(" " + names.slice(i, i + 12).join(" "));
  return lines;
}

// ---------------------------------------------------------------------------
// HiGHS backend
// ---------------------------------------------------------------------------

type HighsInstance = { solve: (lp: string, options?: Record<string, unknown>) => HighsRawSolution };
type HighsRawSolution = {
  Status: string;
  ObjectiveValue: number;
  Columns: Record<string, { Primal?: number }>;
};

let highsPromise: Promise<HighsInstance> | null = null;

async function loadHighs(): Promise<HighsInstance> {
  if (!highsPromise) {
    highsPromise = (async () => {
      const mod = (await import("highs")) as unknown as { default: (opts?: object) => Promise<HighsInstance> };
      return mod.default();
    })().catch((err) => {
      highsPromise = null;
      throw err;
    });
  }
  return highsPromise;
}

export async function solveWithHighs(
  model: LinearModel,
  opts: { timeLimitSec?: number; mipRelGap?: number; mipAbsGap?: number } = {},
): Promise<LinearSolution> {
  const highs = await loadHighs();
  const lp = toLpFormat(model);
  const raw = highs.solve(lp, {
    time_limit: opts.timeLimitSec ?? 4,
    mip_rel_gap: opts.mipRelGap ?? 0.01,
    mip_abs_gap: opts.mipAbsGap ?? 1e-6,
    output_flag: false,
  });
  const hasSolution = raw.Status === "Optimal" || raw.Status === "Time limit reached";
  if (!hasSolution || !raw.Columns || Object.keys(raw.Columns).length === 0) {
    return {
      status: raw.Status === "Infeasible" ? "infeasible" : "error",
      objective: NaN,
      values: {},
      solver: "highs",
    };
  }
  const values: Record<string, number> = {};
  for (const [name, col] of Object.entries(raw.Columns)) values[name] = col.Primal ?? 0;
  return {
    status: raw.Status === "Optimal" ? "optimal" : "feasible",
    objective: raw.ObjectiveValue,
    values,
    solver: "highs",
  };
}

// ---------------------------------------------------------------------------
// javascript-lp-solver backend (fallback)
// ---------------------------------------------------------------------------

type JsLpModel = {
  optimize: string;
  opType: "min" | "max";
  constraints: Record<string, { min?: number; max?: number; equal?: number }>;
  variables: Record<string, Record<string, number>>;
  ints: Record<string, 1>;
  options?: Record<string, unknown>;
};

export async function solveWithJsLp(model: LinearModel, opts: { timeLimitSec?: number } = {}): Promise<LinearSolution> {
  const solverMod = (await import("javascript-lp-solver")) as unknown as {
    default?: { Solve: (m: JsLpModel) => Record<string, number | boolean> };
    Solve?: (m: JsLpModel) => Record<string, number | boolean>;
  };
  const solver = solverMod.default ?? (solverMod as { Solve: (m: JsLpModel) => Record<string, number | boolean> });

  const js: JsLpModel = {
    optimize: "__obj",
    opType: "min",
    constraints: {},
    variables: {},
    ints: {},
    options: { timeout: (opts.timeLimitSec ?? 8) * 1000, tolerance: 0.02 },
  };
  for (const v of model.vars.values()) {
    js.variables[v.name] = { __obj: model.objective.get(v.name) ?? 0 };
    if (v.kind !== "continuous") js.ints[v.name] = 1;
    const boundKey = `__b_${v.name}`;
    js.variables[v.name][boundKey] = 1;
    js.constraints[boundKey] = Number.isFinite(v.ub) ? { min: v.lb, max: v.ub } : { min: v.lb };
  }
  model.constraints.forEach((c, i) => {
    const key = `c${i}_${c.name}`;
    for (const [v, coef] of c.terms) js.variables[v][key] = coef;
    js.constraints[key] =
      c.lo !== undefined && c.hi !== undefined && c.lo === c.hi
        ? { equal: c.lo }
        : { ...(c.lo !== undefined ? { min: c.lo } : {}), ...(c.hi !== undefined ? { max: c.hi } : {}) };
  });

  const res = solver.Solve(js);
  if (!res.feasible) return { status: "infeasible", objective: NaN, values: {}, solver: "jslp" };
  const values: Record<string, number> = {};
  for (const name of model.vars.keys()) values[name] = typeof res[name] === "number" ? (res[name] as number) : 0;
  let objective = 0;
  for (const [v, c] of model.objective) objective += c * values[v];
  return { status: "feasible", objective, values, solver: "jslp" };
}

export async function solveLinear(
  model: LinearModel,
  opts: { prefer?: "highs" | "jslp"; timeLimitSec?: number; mipRelGap?: number; mipAbsGap?: number } = {},
): Promise<LinearSolution> {
  if (opts.prefer !== "jslp") {
    try {
      const sol = await solveWithHighs(model, opts);
      if (sol.status !== "error") return sol;
    } catch {
      // fall through to the pure JS solver
    }
  }
  return solveWithJsLp(model, opts);
}
