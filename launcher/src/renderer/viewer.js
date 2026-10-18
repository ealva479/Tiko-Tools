import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const PREVIEW_ORDER = ['glb', 'gltf', 'fbx', 'obj'];
const LOADERS = { glb: GLTFLoader, gltf: GLTFLoader, fbx: FBXLoader, obj: OBJLoader };

export const previewFile = asset => PREVIEW_ORDER.map(f => asset.files.find(x => x.format === f)).find(Boolean);
export const assetUrl = p => 'asset://local/' + encodeURI(p.replace(/\\/g, '/'));

// One shared WebGL context: browsers cap live contexts, so a single canvas is
// moved into whichever card is being previewed.
let renderer, scene, camera, controls, current, raf;

function init() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1013);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
}

function dispose(obj) {
  obj.traverse(o => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) v?.isTexture && v.dispose();
      m.dispose();
    }
  });
}

export function stop() {
  cancelAnimationFrame(raf);
  if (current) { scene.remove(current); dispose(current); current = null; }
  renderer?.domElement.remove();
}

function frame(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const r = box.getBoundingSphere(new THREE.Sphere()).radius || 1;
  const dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.15;
  camera.near = dist / 100; camera.far = dist * 100; camera.updateProjectionMatrix();
  camera.position.copy(center).add(new THREE.Vector3(1, 0.6, 1).normalize().multiplyScalar(dist));
  controls.target.copy(center);
  controls.update();
}

// Shows `asset` inside `container`. Resolves with a PNG data URL of the first frame.
export async function show(asset, container) {
  const file = previewFile(asset);
  if (!file) throw new Error('No previewable format (needs glb, gltf, fbx or obj)');
  init(); stop();
  const url = assetUrl(file.path);
  const loaded = await new LOADERS[file.format]().loadAsync(url);
  const obj = loaded.scene || loaded;
  scene.add(obj); current = obj;
  container.replaceChildren(renderer.domElement);
  const { clientWidth: w, clientHeight: h } = container;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  frame(obj);
  renderer.render(scene, camera);
  const snapshot = renderer.domElement.toDataURL('image/png');
  const tick = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick); };
  tick();
  return snapshot;
}
