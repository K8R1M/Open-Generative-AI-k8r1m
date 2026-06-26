// Next.js instrumentation hook — the supported startup surface for the
// Open Generative AI app. Next invokes `register()` exactly once per server
// boot in the Node.js runtime (and once per worker). We use it to wire the
// native media gateway restart reconciliation so stale running/queued/created
// and missing-status/legacy jobs are settled on startup.
//
// Hard guarantees preserved by this hook:
//   - reconcileOnRestart() is called at most once per process (global guard).
//   - It never resubmits paid/provider work; the gateway reconciles in place.
//   - It is fire-and-forget so a corrupted job store cannot block server boot.
//   - It runs only in the Node.js runtime, never in the Edge runtime.
//   - It does not call live Vertex, Codex, MuAPI, or any provider; the gateway
//     reconciliation only verifies existing output and settles non-terminal jobs.
//
// Do not call reconcileOnRestart() from anywhere else; this is the single
// startup entry point. The Next route handler stays request-scoped.

async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NATIVE_MEDIA_SKIP_STARTUP_RECONCILE === '1') return;
  if (global.__NATIVE_MEDIA_STARTUP_RECONCILE_CALLED__) return;
  global.__NATIVE_MEDIA_STARTUP_RECONCILE_CALLED__ = true;

  let gateway;
  try {
    // ponytail: hide this from Next's instrumentation bundler; gateway uses Node-only builtins.
    gateway = eval('require')(process.cwd() + '/native-media-gateway/exports.js');
  } catch (err) {
    console.error('[native-media] startup reconcile: gateway load failed:', String(err && err.message));
    return;
  }
  if (!gateway || typeof gateway.reconcileOnRestart !== 'function') return;

  // Fire-and-forget: never crash the server boot or block request handling.
  Promise.resolve()
    .then(() => gateway.reconcileOnRestart())
    .then((counts) => {
      console.log('[native-media] startup reconciliation complete', counts);
    })
    .catch((err) => {
      console.error('[native-media] startup reconciliation failed:', String(err && err.message));
    });
}

module.exports = { register };
