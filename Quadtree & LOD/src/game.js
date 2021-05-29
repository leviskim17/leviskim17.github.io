import {graphics} from './graphics.js';

export const game = (function() {
  return {
    Game: class {
      constructor() {
        this.initialize();
      }

      initialize() {
        this._graphics = new graphics.Graphics(this);
        if (!this._graphics.initialize()) {
          this.displayError('WebGL2 is not available.');
          return;
        }

        this._previousRAF = null;
        this._minFrameTime = 1.0 / 10.0;
        this._entities = {};

        this.onInitialize();
        this.raf();
      }

      displayError(errorText) {
        const _error = document.getElementById('error');
        _error.innerText = errorText;
      }

      raf() {
        requestAnimationFrame((t) => {
          if (this._previousRAF === null) {
            this._previousRAF = t;
          }
          this.render(t - this._previousRAF);
          this._previousRAF = t;
        });
      }

      stepEntities(timeInSeconds) {
        for (let k in this._entities) {
          this._entities[k].update(timeInSeconds);
        }
      }

      render(timeInMS) {
        const timeInSeconds = Math.min(timeInMS * 0.001, this._minFrameTime);

        this.onStep(timeInSeconds);
        this.stepEntities(timeInSeconds);
        this._graphics.render(timeInSeconds);

        this.raf();
      }
    }
  };
})();
