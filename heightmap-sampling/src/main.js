import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.112.1/build/three.module.js';
import {GUI} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/libs/dat.gui.module.js';
import {Sky} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/objects/Sky.js';
import {game} from './game.js';
import {graphics} from './graphics.js';
import {math} from './math.js';
import {noise} from './noise.js';
import {spline} from './spline.js';

import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/controls/OrbitControls.js';

let _app = null;

class HeightSampler {
  constructor(generator, position, minRadius, maxRadius) {
    this._position = position.clone();
    this._radius = [minRadius, maxRadius];
    this._generator = generator;
  }

  getOffset(x, y) {
    const distance = this._position.distanceTo(new THREE.Vector2(x, y));
    let normalization = 1.0 - math.sat((distance - this._radius[0]) / (this._radius[1] - this._radius[0]));
    normalization = normalization * normalization * (3 - 2 * normalization);

    return [this._generator.getHeight(x, y), normalization];
  }
}

class CornerHeightGenerator {
  constructor() {
  }

  getHeight(x, y) {
    if (x == -250 && y == 250) {
      return [128, 1];
    }
    return [0, 1];
  }
}

class BumpHeightGenerator {
  constructor() {
  }

  getHeight(x, y) {
    const dist = new THREE.Vector2(x, y).distanceTo(new THREE.Vector2(0, 0));

    let h = 1.0 - math.sat(dist / 250.0);
    h = h * h * h * (h * (h * 6 - 15) + 10);

    return [h * 128, 1];
  }
}


class HeightmapGenerator {
  constructor(params, img) {
    this._params = params;
    this._data = graphics.getImageData(img);
  }

  getHeight(x, y) {
    const _GetPixelAsFloat = (x, y) => {
      const position = (x + this._data.width * y) * 4;
      const data = this._data.data;
      return data[position] / 255.0;
    }

    // Bilinear filter
    const offset = new THREE.Vector2(-250, -250);
    const dimensions = new THREE.Vector2(500, 500);

    const xf = 1.0 - math.sat((x - offset.x) / dimensions.x);
    const yf = math.sat((y - offset.y) / dimensions.y);
    const w = this._data.width - 1;
    const h = this._data.height - 1;

    const x1 = Math.floor(xf * w);
    const y1 = Math.floor(yf * h);
    const x2 = math.clamp(x1 + 1, 0, w);
    const y2 = math.clamp(y1 + 1, 0, h);

    const xp = xf * w - x1;
    const yp = yf * h - y1;

    const p11 = _GetPixelAsFloat(x1, y1);
    const p21 = _GetPixelAsFloat(x2, y1);
    const p12 = _GetPixelAsFloat(x1, y2);
    const p22 = _GetPixelAsFloat(x2, y2);

    const px1 = math.lerp(xp, p11, p21);
    const px2 = math.lerp(xp, p12, p22);

    return math.lerp(yp, px1, px2) * this._params.height;
  }
}

const _WHITE = new THREE.Color(0x808080);
const _OCEAN = new THREE.Color(0xd9d592);
const _BEACH = new THREE.Color(0xd9d592);
const _SNOW = new THREE.Color(0xFFFFFF);
const _FOREST_TROPICAL = new THREE.Color(0x4f9f0f);
const _FOREST_TEMPERATE = new THREE.Color(0x2b960e);
const _FOREST_BOREAL = new THREE.Color(0x29c100);

class TerrainChunk {
  constructor(params) {
    this._params = params;
    this.initialize(params);
  }

