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
  let blocked = Boolean(loaded.error && loaded.error !== 'empty');
  let active = store.active && typeof store.active === 'object' && Array.isArray(store.active.sets) &&
    Array.isArray(store.active.plan?.exercises) &&
    ['safety','warmup','exercise','rest','review'].includes(store.active.stage) ? store.active : null;
  let feedback = '';
  let tick = null;

  root.innerHTML = `
    <section class="fc-shell" aria-labelledby="fc-title">
      <div class="fc-heading"><div><span class="fc-kicker">TRAINING COCKPIT · PRIVATE DRAFT</span>
        <h3 id="fc-title">Today's training mission</h3></div><span class="fc-beta">Template differs from source · QA only</span></div>
      <p class="fc-help">Engineering review only: exercise choices and targets in this draft differ from the original Muscle & Strength routine.
        Do not use this as a verified training prescription. Plans never count as completed; logs stay in this browser.</p>
      <p id="fc-feedback" class="fc-feedback" role="status" aria-live="polite"></p>
      <div id="fc-setup" class="fc-card">
        <h4>Choose your program start</h4>
        <div class="fc-form-grid"><label>Start date <input id="fc-start-date" type="date"></label>
          <label>Schedule <select id="fc-mode"><option value="rolling">Rolling: continue after last logged workout</option><option value="fixed-week">Fixed weekdays</option></select></label>
          <label class="fc-check"><input type="checkbox" id="fc-optional"> Include optional unverified exercise</label>
        </div>
        <p class="fc-help">Sunday is a recovery day by default. Start with the minimum set ranges; adjust only after reviewing the program.</p>
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
            <label>Actual reps <input id="fc-reps" type="number" min="1" max="100" step="1" value="8"></label>
            <label>Actual load <input id="fc-load" type="number" min="0" max="1000" step="0.5" value="0"></label>
            <label>Unit <select id="fc-unit"><option value="lb">lb</option><option value="kg">kg</option></select></label>
            <label>Reps in reserve <select id="fc-rir"><option value="">Not measured</option><option value="3">3</option><option value="2" selected>2</option><option value="1">1</option><option value="0">0</option><option value="4">4</option><option value="5">5</option></select></label>
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
  function configure() {
    if (blocked || active) return;
    try {
      const config = T.normalizeConfig(program, {
        startDate: $('fc-start-date').value, mode: $('fc-mode').value,
        includeOptional: $('fc-optional').checked, setsChoice: 'min', restWeekdays: [0]
      });
      if (persist({ ...store, config, programId: program.id })) {
        notify('Training schedule saved locally. No workouts have been assumed completed.');
        render();
      }
    } catch (err) { notify(err.message); }
  }
  function start() {
    if (blocked || active || !store.config) return;
    const mission = T.todayMission(program, store.config, today(), store.records);
    if (mission.kind !== 'training' || mission.alreadyCompleted || mission.programComplete) return;
    const id = 'session-' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    const state = T.createSession({ id, date: today(), programId: program.id, dayPlan: mission.plan, now: Date.now() });
    if (persist({ ...store, active: state })) { active = state; feedback = ''; render(); }
  }
  function runAction(name) {
    if (blocked) return;
    switch (name) {
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
        if (!$('fc-reps').value || !$('fc-load').value) return notify('Enter actual reps and load before logging.');
        return call({ type: 'LOG_SET', reps: Number($('fc-reps').value), load: Number($('fc-load').value),
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
    $('fc-setup').hidden = Boolean(store.config);
    $('fc-mission').hidden = !store.config;
    $('fc-progress').hidden = !store.config;
    $('fc-session').hidden = !active;
    if (tick) { clearInterval(tick); tick = null; }
    if (!store.config) {
      $('fc-setup').querySelector('button').disabled = blocked;
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
    btn.hidden = Boolean(active) || mission.kind !== 'training' || mission.alreadyCompleted || mission.programComplete;
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
    if (active.stage === 'exercise' || active.stage === 'rest') {
      const step = T.currentStep(active);
      if (step) {
        $('fc-exercise-index').textContent = 'Exercise ' + step.exerciseNumber + ' of ' + step.ofExercises +
          ' · set ' + step.setNumber + ' of ' + step.ofSets;
        $('fc-exercise-name').textContent = step.exercise.name;
        $('fc-exercise-target').textContent = 'Target: ' + step.exercise.targetReps.min + '–' +
          step.exercise.targetReps.max + ' reps · ' + step.exercise.restSec + ' sec suggested rest · ' +
          step.exercise.verification;
      }
    }
    if (active.stage === 'rest') { updateTimer(); tick = setInterval(updateTimer, 1000); }
    if (active.stage === 'review') $('fc-review-count').textContent =
      active.sets.length + ' working sets recorded; ' + active.skipped.length + ' planned sets skipped.';
  }
  render();
}
