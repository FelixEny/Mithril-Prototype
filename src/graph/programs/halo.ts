import { NodeProgram } from 'sigma/rendering'
import { floatColorToFloat } from './node'

// Per-node cluster halo, after Marvel's node.halo program: one instanced
// triangle per member, composited inside the same node draw pass (via
// createNodeCompoundProgram) so every halo renders underneath every avatar.
// The reducer drives it through three display fields:
//
//   haloSize  world radius of the wash (rest: 5x the avatar, Marvel's ratio)
//   haloColor css hex, the member's cluster tint lightened toward white
//   haloAlpha peak intensity, linear radial falloff to transparent
//
// Slots per instance (a_angle is a constant attribute, as in node.ts):
//   0: a_position.x  1: a_position.y  2: a_size  3: a_color (packed)
//   4: a_intensity — x3 vertices = 15 float slots.

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;
attribute vec4 a_color;
attribute float a_intensity;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_alpha;

const float bias = 255.0 / 254.0;
const float marginRatio = 1.05;

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector * marginRatio;
  gl_Position = vec4((u_matrix * vec3(position, 1)).xy, 0, 1);

  v_diffVector = diffVector;
  v_radius = size / 2.0 / marginRatio;
  v_color = a_color;
  v_color.a *= bias;
  v_alpha = a_intensity;
}
`

const FRAGMENT_SHADER_SOURCE = `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_alpha;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  #ifdef PICKING_MODE
  gl_FragColor = transparent;
  return;
  #endif

  if (v_alpha <= 0.001) {
    gl_FragColor = transparent;
    return;
  }
  float dist = length(v_diffVector);
  float intensity = v_alpha * (v_radius - dist) / v_radius;
  if (dist < v_radius) {
    gl_FragColor = vec4(v_color * intensity);
  } else {
    gl_FragColor = transparent;
  }
}
`

export class NodeHaloProgram extends NodeProgram {
  static ANGLE_1 = 0
  static ANGLE_2 = (2 * Math.PI) / 3
  static ANGLE_3 = (4 * Math.PI) / 3

  drawHover = (): void => {}

  getDefinition() {
    const FLOAT = WebGLRenderingContext.FLOAT
    const UNSIGNED_BYTE = WebGLRenderingContext.UNSIGNED_BYTE
    return {
      VERTICES: 3,
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      METHOD: WebGLRenderingContext.TRIANGLES,
      UNIFORMS: ['u_sizeRatio', 'u_correctionRatio', 'u_matrix'],
      ATTRIBUTES: [
        { name: 'a_position', size: 2, type: FLOAT },
        { name: 'a_size', size: 1, type: FLOAT },
        { name: 'a_color', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_intensity', size: 1, type: FLOAT },
      ],
      CONSTANT_ATTRIBUTES: [{ name: 'a_angle', size: 1, type: FLOAT }],
      CONSTANT_DATA: [[NodeHaloProgram.ANGLE_1], [NodeHaloProgram.ANGLE_2], [NodeHaloProgram.ANGLE_3]],
    }
  }

  processVisibleItem(_nodeIndex: number, startIndex: number, data: any): void {
    const array = this.array
    const size = Math.max(typeof data.haloSize === 'number' ? data.haloSize : 0, 0)
    const color = floatColorToFloat(typeof data.haloColor === 'string' ? data.haloColor : '#693CF3')
    const alpha = typeof data.haloAlpha === 'number' ? data.haloAlpha : 0
    for (let v = 0; v < 3; v++) {
      array[startIndex++] = data.x
      array[startIndex++] = data.y
      array[startIndex++] = size
      array[startIndex++] = color
      array[startIndex++] = alpha
    }
  }

  setUniforms(params: any, programInfo: any) {
    const gl = programInfo.gl
    const { u_sizeRatio, u_correctionRatio, u_matrix } = programInfo.uniformLocations
    gl.uniform1f(u_correctionRatio, params.correctionRatio)
    gl.uniform1f(u_sizeRatio, params.sizeRatio)
    gl.uniformMatrix3fv(u_matrix, false, params.matrix)
  }
}