  initialize(params) {
    const size = new THREE.Vector3(params.width * params.scale, 0, params.width * params.scale);

    this._plane = new THREE.Mesh(
        new THREE.PlaneGeometry(size.x, size.z, 128, 128),
        new THREE.MeshStandardMaterial({
            wireframe: false,
            color: 0xFFFFFF,
            side: THREE.FrontSide,
            vertexColors: THREE.VertexColors,
        }));
    this._plane.position.add(params.offset);
    this._plane.castShadow = false;
    this._plane.receiveShadow = true;
    params.group.add(this._plane);

    const colourLerp = (t, p0, p1) => {
      const c = p0.clone();

      return c.lerpHSL(p1, t);
    };

    this._colourSpline = [
      new spline.LinearSpline(colourLerp),
      new spline.LinearSpline(colourLerp)
    ];
    // Arid
    this._colourSpline[0].addPoint(0.0, new THREE.Color(0xb7a67d));
    this._colourSpline[0].addPoint(0.5, new THREE.Color(0xf1e1bc));
    this._colourSpline[0].addPoint(1.0, _SNOW);

    // Humid
    this._colourSpline[1].addPoint(0.0, _FOREST_BOREAL);
    this._colourSpline[1].addPoint(0.5, new THREE.Color(0xcee59c));
    this._colourSpline[1].addPoint(1.0, _SNOW);

    this.rebuild();
  }

  chooseColour(x, y, z) {
    //return _WHITE;
    const m = this._params.colorSampler.getHeight(x, z);
    const h = y / 100.0;

    if (h < 0.05) {
      return _OCEAN;
    }

    const c1 = this._colourSpline[0].Get(h);
    const c2 = this._colourSpline[1].Get(h);

    return c1.lerpHSL(c2, m);
  }

  rebuild() {
    const colours = [];
    const offset = this._params.offset;
    for (let v of this._plane.geometry.vertices) {
      const heightPairs = [];
      let normalization = 0;
      v.z = 0;
      for (let sampler of this._params.heightSamplers) {
        heightPairs.push(sampler.getOffset(v.x + offset.x, v.y + offset.y));
        normalization += heightPairs[heightPairs.length-1][1];
      }

      if (normalization > 0) {
        for (let h of heightPairs) {
          v.z += h[0] * h[1] / normalization;
        }
      }

      colours.push(this.chooseColour(v.x + offset.x, v.z, v.y + offset.y));
    }

    for (let f of this._plane.geometry.faces) {
      const vs = [f.a, f.b, f.c];

      const vertexColours = [];
      for (let v of vs) {
        vertexColours.push(colours[v]);
      }
      f.vertexColors = vertexColours;
    }
    this._plane.geometry.elementsNeedUpdate = true;
    this._plane.geometry.verticesNeedUpdate = true;
    this._plane.geometry.computeVertexNormals();
  }
}

class TerrainTileManager {
  constructor(params) {
    this._chunkSize = 500;
    this.initialize(params);
  }

  initialize(params) {
    this.initializeHeightmap(params);
    this.initializeNoise(params);
    this.initializeContour(params);
    this.initializeTerrain(params);
  }

  initializeHeightmap(params) {
    params.guiParams.heightmap = {
      height: 128,
    };

    const onHeightmapChanged = () => {
      for (let k in this._chunks) {
        this._chunks[k].chunk.rebuild();
      }
    };

    const heightmapFolder = params.gui.addFolder('Terrain.Heightmap');
    heightmapFolder.add(params.guiParams.heightmap, "height", 0, 128).onChange(
      onHeightmapChanged);
  }

