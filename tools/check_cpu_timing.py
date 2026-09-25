"""Is numba compile / cache-load time kept out of a run's CPU time?

    python tools/check_cpu_timing.py [--config DGWO] [--repeats 3]

Two fresh worker processes, each running the SAME task (instance 350, Quick
preset, seed 1) several times in a row and reporting process CPU time
(time.process_time) of opt.run() alone:

  cold    no warm-up at all: the first run pays the numba compile / cache load
  warmed  experiments/study.py's worker initializer (warm_worker) ran first,
          exactly as in a study; then the timed runs

PASS when, in the warmed worker, the first run's CPU time is within 15% of
the median of the later runs (the compile cost is not in it), and the
warm-up's own CPU time is reported separately. The cold worker's numbers are
shown for contrast only.
"""
import sys
import time
import argparse
import statistics
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

ROOT = Path(__file__).resolve().parent.parent
for p in (str(ROOT), str(ROOT / 'optimizer'), str(ROOT / 'experiments')):
    if p not in sys.path:
        sys.path.insert(0, p)


def timed_runs(config, repeats, warm):
    import os
    import study
    from preprocessing.pipeline import load_augmented_instance
    from thesis_algorithms import StandaloneDGWO, StandaloneMOGWO, SequentialHybrid, RepairBasedHybrid
    if warm:
        study.warm_worker()
    cls = {'DGWO': StandaloneDGWO, 'MOGWO': StandaloneMOGWO, 'SEQ': SequentialHybrid, 'REP': RepairBasedHybrid}[config]
    inst = load_augmented_instance({'data': {'raw_dir': str(ROOT / 'data' / 'raw')}}, instance_id=350,
                                   stop_seed=study.STOP_SEED, stop_count=study.STOP_COUNT)
    out = []
    for _ in range(repeats):
        opt = cls(items=inst['boxes'], container=inst['container'], pop_size=10, max_iter=60, seed=1)
        c0 = time.process_time()
        opt.run()
        out.append(round((time.process_time() - c0) * 1000.0, 1))
    return {'pid': os.getpid(), 'cpu_ms': out, 'warmup_cpu_ms': study._WORKER['warmup_cpu_ms']}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', default='DGWO', choices=['DGWO', 'MOGWO', 'SEQ', 'REP'])
    ap.add_argument('--repeats', type=int, default=3)
    a = ap.parse_args()
    res = {}
    for label, warm in (('cold', False), ('warmed', True)):
        with ProcessPoolExecutor(max_workers=1) as ex:       # a fresh process each
            res[label] = ex.submit(timed_runs, a.config, a.repeats, warm).result()
        r = res[label]
        print(f"{label:6s} worker pid {r['pid']}: warm-up CPU {r['warmup_cpu_ms'] if r['warmup_cpu_ms'] is not None else '—'} ms; "
              f"timed runs CPU ms: {', '.join(str(x) for x in r['cpu_ms'])}")
    w = res['warmed']['cpu_ms']
    later = statistics.median(w[1:])
    ratio = w[0] / later
    ok = abs(ratio - 1.0) <= 0.15
    print(f"warmed worker: first run / median of later runs = {ratio:.3f} (must be within 1 ± 0.15)")
    c = res['cold']['cpu_ms']
    print(f"cold worker (contrast): first run / median of later runs = {c[0] / statistics.median(c[1:]):.3f}")
    print('PASS' if ok else 'FAIL')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
