import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.112.1/build/three.module.js';

import {Sky} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/objects/Sky.js';
import {Water} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/objects/Water.js';


export const sky = (function() {

  class TerrainSky {
    constructor(params) {
      this._params = params;
      this._Init(params);
    }

    _Init(params) {
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

      const skyRollup = params.gui.addFolder('Sky');
      skyRollup.add(params.guiParams.sky, "turbidity", 0.1, 30.0).onChange(
          onShaderChange);
      skyRollup.add(params.guiParams.sky, "rayleigh", 0.1, 4.0).onChange(
          onShaderChange);
      skyRollup.add(params.guiParams.sky, "mieCoefficient", 0.0001, 0.1).onChange(
          onShaderChange);
      skyRollup.add(params.guiParams.sky, "mieDirectionalG", 0.0, 1.0).onChange(
          onShaderChange);
      skyRollup.add(params.guiParams.sky, "luminance", 0.0, 2.0).onChange(
          onShaderChange);

      const sunRollup = params.gui.addFolder('Sun');
      sunRollup.add(params.guiParams.sun, "inclination", 0.0, 1.0).onChange(
          onSunChange);
      sunRollup.add(params.guiParams.sun, "azimuth", 0.0, 1.0).onChange(
          onSunChange);

      onShaderChange();
      onSunChange();
    }

    update(timeInSeconds) {

    }
  }

  return {
    TerrainSky: TerrainSky
  }
})();