  initializeNoise(params) {
    params.guiParams.noise = {
      octaves: 6,
      persistence: 0.707,
      lacunarity: 1.8,
      exponentiation: 4.5,
      height: 300.0,
      scale: 800.0,
      noiseType: 'simplex',
      seed: 1
    };

    const onNoiseChanged = () => {
      for (let k in this._chunks) {
        this._chunks[k].chunk.rebuild();
      }
    };

    const noiseFolder = params.gui.addFolder('Terrain.Noise');
    noiseFolder.add(params.guiParams.noise, "noiseType", ['simplex', 'perlin', 'rand']).onChange(
        onNoiseChanged);
    noiseFolder.add(params.guiParams.noise, "scale", 32.0, 4096.0).onChange(
        onNoiseChanged);
    noiseFolder.add(params.guiParams.noise, "octaves", 1, 20, 1).onChange(
        onNoiseChanged);
    noiseFolder.add(params.guiParams.noise, "persistence", 0.25, 1.0).onChange(
        onNoiseChanged);
    noiseFolder.add(params.guiParams.noise, "lacunarity", 0.01, 4.0).onChange(
        onNoiseChanged);
    noiseFolder.add(params.guiParams.noise, "exponentiation", 0.1, 10.0).onChange(
        onNoiseChanged);
    noiseFolder.add(params.guiParams.noise, "height", 0, 512).onChange(
        onNoiseChanged);

    this._noise = new noise.Noise(params.guiParams.noise);
  }
  
  initializeContour(params) {
    params.guiParams.biomes = {
      octaves: 2,
      persistence: 0.5,
      lacunarity: 2.0,
      exponentiation: 3.9,
      scale: 2048.0,
      noiseType: 'simplex',
      seed: 2,
      exponentiation: 1,
      height: 1
    };

    const onNoiseChanged = () => {
      for (let k in this._chunks) {
        this._chunks[k].chunk.rebuild();
      }
    };

    const noiseRollup = params.gui.addFolder('Terrain.Contour');
    noiseRollup.add(params.guiParams.biomes, "scale", 64.0, 4096.0).onChange(
        onNoiseChanged);
    noiseRollup.add(params.guiParams.biomes, "octaves", 1, 20, 1).onChange(
        onNoiseChanged);
    noiseRollup.add(params.guiParams.biomes, "persistence", 0.01, 1.0).onChange(
        onNoiseChanged);
    noiseRollup.add(params.guiParams.biomes, "lacunarity", 0.01, 4.0).onChange(
        onNoiseChanged);
    noiseRollup.add(params.guiParams.biomes, "exponentiation", 0.1, 10.0).onChange(
        onNoiseChanged);

    this._contour = new noise.Noise(params.guiParams.biomes);
  }


  initializeTerrain(params) {
    params.guiParams.mesh = {
      wireframe: false,
    };

    const meshFolder = params.gui.addFolder('Terrain.Mesh');
    meshFolder.add(params.guiParams.mesh, "wireframe").onChange(() => {
      for (let k in this._chunks) {
        this._chunks[k].chunk._plane.material.wireframe = params.guiParams.mesh.wireframe;
      }
    });

    this._group = new THREE.Group()
    this._group.rotation.x = -Math.PI / 2;
    params.scene.add(this._group);

    this._chunks = {};
    this._params = params;

    const w = 0;

    for (let x = -w; x <= w; x++) {
      for (let z = -w; z <= w; z++) {
        this._AddChunk(x, z);
      }
    }
  }

  getKey(x, z) {
    return x + '.' + z;
  }

  _AddChunk(x, z) {
    const offset = new THREE.Vector2(x * this._chunkSize, z * this._chunkSize);
    const chunk = new TerrainChunk({
      group: this._group,
      offset: new THREE.Vector3(offset.x, offset.y, 0),
      scale: 1,
      width: this._chunkSize,
      colorSampler: this._contour,
      heightSamplers: [new HeightSampler(this._noise, offset, 100000, 100000 + 1)],
    });

    const k = this.getKey(x, z);
    const edges = [];
    for (let xi = -1; xi <= 1; xi++) {
      for (let zi = -1; zi <= 1; zi++) {
        if (xi == 0 || zi == 0) {
          continue;
        }

        edges.push(this.getKey(x + xi, z + zi));
      }
    }

    this._chunks[k] = {
      chunk: chunk,
      edges: edges
    };
  }

  SetHeightmap(img) {
    const heightSampler = new HeightSampler(new HeightmapGenerator(this._params.guiParams.heightmap, img), new THREE.Vector2(0, 0), 250, 300);

    for (let k in this._chunks) {
      this._chunks[k].chunk._params.heightSamplers.unshift(heightSampler);
      this._chunks[k].chunk.rebuild();
    }
  }

