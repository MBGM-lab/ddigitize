"""
Generate synthetic example figures for the ddigitalize manuscript.

Three figures illustrate the types of biological traces that ddigitalize
is designed to extract from published graphs:

  1. example_electrophysiology
       Left:  current-clamp action potentials at four injected currents
       Right: voltage-clamp Na⁺ channel activation at five test-pulse voltages

  2. example_dose_response
       Hill-equation sigmoid fits (four compounds) with scattered data points
       on a log-concentration axis

  3. example_timeseries
       Top:    calcium imaging — five neurons responding to five repeated stimuli
       Bottom: LFP damped oscillations — five frequency bands (θ, α, β, γ, HFO)

Usage:
    python generate_example_figures.py [--out OUT_DIR]

Default output directory: manuscript_figures/
Output files (PNG + SVG):
    example_electrophysiology.{png,svg}
    example_dose_response.{png,svg}
    example_timeseries.{png,svg}
"""

import argparse
import os

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

FIG_DPI = 150
SEED = 42   # base seed; individual traces use SEED + offset for independence


def _rng(seed):
    return np.random.RandomState(seed)


def _save(fig, out_dir, stem):
    os.makedirs(out_dir, exist_ok=True)
    for ext in ('png', 'svg'):
        fig.savefig(os.path.join(out_dir, f'{stem}.{ext}'),
                    dpi=FIG_DPI, bbox_inches='tight')
    plt.close(fig)


# ── Figure 1: Electrophysiology ──────────────────────────────────────────────

def make_electrophysiology(out_dir):
    fig, (ax_ap, ax_na) = plt.subplots(1, 2, figsize=(12, 4))

    # ── Left panel: current-clamp action potentials ──────────────────────────
    t_ap = np.linspace(0, 40, 4000)   # ms

    currents  = [50, 100, 200, 400]   # injected current (pA)
    labels_ap = ['50 pA', '100 pA', '200 pA', '400 pA']
    colors_ap = ['C0', 'C1', 'C2', 'C3']

    t_stim = 5.0   # stimulus onset (ms)
    t_peak = 6.5   # spike peak time (ms)

    for i, (I_inj, color, label) in enumerate(zip(currents, colors_ap, labels_ap)):
        r = _rng(SEED + i)
        V_rest = -70.0

        # Narrow Gaussian spike (amplitude ~41 mV → peak near -29 mV)
        spike = 41.0 * np.exp(-0.5 * ((t_ap - t_peak) / 0.35) ** 2)
        spike[t_ap < t_stim] = 0.0

        # Afterhyperpolarization: exponential below rest
        t_ahp   = t_peak + 0.8
        ahp_amp = 5.0 + i * 2.5   # 5, 7.5, 10, 12.5 mV below rest
        tau_ahp = 7.0              # ms decay constant
        ahp = -ahp_amp * np.where(t_ap > t_ahp,
                                   np.exp(-(t_ap - t_ahp) / tau_ahp), 0.0)

        V = V_rest + spike + ahp + r.randn(len(t_ap)) * 0.5
        ax_ap.plot(t_ap, V, color=color, lw=0.8, label=label)

    ax_ap.set_xlabel('Time (ms)')
    ax_ap.set_ylabel('Membrane potential (mV)')
    ax_ap.set_title('Action potentials')
    ax_ap.set_xlim(0, 40)
    ax_ap.legend(title='Inj. current', fontsize=8, title_fontsize=8,
                 loc='upper right')
    ax_ap.spines[['top', 'right']].set_visible(False)

    # ── Right panel: voltage-clamp Na⁺ channel activation ───────────────────
    t_na = np.linspace(0, 100, 10000)   # ms

    v_steps   = [-60, -40, -20,  0,  20]   # test-pulse voltages (mV)
    labels_na = ['-60 mV', '-40 mV', '-20 mV', '0 mV', '20 mV']
    # Tab10 colour indices 0, 9, 2, 8, 6 → blue, cyan, green, olive, pink
    tab10     = plt.cm.tab10.colors
    colors_na = [tab10[k] for k in (0, 9, 2, 8, 6)]

    t_step_on  = 10.0   # ms — voltage step start
    t_step_off = 75.0   # ms — voltage step end

    # Per-voltage: scale parameter (pA), activation tau (ms), inactivation tau (ms)
    # Shape: I(t) = I_scale * (1 - exp(-t/tau_act)) * exp(-t/tau_inact)
    # Actual peak ≈ I_scale * f(tau_act, tau_inact) < I_scale
    i_scale   = [  -3,  -12,  -32, -175, -340]
    tau_act   = [ 0.8,  0.7,  0.6,  0.5,  0.5]
    tau_inact = [ 3.0,  4.5,  7.0, 13.0, 22.0]

    ax_na.axhline(0, color='gray', ls='--', lw=0.8)

    for i, (V, color, label, I_sc, ta, th) in enumerate(
            zip(v_steps, colors_na, labels_na, i_scale, tau_act, tau_inact)):
        r = _rng(SEED + 100 + i)
        I = np.zeros_like(t_na)
        mask  = (t_na >= t_step_on) & (t_na < t_step_off)
        t_rel = t_na[mask] - t_step_on
        I[mask] = I_sc * (1 - np.exp(-t_rel / ta)) * np.exp(-t_rel / th)
        I += r.randn(len(t_na)) * 0.5
        ax_na.plot(t_na, I, color=color, lw=0.8, label=label)

    ax_na.set_xlabel('Time (ms)')
    ax_na.set_ylabel('Current (pA)')
    ax_na.set_title('Na$^+$ channel activation')
    ax_na.set_xlim(0, 100)
    ax_na.legend(title='Test pulse', fontsize=8, title_fontsize=8,
                 loc='lower right')
    ax_na.spines[['top', 'right']].set_visible(False)

    fig.tight_layout()
    _save(fig, out_dir, 'example_electrophysiology')


