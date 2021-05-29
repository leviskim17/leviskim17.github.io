import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.112.1/build/three.module.js';
import {GUI} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/libs/dat.gui.module.js';
import {controls} from './controls.js';
import {game} from './game.js';
import {sky} from './sky.js';
import {terrain} from './terrain.js';

let _app = null;

class Quadtree_LOD extends game.Game {
  constructor() {
    super();
  }

  onInitialize() {
    this._gui = new GUI();
    this._guiParams = {};

    this._userCamera = new THREE.Object3D();
    this._userCamera.position.set(475, 1500, 900);

    this._entities['_terrain'] = new terrain.TerrainChunkManager({
      camera: this._userCamera,
      scene: this._graphics.Scene,
      gui: this._gui,
      guiParams: this._guiParams,
    });

    this._entities['_sky'] = new sky.TerrainSky({
      camera: this._graphics.Camera,
      scene: this._graphics.Scene,
      gui: this._gui,
      guiParams: this._guiParams,
    });

    this._entities['_controls'] = new controls.FPSControls({
        scene: this._graphics.Scene,
        camera: this._userCamera
    });

    this._graphics.Camera.position.copy(this._userCamera.position);

    this.loadBackground();
  }

  loadBackground() {
    this._graphics.Scene.background = new THREE.Color(0x000000);
  }

  onStep(_) {
    this._graphics._camera.position.copy(this._userCamera.position);
    this._graphics._camera.quaternion.copy(this._userCamera.quaternion);
  }
}

function main() {
  _app = new Quadtree_LOD();
}

main();
