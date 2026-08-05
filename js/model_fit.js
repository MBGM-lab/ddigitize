// Nonlinear least squares fitting for parametric curve models.
// All functions work in pixel/canvas coordinates.
// Returns { params, sample(x), loss, success }.

// ── Optimizer ─────────────────────────────────────────────────────────────────

// Gradient descent with backtracking line search.
// modelFn(params, x) → y.  params and x are already normalised by the caller.
function optimise(initParams, modelFn, points, maxIter = 3000) {
  let p = [...initParams];

  function loss(q) {
    let s = 0;
    for (const pt of points) {
      const d = modelFn(q, pt.x) - pt.y;
      s += d * d;
    }
    return s / points.length;
  }

  function gradient(q) {
    return q.map((_, i) => {
      const eps = Math.max(Math.abs(q[i]) * 1e-5, 1e-5);
      const qp = [...q]; qp[i] += eps;
      const qm = [...q]; qm[i] -= eps;
      return (loss(qp) - loss(qm)) / (2 * eps);
    });
  }

  let curLoss = loss(p);
  let lr = 1.0;

  for (let iter = 0; iter < maxIter; iter++) {
    const grad = gradient(p);
    const gradNorm = Math.sqrt(grad.reduce((s, g) => s + g * g, 0));
    if (gradNorm < 1e-12) break;

    let stepLr = lr;
    let newP, newLoss;
    for (let s = 0; s < 20; s++) {
      newP    = p.map((pi, i) => pi - stepLr * grad[i]);
      newLoss = loss(newP);
      if (newLoss < curLoss) break;
      stepLr *= 0.5;
    }
    if (newLoss >= curLoss) break;

    lr = newLoss < curLoss * 0.999 ? Math.min(lr * 1.1, stepLr * 4) : stepLr;
    p = newP;
    curLoss = newLoss;
    if (curLoss < 1e-12) break;
  }

  return { params: p, loss: curLoss };
}

function bestOf(candidates, modelFn, points, maxIter = 3000) {
  let best = null;
  for (const init of candidates) {
    const result = optimise(init, modelFn, points, maxIter);
    if (!best || result.loss < best.loss) best = result;
  }
  return best;
}

function sorted(points) {
  return [...points].sort((a, b) => a.x - b.x);
}

// Normalise points: x → [0,1], y unchanged.
// Returns { pts, xMin, xRange } so callers can denormalise sample x.
function normalise(points) {
  const xMin  = points[0].x;
  const xMax  = points[points.length - 1].x;
  const xRange = xMax - xMin || 1;
  return {
    pts: points.map(p => ({ x: (p.x - xMin) / xRange, y: p.y })),
    xMin,
    xRange,
  };
}

// Find the peak point: point whose y deviates most from the asymptote (last y).
function findPeak(pts) {
  const C = pts[pts.length - 1].y;
  return pts.reduce((best, pt) => Math.abs(pt.y - C) > Math.abs(best.y - C) ? pt : best, pts[0]);
}

// ── Single exponential ────────────────────────────────────────────────────────
// f(x) = A * exp(-x / tau) + C    (x is normalised, peak at x = 0)

export function fitSingleExp(rawPoints) {
  const allPts = sorted(rawPoints);
  const C0     = allPts[allPts.length - 1].y;
  const peak   = findPeak(allPts);
  // Only fit points from peak onward (decay phase)
  const decayPts = allPts.filter(p => p.x >= peak.x);
  if (decayPts.length < 2) return null;

  const { pts, xMin: x0, xRange } = normalise(decayPts);
  const A0 = peak.y - C0;

  function modelFn([A, tau, C], x) {
    return A * Math.exp(-x / Math.max(tau, 1e-4)) + C;
  }

  const candidates = [
    [A0, 0.50, C0],
    [A0, 0.25, C0],
    [A0, 0.75, C0],
    [A0, 0.10, C0],
    [A0, 1.00, C0],
    [A0 * 0.5, 0.5, C0 + A0 * 0.5],
  ];

  const { params, loss } = bestOf(candidates, modelFn, pts);
  const [A, tau, C] = params;

  return {
    params: { A, tau: tau * xRange, C, x0 },
    sample: x => modelFn(params, (x - x0) / xRange),
    loss,
    success: isFinite(loss) && loss < 1e8,
  };
}

