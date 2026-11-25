import commonWgsl from "./common.wgsl?raw";
import sceneWgsl from "./scene.wgsl?raw";
import shadowWgsl from "./shadow.wgsl?raw";
import glassWgsl from "./glass.wgsl?raw";
import fxWgsl from "./fx.wgsl?raw";
import fullscreenWgsl from "./fullscreen.wgsl?raw";
import outlineWgsl from "./outline.wgsl?raw";
import bloomWgsl from "./bloom.wgsl?raw";
import finalWgsl from "./final.wgsl?raw";

export const SHADERS = {
  scene: commonWgsl + sceneWgsl,
  shadow: commonWgsl + shadowWgsl,
  glass: commonWgsl + glassWgsl,
  fx: fxWgsl,
  outline: fullscreenWgsl + outlineWgsl,
  bloom: fullscreenWgsl + bloomWgsl,
  final: fullscreenWgsl + finalWgsl,
} as const;
