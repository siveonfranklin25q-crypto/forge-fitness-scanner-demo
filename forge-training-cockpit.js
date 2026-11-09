// FORGE Issue #8: UI-only, local-first workout cockpit for Claude's reviewed Issue #5 API.
// No analytics/network calls, no real user data, no modification of the legacy v0.8 store.
import * as T from './src/training-programs/index.js';

const root = document.getElementById('forge-training-cockpit');
if (root) initCockpit();

function initCockpit() {
  const program = T.CLASSIC_SIX_DAY;
  const $ = id => root.querySelector('#' + id);
  const today = () => {
    const d = new Date();
    const n = v => String(v).padStart(2, '0');
    return d.getFullYear() + '-' + n(d.getMonth() + 1) + '-' + n(d.getDate());
  };
  let storage = null;
  try { storage = window.localStorage; } catch { /* blocked browser storage */ }
  const loaded = storage ? T.load(storage) : { store: T.emptyStore(), error: 'storage-unavailable' };
  let store = loaded.store;
  // Migrate old v1 A/B/C scheduling in memory; do not rewrite historic workouts.
  if (store.config) {
    const c = { ...store.config };
    if (Array.isArray(c.rotation)) {
      c.rotation = c.rotation.join(',') === 'A,B,C'
        ? [...program.rotation] : c.rotation.map(k => T.migrateDayKey(program, k));
    }
    c.volume = ['reduced', 'source'].includes(c.volume) ? c.volume : 'reduced';
    c.allowPendingSource = false;
    delete c.includeOptional;
    delete c.setsChoice;
    store = { ...store, config: c };
  }
  let blocked = Boolean(loaded.error && loaded.error !== 'empty');
  // Never resume an old-version or unverified plan as if its targets were current.
  // Preserve it until the owner explicitly archives or discards it.
  const prior = store.active;
  const canResume = prior && typeof prior === 'object' && prior.version === 1 &&
    prior.programId === program.id && program.days[prior.dayKey] &&
    ['safety', 'warmup', 'exercise', 'rest', 'review'].includes(prior.stage) &&
    Array.isArray(prior.sets) && Array.isArray(prior.skipped) &&
    Array.isArray(prior.plan?.exercises) && prior.plan?.sourceComplete === true &&
    prior.plan?.dayKey === prior.dayKey && !prior.plan?.blocked &&
    ['reduced','source'].includes(prior.plan?.volume) &&
    prior.plan.exercises.length > 0 &&
    prior.plan.exercises.every(e => e.verification === 'primary-source' &&
      ['reduced','source'].includes(e.volume));
  let staleActive = prior && !canResume ? prior : null;
  let active = canResume ? prior : null;
  let feedback = '';
  let tick = null;

  root.innerHTML = `
    <section class="fc-shell" aria-labelledby="fc-title">
      <div class="fc-heading"><div><span class="fc-kicker">TRAINING COCKPIT · PRIVATE DRAFT</span>
        <h3 id="fc-title">Today's training mission</h3></div><span class="fc-beta">44 exercise targets checked · owner review pending</span></div>
      <p class="fc-help">The six distinct workout tables now match the cited Muscle &amp; Strength article. Reduced-volume training is a FORGE default, not the author's full prescription.
        This demanding intermediate routine is awaiting owner review and isn't personalized medical clearance. Logs remain in this browser.</p>
      <p id="fc-feedback" class="fc-feedback" role="status" aria-live="polite"></p>
      <div id="fc-legacy" class="fc-card" hidden>
        <h4>Previous workout needs review</h4>
        <p class="fc-help">Your device has an unfinished workout from an earlier or unverified template.
          FORGE will not resume it with the wrong exercise targets or count it as completed.</p>
        <p id="fc-legacy-detail" class="fc-help"></p>
        <div class="fc-buttons">
          <button class="secondary-btn" type="button" data-fc-action="archive-legacy">Preserve old workout in local archive</button>
          <button class="fc-danger" type="button" data-fc-action="discard-legacy">Discard unfinished workout</button>
        </div>
        <p class="fc-help">Archiving retains the full original snapshot in this browser's private data but excludes it from
          the verified program's progress calculations. Discarding requires confirmation and cannot be undone.</p>
      </div>
      <div id="fc-setup" class="fc-card">
        <h4>Choose your program start</h4>
        <div class="fc-form-grid"><label>Start date <input id="fc-start-date" type="date"></label>
          <label>Schedule <select id="fc-mode"><option value="rolling">Rolling: continue after last logged workout</option><option value="fixed-week">Fixed weekdays</option></select></label>
          <label>Training volume <select id="fc-volume"><option value="reduced" selected>Reduced (FORGE starting default)</option><option value="source">Full source volume — demanding, opt-in</option></select></label>
        </div>
        <p class="fc-help">Sunday is a recovery day by default. The original routine is demanding; use the full source volume only after reviewing its workload.</p>
        <button class="primary" type="button" data-fc-action="configure">Set training plan</button>
      </div>
      <div id="fc-mission" class="fc-card" hidden>
        <span class="fc-kicker" id="fc-date-label"></span>
        <h4 id="fc-mission-title"></h4><p id="fc-mission-body"></p>
        <p class="fc-help" id="fc-mission-meta"></p>
        <div class="fc-buttons"><button class="primary" type="button" data-fc-action="start">Start today's session</button>
          <a class="fc-link" href="#strength-lab">See legacy strength log</a></div>
      </div>
      <div id="fc-session" class="fc-card" hidden>
        <div class="fc-session-head"><span class="fc-kicker">LIVE SESSION · NOT YET COMPLETED</span><strong id="fc-live-count"></strong></div>
        <h4 id="fc-session-title"></h4><p class="fc-help" id="fc-stage-note"></p>
        <div id="fc-safety" hidden>
          <p>Check how you're feeling before lifting. If chest pain, faintness, dizziness, or sharp pain occurs, do not train.</p>
          <div class="fc-form-grid"><label>Joint/muscle discomfort <select id="fc-pain"><option value="none">None</option><option value="mild">Mild</option><option value="sharp">Sharp / worsening</option></select></label>
          <label>Sleep last night (hours) <input id="fc-sleep" type="number" min="0" max="24" step="0.5" placeholder="Optional"></label>
          </div><label class="fc-check"><input type="checkbox" id="fc-warning"> Chest pain, fainting sensation, or dizziness</label>
          <label class="fc-check"><input type="checkbox" id="fc-unwell"> Fever / feeling unwell</label>
          <div class="fc-buttons"><button class="primary" type="button" data-fc-action="safety">Continue safety check</button>
          <button class="secondary-btn" type="button" data-fc-action="skip-session">Skip session</button></div>
        </div>
        <div id="fc-warmup" hidden>
          <p>Warm up gradually before working sets. The suggested five minutes is a FORGE default, not a verified source instruction.</p>
          <div class="fc-buttons"><button class="primary" type="button" data-fc-action="warmup-done">Warm-up completed</button>
          <button class="secondary-btn" type="button" data-fc-action="warmup-skip">Skip warm-up</button></div>
        </div>
        <div id="fc-exercise" hidden>
          <p class="fc-kicker" id="fc-exercise-index"></p><h4 id="fc-exercise-name"></h4>
          <p id="fc-exercise-target"></p>
          <div class="fc-form-grid">
            <label id="fc-reps-wrap">Actual reps completed <input id="fc-reps" type="number" min="1" max="100" step="1" placeholder="Enter actual reps" required></label>
            <label id="fc-hold-wrap" hidden>Actual seconds held <input id="fc-seconds" type="number" min="1" max="600" step="1" placeholder="Enter actual seconds held"></label>
            <label id="fc-load-wrap">External load (enter 0 only if actually unweighted) <input id="fc-load" type="number" min="0" max="1000" step="0.5" placeholder="Enter actual load" required></label>
            <label id="fc-unit-wrap">Unit <select id="fc-unit"><option value="lb">lb</option><option value="kg">kg</option></select></label>
            <label id="fc-rir-wrap">Reps in reserve <select id="fc-rir"><option value="" selected>Not measured</option><option value="3">3</option><option value="2">2</option><option value="1">1</option><option value="0">0</option><option value="4">4</option><option value="5">5</option></select></label>
          </div><div class="fc-buttons"><button class="primary" type="button" data-fc-action="log">Log completed set</button>
            <button class="secondary-btn" type="button" data-fc-action="skip-set">Skip set</button>
            <button class="secondary-btn" type="button" data-fc-action="skip-exercise">Skip exercise</button></div>
        </div>
        <div id="fc-rest" hidden><h4 id="fc-rest-count"></h4>
          <p>Rest is part of training. Continue when you're ready.</p>
          <button class="primary" type="button" data-fc-action="rest-done">Continue to next set</button></div>
        <div id="fc-review" hidden><h4>Session review</h4>
          <p id="fc-review-count"></p>
          <label>How did you feel?<select id="fc-symptoms"><option value="">Choose an answer</option><option value="none">No concerning symptoms</option><option value="mild">Mild discomfort</option><option value="worse">Worsening pain or symptoms</option></select></label>
          <button class="primary" type="button" data-fc-action="finish">Save session review</button>
        </div>
        <div class="fc-buttons fc-secondary-actions">
          <button class="secondary-btn" type="button" data-fc-action="abort">End session early</button>
          <button class="fc-danger" type="button" data-fc-action="pain-stop">Stop for pain / warning symptoms</button>
        </div>
      </div>
      <div id="fc-progress" class="fc-card" hidden><h4>Real training progress</h4>
        <p id="fc-progress-count"></p><p id="fc-progress-detail" class="fc-help"></p>
        <p id="fc-latest" class="fc-help"></p>
      </div>
    </section>`;
  $('fc-start-date').value = today();

  function notify(msg) { feedback = msg; $('fc-feedback').textContent = msg; }

  function persist(next) {
    if (!storage || !T.save(storage, next)) {
      notify('Unable to save on this device. No completed session is claimed. Check browser storage permissions.');
      return false;
    }
    store = next;
    return true;
  }
  function call(action) {
    if (!active) return;
    const next = T.reduce(active, { ...action, now: Date.now() });
    if (next.error) { notify(next.error); return; }
    if (next.stage === 'done' || next.stage === 'stopped') {
      const record = T.toRecord(next);
      const result = T.addRecord(store, record);
      if (!persist(result)) return;
      active = null;
      notify(record.status === 'completed'
        ? 'Completed session saved: ' + record.loggedSets + ' actual sets.'
        : 'Session saved as ' + record.status.replace('_', ' ') + ': ' + record.loggedSets + ' actual sets.');
    } else {
      if (!persist({ ...store, active: next })) return;
      active = next;
      feedback = '';
    }
    render();
  }
  function resolveLegacy(action) {
    if (blocked || !staleActive) return;
    if (action === 'discard-legacy' &&
        !window.confirm('Discard this unfinished workout? Its original entries will not be recoverable.')) return;
    if (action === 'archive-legacy' && (store.quarantine?.length ?? 0) >= 200) {
      notify('The private archive is full. No data was changed. Save a separate backup before clearing old records.');
      return;
    }
    const next = { ...store, active: null };
    if (action === 'archive-legacy') {
      next.quarantine = [...(store.quarantine ?? []),
        { kind: 'legacy-active-session', archivedAt: new Date().toISOString(),
          reason: 'Older or unverified exercise template; not counted toward verified progress',
          originalSession: staleActive }];
    }
    if (!persist(next)) return;
    staleActive = null;
    notify(action === 'archive-legacy'
      ? 'Old workout preserved in this browser\'s private archive. It has NOT been counted as a completed session.'
      : 'You explicitly discarded the unfinished old workout. Your completed records were left unchanged.');
    render();
  }
  function configure() {
    if (blocked || active || staleActive) return;
    try {
      const config = T.normalizeConfig(program, {
        startDate: $('fc-start-date').value, mode: $('fc-mode').value,
        volume: $('fc-volume').value, allowPendingSource: false, restWeekdays: [0]
      });
      if (persist({ ...store, config, programId: program.id })) {
        notify('Training schedule saved locally. No workouts have been assumed completed.');
        render();
      }
    } catch (err) { notify(err.message); }
  }
  function start() {
    if (blocked || active || staleActive || !store.config) return;
    const mission = T.todayMission(program, store.config, today(), store.records);
    if (!mission.canStart || mission.programComplete) return;
    const id = 'session-' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    let state;
    try { state = T.createSession({ id, date: today(), programId: program.id, dayPlan: mission.plan, now: Date.now() }); }
    catch (error) { notify('Cannot start session: ' + error.message); return; }
    if (persist({ ...store, active: state })) { active = state; feedback = ''; render(); }
  }
  function runAction(name) {
    if (blocked) return;
    switch (name) {
      case 'archive-legacy':
      case 'discard-legacy': return resolveLegacy(name);
      case 'configure': return configure();
      case 'start': return start();
      case 'skip-session': return call({ type: 'SKIP_SESSION' });
      case 'safety': {
        const sleep = $('fc-sleep').value.trim();
        if (sleep && (!Number.isFinite(Number(sleep)) || Number(sleep) < 0 || Number(sleep) > 24)) return notify('Sleep must be between 0 and 24 hours.');
        return call({ type: 'SAFETY_CHECK', answers: {
          pain: $('fc-pain').value, sleepHours: sleep ? Number(sleep) : null,
          chestPainOrDizziness: $('fc-warning').checked, feelingUnwell: $('fc-unwell').checked
        } });
      }
      case 'warmup-done': return call({ type: 'WARMUP_DONE' });
      case 'warmup-skip': return call({ type: 'SKIP_WARMUP' });
      case 'log': {
        if (!active || active.stage !== 'exercise') return notify('Start a live exercise before logging.');
        const step = T.currentStep(active);
        if (!step) return notify('No current exercise.');
        if (step.exercise.measure === 'time') {
          const raw = $('fc-seconds').value.trim(), seconds = Number(raw);
          if (!raw || !Number.isInteger(seconds) || seconds < 1 || seconds > 600)
            return notify('Enter the actual hold time, 1–600 whole seconds. The target is not assumed complete.');
          call({ type: 'LOG_SET', seconds, load: 0, unit: 'kg', rir: null });
          if (!$('fc-feedback').textContent) $('fc-seconds').value = '';
          return;
        }
        const rawReps = $('fc-reps').value.trim(), rawLoad = $('fc-load').value.trim();
        const reps = Number(rawReps), load = Number(rawLoad);
        if (!rawReps || !Number.isInteger(reps) || reps < 1 || reps > 100 ||
            !rawLoad || !Number.isFinite(load) || load < 0 || load > 1000)
          return notify('Enter actual completed reps (1–100) and external load (0–1000); an unweighted set requires typing 0.');
        return call({ type: 'LOG_SET', reps, load,
          unit: $('fc-unit').value, rir: $('fc-rir').value === '' ? null : Number($('fc-rir').value) });
      }
      case 'skip-set': return call({ type: 'SKIP_SET' });
      case 'skip-exercise': return call({ type: 'SKIP_EXERCISE' });
      case 'rest-done': return call({ type: 'REST_DONE' });
      case 'abort': return call({ type: 'ABORT' });
      case 'pain-stop': return call({ type: 'PAIN_STOP', severity: 'sharp' });
      case 'finish': {
        if (!$('fc-symptoms').value) return notify('Choose how you felt before saving.');
        return call({ type: 'FINISH', symptoms: $('fc-symptoms').value });
      }
      default: return;
    }
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button[data-fc-action]');
    if (button && root.contains(button)) runAction(button.dataset.fcAction);
  });

  function updateTimer() {
    if (active?.stage !== 'rest') return;
    const remaining = T.restRemainingSec(active, Date.now());
    $('fc-rest-count').textContent = remaining ? 'Suggested rest: ' + remaining + ' seconds remaining' : 'Rest interval finished';
  }
  function render() {
    $('fc-feedback').textContent = feedback || (blocked ? 'Training storage could not be read safely. This cockpit will not overwrite it.' : '');
    $('fc-legacy').hidden = !staleActive;
    if (staleActive) {
      $('fc-legacy-detail').textContent = 'Saved on ' + (staleActive.date || 'unknown date') + ' · ' +
        (Array.isArray(staleActive.sets) ? staleActive.sets.length : 0) + ' recorded set(s).';
    }
    $('fc-setup').hidden = Boolean(store.config);
    $('fc-mission').hidden = !store.config;
    $('fc-progress').hidden = !store.config;
    $('fc-session').hidden = !active;
    if (tick) { clearInterval(tick); tick = null; }
    if (!store.config) {
      $('fc-setup').querySelector('button').disabled = blocked || Boolean(staleActive);
      return;
    }
    let mission, summary;
    try {
      mission = T.todayMission(program, store.config, today(), store.records);
      summary = T.weeklySummary(program, store.config, store.records, today());
    } catch (err) { notify('Stored training configuration needs review: ' + err.message); return; }
    $('fc-date-label').textContent = today() + ' · week ' + mission.programWeek;
    $('fc-mission-title').textContent = mission.headline;
    $('fc-mission-body').textContent = mission.body;
    $('fc-mission-meta').textContent = (mission.programComplete ? '12-week window reached · review before extending. ' : '') +
      (mission.next ? 'Next planned session: ' + mission.next.date + ' · ' + mission.next.title : 'No upcoming training session in the next seven days.');
    const btn = $('fc-mission').querySelector('button[data-fc-action="start"]');
    btn.hidden = Boolean(active) || Boolean(staleActive) || !mission.canStart || mission.programComplete;
    btn.disabled = blocked;
    $('fc-progress-count').textContent = summary.sessionsDone + ' logged training sessions this week · ' +
      summary.loggedSets + ' working sets recorded.';
    $('fc-progress-detail').textContent = summary.setCompletionRatio === null
      ? 'No finished workout sets logged this week. Planned sets are not counted as work.'
      : Math.round(summary.setCompletionRatio * 100) + '% of planned sets in saved training sessions were logged. ' +
        summary.sessionsStoppedForSafety + ' safety stops recorded.';
    const last = store.records.at(-1);
    $('fc-latest').textContent = last ? 'Last saved: ' + last.date + ' · ' + last.status.replace('_',' ') + ' · ' +
      last.loggedSets + ' actual sets.' : 'No saved training sessions yet.';
    if (!active) return;
    $('fc-session-title').textContent = active.title;
    $('fc-live-count').textContent = active.sets.length + ' actual sets logged';
    $('fc-stage-note').textContent = active.safety?.message ?? 'Only sets you explicitly record will count.';
    for (const stage of ['safety','warmup','exercise','rest','review']) $('fc-' + stage).hidden = active.stage !== stage;
    if (active.stage === 'exercise') {
      // Each new working set starts blank; never borrow a prior value without consent.
      $('fc-reps').value = '';
      $('fc-load').value = '';
      $('fc-rir').value = '';
      $('fc-seconds').value = '';
    }
    if (active.stage === 'exercise' || active.stage === 'rest') {
      const step = T.currentStep(active);
      if (step) {
        $('fc-exercise-index').textContent = 'Exercise ' + step.exerciseNumber + ' of ' + step.ofExercises +
          ' · set ' + step.setNumber + ' of ' + step.ofSets;
        $('fc-exercise-name').textContent = step.exercise.name;
        const timed = step.exercise.measure === 'time';
        $('fc-reps-wrap').hidden = timed;
        $('fc-hold-wrap').hidden = !timed;
        $('fc-load-wrap').hidden = timed;
        $('fc-unit-wrap').hidden = timed;
        $('fc-rir-wrap').hidden = timed;
        const target = timed ? 'Target hold: ' + step.exercise.targetHoldSec + ' seconds · enter actual time held'
          : 'Target: ' + step.exercise.targetReps.min + '–' + step.exercise.targetReps.max + ' reps';
        $('fc-exercise-target').textContent = target + ' · ' + step.exercise.restSec +
          ' sec suggested rest · ' + step.exercise.verification +
          ' · ' + (step.exercise.volume === 'reduced' ? 'reduced FORGE volume' : 'full source volume');
      }
    }
    if (active.stage === 'rest') { updateTimer(); tick = setInterval(updateTimer, 1000); }
    if (active.stage === 'review') $('fc-review-count').textContent =
      active.sets.length + ' working sets recorded; ' + active.skipped.length + ' planned sets skipped.';
  }
  render();
}