// ── Double exponential ────────────────────────────────────────────────────────
// f(x) = A1*exp(-x/tau1) + A2*exp(-x/tau2) + C   (x normalised, peak at x=0)

export function fitDoubleExp(rawPoints) {
  const allPts   = sorted(rawPoints);
  const C0       = allPts[allPts.length - 1].y;
  const peak     = findPeak(allPts);
  const decayPts = allPts.filter(p => p.x >= peak.x);
  if (decayPts.length < 3) return null;

  const { pts, xMin: x0, xRange } = normalise(decayPts);
  const A0 = peak.y - C0;

  function modelFn([A1, tau1, A2, tau2, C], x) {
    return A1 * Math.exp(-x / Math.max(tau1, 1e-4))
         + A2 * Math.exp(-x / Math.max(tau2, 1e-4))
         + C;
  }

  // Peeling: fit slow single exp to the latter half of decay, then fast to residuals.
  const tail      = pts.slice(Math.floor(pts.length * 0.5));
  const slowInit  = [A0 * 0.3, 0.7, C0];
  const slowResult = optimise(slowInit,
    ([A, tau, C], x) => A * Math.exp(-x / Math.max(tau, 1e-4)) + C,
    tail);
  const [A2_0, tau2_0, C2_0] = slowResult.params;

  const residPts = pts.map(pt => ({
    x: pt.x,
    y: pt.y - (A2_0 * Math.exp(-pt.x / Math.max(tau2_0, 1e-4)) + C2_0),
  }));
  const fastResult = optimise([A0 * 0.7, 0.1, 0],
    ([A, tau, C], x) => A * Math.exp(-x / Math.max(tau, 1e-4)) + C,
    residPts.slice(0, Math.ceil(residPts.length * 0.6)));
  const [A1_0, tau1_0] = fastResult.params;

  // Grid of (tau1, tau2) candidates spanning fast/slow combinations
  // logarithmically — the peeling result is included first as the likely
  // best warm start, then a systematic grid covers cases where peeling
  // converged to a poor local minimum.
  const tau1Grid = [0.02, 0.05, 0.10, 0.20];
  const tau2Grid = [0.15, 0.25, 0.40, 0.60, 0.80];
  const gridCandidates = [];
  for (const t1 of tau1Grid) {
    for (const t2 of tau2Grid) {
      if (t2 <= t1) continue;
      gridCandidates.push([A0 * 0.6, t1, A0 * 0.4, t2, C0]);
      gridCandidates.push([A0 * 0.4, t1, A0 * 0.6, t2, C0]);
    }
  }
  const candidates = [
    [A1_0, Math.max(tau1_0, 0.01), A2_0, Math.max(tau2_0, 0.01), C0],
    ...gridCandidates,
  ];

  const { params, loss } = bestOf(candidates, modelFn, pts, 5000);
  const [A1, tau1, A2, tau2, C] = params;

  return {
    params: { A1, tau1: tau1 * xRange, A2, tau2: tau2 * xRange, C, x0 },
    sample: x => modelFn(params, (x - x0) / xRange),
    loss,
    success: isFinite(loss) && loss < 1e8,
  };
}

// ── Sigmoid (Boltzmann) ───────────────────────────────────────────────────────
// f(x) = A / (1 + exp(-(x - x0) / k)) + C

export function fitSigmoid(rawPoints) {
  const pts  = sorted(rawPoints);
  const { pts: npts, xMin, xRange } = normalise(pts);

  const yVals = pts.map(p => p.y);
  const C0 = Math.min(...yVals);
  const A0 = Math.max(...yVals) - C0;
  const x0n = 0.5; // midpoint in normalised space

  function modelFn([A, x0, k, C], x) {
    const kk = Math.abs(k) < 1e-5 ? 1e-5 : k;
    return A / (1 + Math.exp(-(x - x0) / kk)) + C;
  }

  const candidates = [
    [ A0,  x0n,  0.20, C0],
    [ A0,  x0n, -0.20, C0],
    [ A0,  x0n,  0.10, C0],
    [-A0,  x0n,  0.20, C0 + A0],
  ];

  const { params, loss } = bestOf(candidates, modelFn, npts);
  const [A, x0fit, k, C] = params;

  return {
    params: { A, x0: xMin + x0fit * xRange, k: k * xRange, C },
    sample: x => modelFn(params, (x - xMin) / xRange),
    loss,
    success: isFinite(loss) && loss < 1e8,
  };
}