# ── Figure 2: Dose-response curves ──────────────────────────────────────────

def _hill(x, ec50, n, emax):
    """Hill equation: emax * x^n / (EC50^n + x^n)."""
    return emax * x ** n / (ec50 ** n + x ** n)


def make_dose_response(out_dir):
    fig, ax = plt.subplots(figsize=(7, 6))

    x_fine = np.logspace(-4, 4, 500)   # μM — smooth curve

    compounds = [
        # label         ec50    n_hill  emax   scatter_seed  n_pts
        ('Compound A',  0.010,  1.5,   100.0,  SEED + 0,     9),
        ('Compound B',  0.30,   1.2,    89.0,  SEED + 1,     9),
        ('Compound C',  2.0,    2.0,    72.0,  SEED + 2,     9),
        ('Compound D',  100.0,  1.3,    94.0,  SEED + 3,     9),
    ]

    for label, ec50, n_hill, emax, dseed, n_pts in compounds:
        y_fit = _hill(x_fine, ec50, n_hill, emax)
        line, = ax.plot(x_fine, y_fit, lw=2, label=label)
        color = line.get_color()

        # Scatter data points spread 3 log-units either side of EC50
        r = _rng(dseed)
        x_data = np.logspace(np.log10(ec50) - 3, np.log10(ec50) + 3, n_pts)
        y_data = _hill(x_data, ec50, n_hill, emax) + r.randn(n_pts) * 4.0
        ax.scatter(x_data, y_data, color=color, s=30, zorder=5)

    ax.axhline(50, color='gray', ls=':', lw=0.8)
    ax.set_xscale('log')
    ax.set_xlabel('Concentration (μM)')
    ax.set_ylabel('Response (% of maximum)')
    ax.set_title('Dose-response curves')
    ax.legend(fontsize=9, loc='upper left')
    ax.set_xlim(1e-4, 1e4)
    ax.spines[['top', 'right']].set_visible(False)

    fig.tight_layout()
    _save(fig, out_dir, 'example_dose_response')


# ── Figure 3: Time-series ────────────────────────────────────────────────────