  update(timeInSeconds) {

  }
}

class TerrainSkyManager {
  constructor(params) {
    this.initialize(params);
  }

  initialize(params) {
    this._sky = new Sky();
    this._sky.scale.setScalar(10000);
    params.scene.add(this._sky);

    params.guiParams.sky = {
      turbidity: 10.0,
      rayleigh: 2,
      mieCoefficient: 0.005,
      mieDirectionalG: 0.8,
      luminance: 1,
    };

    params.guiParams.sun = {
      inclination: 0.31,
      azimuth: 0.25,
    };

    const onShaderChange = () => {
      for (let k in params.guiParams.sky) {
        this._sky.material.uniforms[k].value = params.guiParams.sky[k];
      }
      for (let k in params.guiParams.general) {
        this._sky.material.uniforms[k].value = params.guiParams.general[k];
      }
    };

    const onSunChange = () => {
      var theta = Math.PI * (params.guiParams.sun.inclination - 0.5);
      var phi = 2 * Math.PI * (params.guiParams.sun.azimuth - 0.5);

      const sunPosition = new THREE.Vector3();
      sunPosition.x = Math.cos(phi);
      sunPosition.y = Math.sin(phi) * Math.sin(theta);
      sunPosition.z = Math.sin(phi) * Math.cos(theta);

      this._sky.material.uniforms['sunPosition'].value.copy(sunPosition);
    };

    const skyFolder = params.gui.addFolder('Sky');
    skyFolder.add(params.guiParams.sky, "turbidity", 0.1, 30.0).onChange(
        onShaderChange);
    skyFolder.add(params.guiParams.sky, "rayleigh", 0.1, 4.0).onChange(
        onShaderChange);
    skyFolder.add(params.guiParams.sky, "mieCoefficient", 0.0001, 0.1).onChange(
        onShaderChange);
    skyFolder.add(params.guiParams.sky, "mieDirectionalG", 0.0, 1.0).onChange(
        onShaderChange);
    skyFolder.add(params.guiParams.sky, "luminance", 0.0, 2.0).onChange(
        onShaderChange);

    const sunFolder = params.gui.addFolder('Sun');
    sunFolder.add(params.guiParams.sun, "inclination", 0.0, 1.0).onChange(
        onSunChange);
    sunFolder.add(params.guiParams.sun, "azimuth", 0.0, 1.0).onChange(
        onSunChange);

    onShaderChange();
    onSunChange();
  }

  update(timeInSeconds) {

  }
}

class Heightmap_sampling extends game.Game {
  constructor() {
    super();
  }

  onInitialize() {
    this._controls = this.createControls();
    this._gui = this.createGUI();

    this._guiParams = {};

    this._entities['_terrain'] = new TerrainTileManager({
      scene: this._graphics.Scene,
      gui: this._gui,
      guiParams: this._guiParams,
    });

    this._entities['_sky'] = new TerrainSkyManager({
      scene: this._graphics.Scene,
      gui: this._gui,
      guiParams: this._guiParams,
    });

    this.applyHeightmapSampling();
  }

  createGUI() {
    const gui = new GUI();
    return gui;
  }

  createControls() {
    const controls = new OrbitControls(this._graphics._camera, this._graphics._threejs.domElement);
    controls.target.set(0, 50, 0);
    controls.object.position.set(475, 345, 900);
    controls.update();
    return controls;
  }

  applyHeightmapSampling() {
    const loader = new THREE.TextureLoader(this._manager);

    loader.load('./resources/heightmap-test.jpeg', (result) => {
      this._entities['_terrain'].SetHeightmap(result.image);
    });
  }

  onStep(timeInSeconds) {

  }
}

function main() {
  _app = new Heightmap_sampling();
}

main();