// ── Gaussian ──────────────────────────────────────────────────────────────────
// f(x) = A * exp(-(x - mu)^2 / (2*sigma^2)) + C

export function fitGaussian(rawPoints) {
  const pts = sorted(rawPoints);
  const { pts: npts, xMin, xRange } = normalise(pts);

  // Baseline = average of the two end points, not the global min: points are
  // in pixel space (y grows downward), so a bump that looks like a peak on
  // screen is a local *minimum* in raw y -- Math.min(y) would mistake the
  // peak itself for the baseline. Using the edges instead is agnostic to
  // which direction the bump goes.
  const C0     = (pts[0].y + pts[pts.length - 1].y) / 2;
  const peakPt = pts.reduce((best, p) => Math.abs(p.y - C0) > Math.abs(best.y - C0) ? p : best, pts[0]);
  const A0     = peakPt.y - C0;
  const mu0    = (peakPt.x - xMin) / xRange;

  function modelFn([A, mu, sigma, C], x) {
    const s = Math.max(Math.abs(sigma), 1e-4);
    return A * Math.exp(-0.5 * ((x - mu) / s) ** 2) + C;
  }

  // With arc-length anchor placement, an even number of clicks never lands at
  // the Gaussian peak, so A0 is underestimated and mu0 is biased. A mu scan
  // alone does not help because A is still wrong.
  //
  // Fix: for each (mu, sigma) grid point compute the analytically optimal A
  // via linear least-squares (C fixed at C0):
  //   A* = Σ(yi − C0)·g(xi) / Σ g(xi)²  where g(x) = exp(−½·((x−μ)/σ)²)
  // This recovers the correct amplitude even without a peak anchor.
  function bestAForMuSig(mu, sig) {
    const s = Math.max(sig, 1e-4);
    let num = 0, den = 0;
    for (const { x, y } of npts) {
      const g = Math.exp(-0.5 * ((x - mu) / s) ** 2);
      num += (y - C0) * g;
      den += g * g;
    }
    return den < 1e-12 ? A0 : num / den;
  }

  const muScan  = [0.2, 0.35, 0.5, 0.65, 0.8];
  const sigScan = [0.10, 0.20, 0.35];
  const candidates = [
    [ A0, mu0, 0.25, C0],
    [ A0, mu0, 0.15, C0],
    [ A0, mu0, 0.40, C0],
    [-A0, mu0, 0.25, C0 + A0],
    ...muScan.flatMap(mu => sigScan.map(sig => [bestAForMuSig(mu, sig), mu, sig, C0])),
  ];

  const { params, loss } = bestOf(candidates, modelFn, npts);
  const [A, mu, sigma, C] = params;

  return {
    params: { A, mu: xMin + mu * xRange, sigma: sigma * xRange, C },
    sample: x => modelFn(params, (x - xMin) / xRange),
    loss,
    success: isFinite(loss) && loss < 1e8,
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export function fitModel(modelName, points) {
  switch (modelName) {
    case 'single_exp':  return fitSingleExp(points);
    case 'double_exp':  return fitDoubleExp(points);
    case 'sigmoid':     return fitSigmoid(points);
    case 'gaussian':    return fitGaussian(points);
    default:            return null;
  }
}

// Sample the fitted model at numSamples evenly-spaced x values spanning
// the clicked points. Returns [{x, y}].
export function sampleFit(fitResult, points, numSamples = 200) {
  const xs   = points.map(p => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const out  = [];
  for (let i = 0; i <= numSamples; i++) {
    const x = xMin + (i / numSamples) * (xMax - xMin);
    out.push({ x, y: fitResult.sample(x) });
  }
  return out;
}