def make_timeseries(out_dir):
    fig, (ax_ca, ax_lfp) = plt.subplots(2, 1, figsize=(10, 7))

    # ── Top panel: calcium imaging — 5 cells, 5 repeated stimuli ─────────────
    t_ca       = np.linspace(0, 100, 10000)   # seconds
    stim_times = [10, 30, 50, 70, 90]         # stimulation onset times (s)

    # baseline: resting ΔF/F₀; amp: response amplitude; tau_decay: in seconds
    cells = [
        # label    baseline  amp   tau_rise  tau_decay  seed
        ('Cell 1', 0.00,    0.85,  0.5,      8.0,  SEED + 10),
        ('Cell 2', 0.25,    0.60,  0.5,      6.0,  SEED + 11),
        ('Cell 3', 0.50,    1.10,  0.5,      7.0,  SEED + 12),
        ('Cell 4', 0.75,    0.35,  0.5,      5.5,  SEED + 13),
        ('Cell 5', 1.00,    1.05,  0.5,     10.0,  SEED + 14),
    ]
    colors_cells = ['C0', 'C1', 'C2', 'C3', 'C4']

    for (label, baseline, amp, tau_rise, tau_decay, dseed), color in \
            zip(cells, colors_cells):
        r   = _rng(dseed)
        F   = np.full_like(t_ca, baseline)
        for t_s in stim_times:
            mask  = t_ca >= t_s
            t_rel = t_ca[mask] - t_s
            F[mask] += amp * (1 - np.exp(-t_rel / tau_rise)) \
                           * np.exp(-t_rel / tau_decay)
        F += r.randn(len(t_ca)) * 0.015
        ax_ca.plot(t_ca, F, color=color, lw=0.8, label=label)

    for t_s in stim_times:
        ax_ca.axvline(t_s, color='gray', ls='--', lw=0.6, alpha=0.7)

    ax_ca.set_xlabel('Time (s)')
    ax_ca.set_ylabel('ΔF/F₀')
    ax_ca.set_title('Calcium imaging – five neurons (5× stimulation)')
    ax_ca.set_xlim(0, 100)
    ax_ca.legend(fontsize=8, ncol=3, loc='upper right')
    ax_ca.spines[['top', 'right']].set_visible(False)

    # ── Bottom panel: LFP damped oscillations ────────────────────────────────
    t_lfp = np.linspace(0, 1.5, 15000)   # seconds

    # amp: initial amplitude; tau_damp: envelope decay (s); offset: vertical shift
    lfp_bands = [
        # label          freq  tau_damp  amp   offset  seed
        ('6 Hz (θ)',      6,   5.0,     0.8,  0.0,  SEED + 20),
        ('10 Hz (α)',    10,   3.0,     1.0,  2.0,  SEED + 21),
        ('20 Hz (β)',    20,   2.0,     1.0,  4.0,  SEED + 22),
        ('40 Hz (γ)',    40,   1.5,     1.0,  7.0,  SEED + 23),
        ('80 Hz (HFO)',  80,   0.8,     1.0, 10.0,  SEED + 24),
    ]
    colors_lfp = ['C3', 'C0', 'C2', 'C4', 'C1']   # red, blue, green, purple, orange

    for (label, freq, tau, amp, offset, dseed), color in \
            zip(lfp_bands, colors_lfp):
        r   = _rng(dseed)
        sig = amp * np.exp(-t_lfp / tau) * np.sin(2 * np.pi * freq * t_lfp)
        sig += r.randn(len(t_lfp)) * 0.07
        ax_lfp.plot(t_lfp, sig + offset, color=color, lw=0.6, label=label)

    ax_lfp.set_xlabel('Time (s)')
    ax_lfp.set_ylabel('LFP (a.u., offset)')
    ax_lfp.set_title('Local field potential – damped oscillations')
    ax_lfp.set_xlim(0, 1.5)
    ax_lfp.legend(fontsize=8, ncol=2, loc='upper right')
    ax_lfp.spines[['top', 'right']].set_visible(False)

    fig.tight_layout()
    _save(fig, out_dir, 'example_timeseries')


# ── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', default='manuscript_figures',
                        help='Output directory (default: manuscript_figures/)')
    args = parser.parse_args()

    print('Generating example_electrophysiology ...')
    make_electrophysiology(args.out)

    print('Generating example_dose_response ...')
    make_dose_response(args.out)

    print('Generating example_timeseries ...')
    make_timeseries(args.out)

    print(f'\nFigures written to {args.out}/')


if __name__ == '__main__':
    main()
