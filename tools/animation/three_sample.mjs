// Independent reference: sample a GLB with three.js AnimationMixer (the engine model-viewer 4.1.0 uses).
// Usage: node tools/animation/three_sample.mjs MODEL.glb t0 t1 ...  (needs: npm i --no-save --prefix tools/animation three@0.172.0)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs';
const [file, ...ts] = process.argv.slice(2);
const buf = fs.readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
new GLTFLoader().parse(ab, '', (g) => {
  const mixer = new THREE.AnimationMixer(g.scene);
  const act = mixer.clipAction(g.animations[0]);
  act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; act.play();
  const out = {duration: g.animations[0].duration, frames: []};
  const names = ['LeftUpLeg','RightUpLeg','LeftFoot','RightFoot','LeftToeBase','RightToeBase'];
  for (const t of ts.map(Number)) {
    mixer.setTime(t); g.scene.updateMatrixWorld(true);
    const f = {t};
    for (const n of names) { const v = new THREE.Vector3(); g.scene.getObjectByName(n).getWorldPosition(v); f[n] = [v.x, v.y, v.z]; }
    out.frames.push(f);
  }
  console.log(JSON.stringify(out));
}, (e) => { console.error(e); process.exit(1); });
