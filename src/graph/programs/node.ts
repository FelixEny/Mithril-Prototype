import { NodeProgram } from 'sigma/rendering'
import { uploadAtlasPages, createFallbackTexture } from '../textures'
import type { MemberAtlas } from '../textures'

// Custom node program rendering members as avatar discs with an optional
// selection/search ring. One instanced triangle per node; per-instance it
// carries position, world radius, base color, the sigma picking id, the UV
// region of its avatar in the texture atlas, and ring color/width.
//
// The layout must be kept in sync between ATTRIBUTES, processVisibleItem and
// the shader. Slots per instance:
//
//   0: a_position.x       1: a_position.y
//   2: a_size
//   3: a_color  (float-packed RGBA, read as 4xUBYTE -> two slots)
//   5: a_id     (float-packed picking RGB, read as 4xUBYTE)
//   6..9: a_texture (u0, v0, sNorm, unused)
//   10: a_textureIndex (page + 1, or -1 for no texture — page 0 would
//       otherwise be indistinguishable from the "no texture" sentinel in
//       the shader's step(0.5, ...) discriminator)
//   11..14: a_ring (r, g, b, a) + a_ringWidth
//
// STRIDE = 15 float slots. a_angle is a constant attribute (one of 3 triangle
// vertex offsets), so this is an instanced program.

const VERTEX_SHADER_SOURCE = `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;
attribute vec4 a_texture;
attribute float a_textureIndex;
attribute vec4 a_ring;
attribute float a_ringWidth;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying vec2 v_uv;
varying float v_radius;
varying float v_textureIndex;
varying vec4 v_ring;
varying float v_ringWidthPx;

const float bias = 255.0 / 254.0;

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  v_radius = size / 2.0;
  v_textureIndex = a_textureIndex;
  v_ring = a_ring;
  v_ringWidthPx = a_ringWidth * u_correctionRatio / u_sizeRatio * 4.0;

  vec2 unitDir = vec2(cos(a_angle), sin(a_angle));
  vec2 discOffset = size * unitDir;
  v_uv = a_texture.xy + (discOffset / max(size, 0.0001) * 0.5 + 0.5) * a_texture.z;

  // The three vertices form an equilateral triangle whose inradius is half the
  // vertex offset. Size it so the triangle fully contains the avatar disc AND
  // the outer ring (plus its AA border), keeping the avatar radius unchanged.
  float ringBorder = u_correctionRatio * 2.0;
  float extra = v_ringWidthPx + ringBorder;
  float geomSize = 2.0 * (v_radius + extra);
  vec2 diffVector = geomSize * unitDir;
  vec2 position = a_position + diffVector;
  gl_Position = vec4((u_matrix * vec3(position, 1)).xy, 0, 1);

  v_diffVector = diffVector;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif
  v_color.a *= bias;
}
`

const FRAGMENT_SHADER_SOURCE = `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying vec2 v_uv;
varying float v_radius;
varying float v_textureIndex;
varying vec4 v_ring;
varying float v_ringWidthPx;

uniform float u_correctionRatio;
uniform sampler2D u_atlas_0;
uniform sampler2D u_atlas_1;
uniform sampler2D u_atlas_2;
uniform sampler2D u_atlas_3;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

vec4 sampleAtlas(float page, vec2 uv) {
  #ifdef PICKING_MODE
  return vec4(0.0, 0.0, 0.0, 0.0);
  #else
  if (page < 0.5) return texture2D(u_atlas_0, uv);
  if (page < 1.5) return texture2D(u_atlas_1, uv);
  if (page < 2.5) return texture2D(u_atlas_2, uv);
  return texture2D(u_atlas_3, uv);
  #endif
}

void main(void) {
  float border = u_correctionRatio * 2.0;
  float dist = length(v_diffVector);
  float bodyDist = dist - v_radius + border;

  #ifdef PICKING_MODE
  if (bodyDist > border)
    gl_FragColor = transparent;
  else
    gl_FragColor = v_color;
  return;
  #endif

  vec4 tex = (v_textureIndex < 0.5)
    ? vec4(0.0, 0.0, 0.0, 0.0)
    : sampleAtlas(v_textureIndex - 1.0, v_uv);
  float hasTex = step(0.5, v_textureIndex);
  vec3 body = mix(v_color.rgb, tex.rgb, hasTex);
  float bodyAlpha = mix(1.0, tex.a, hasTex);
  vec4 disc = vec4(body, bodyAlpha);

  float t = 0.0;
  if (bodyDist > border)
    t = 1.0;
  else if (bodyDist > 0.0)
    t = bodyDist / border;

  vec4 frag = mix(disc, transparent, t);

  // Selection / search / bridge ring drawn strictly outside the disc. Keep
  // both antialiasing feathers inside the ring's own width so no ring alpha
  // leaks into the avatar or the underlying triangle corners.
  if (v_ring.a > 0.001 && v_ringWidthPx > 0.0) {
    float ringInner = v_radius;
    float ringOuter = v_radius + v_ringWidthPx;
    float ringBorder = min(border, (ringOuter - ringInner) * 0.25);
    float inA = smoothstep(ringInner, ringInner + ringBorder, dist);
    float outA = 1.0 - smoothstep(ringOuter - ringBorder, ringOuter, dist);
    float ringA = inA * outA * v_ring.a;
    frag.rgb = mix(frag.rgb, v_ring.rgb, ringA);
    frag.a = max(frag.a, ringA);
  }

  gl_FragColor = frag;
}
`

// --- Picking-id encoding (mirrors sigma's colors module) --------------------

const INT8 = new Int8Array(4)
const INT32 = new Int32Array(INT8.buffer, 0, 1)
const FLOAT32 = new Float32Array(INT8.buffer, 0, 1)

function rgbaToFloat(r: number, g: number, b: number, a: number, masking = true): number {
  INT32[0] = (a << 24) | (b << 16) | (g << 8) | r
  if (masking) INT32[0] = INT32[0] & 0xfeffffff
  return FLOAT32[0]
}

const FLOAT_COLOR_CACHE = new Map<string, number>()
export function floatColorToFloat(val: string): number {
  const cached = FLOAT_COLOR_CACHE.get(val)
  if (typeof cached === 'number') return cached
  let hex = val.replace('#', '')
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const color = rgbaToFloat(r, g, b, 255)
  FLOAT_COLOR_CACHE.set(val, color)
  return color
}

const FLOAT_INDEX_CACHE = new Map<number, number>()
export function indexToColorFloat(index: number): number {
  const cached = FLOAT_INDEX_CACHE.get(index)
  if (typeof cached === 'number') return cached
  const r = (index & 0x00ff0000) >>> 16
  const g = (index & 0x0000ff00) >>> 8
  const b = index & 0x000000ff
  const color = rgbaToFloat(r, g, b, 255)
  FLOAT_INDEX_CACHE.set(index, color)
  return color
}

export function createMemberNodeProgram(atlas: MemberAtlas) {
  return class MemberNodeProgram extends NodeProgram {
    private atlas: MemberAtlas
    private glTextures: (WebGLTexture | null)[] = []
    private fallback: WebGLTexture | null = null

    static ANGLE_1 = 0
    static ANGLE_2 = (2 * Math.PI) / 3
    static ANGLE_3 = (4 * Math.PI) / 3

    // The member discs are drawn by the main program and already carry a
    // hover ring in-shader, so sigma's default halo bubble is suppressed.
    drawHover = (): void => {}

    constructor(gl: WebGLRenderingContext, pickingBuffer: WebGLFramebuffer | null, renderer: unknown) {
      super(gl, pickingBuffer, renderer as any)
      this.atlas = atlas
      this.syncTextures(gl)
    }

    syncTextures(gl: WebGLRenderingContext): void {
      if (!this.fallback) this.fallback = createFallbackTexture(gl)
      uploadAtlasPages(gl, this.atlas, this.glTextures)
    }

    getDefinition() {
      const FLOAT = WebGLRenderingContext.FLOAT
      const UNSIGNED_BYTE = WebGLRenderingContext.UNSIGNED_BYTE
      return {
        VERTICES: 3,
        VERTEX_SHADER_SOURCE,
        FRAGMENT_SHADER_SOURCE,
        METHOD: WebGLRenderingContext.TRIANGLES,
        UNIFORMS: ['u_sizeRatio', 'u_correctionRatio', 'u_matrix', 'u_atlas_0', 'u_atlas_1', 'u_atlas_2', 'u_atlas_3'],
        ATTRIBUTES: [
          { name: 'a_position', size: 2, type: FLOAT },
          { name: 'a_size', size: 1, type: FLOAT },
          { name: 'a_color', size: 4, type: UNSIGNED_BYTE, normalized: true },
          { name: 'a_id', size: 4, type: UNSIGNED_BYTE, normalized: true },
          { name: 'a_texture', size: 4, type: FLOAT },
          { name: 'a_textureIndex', size: 1, type: FLOAT },
          { name: 'a_ring', size: 4, type: FLOAT },
          { name: 'a_ringWidth', size: 1, type: FLOAT },
        ],
        CONSTANT_ATTRIBUTES: [{ name: 'a_angle', size: 1, type: FLOAT }],
        CONSTANT_DATA: [
          [MemberNodeProgram.ANGLE_1],
          [MemberNodeProgram.ANGLE_2],
          [MemberNodeProgram.ANGLE_3],
        ],
      }
    }

    processVisibleItem(nodeIndex: number, startIndex: number, data: any): void {
      const array = this.array
      const region = this.atlas.region(data.avatarKey)

      array[startIndex++] = data.x
      array[startIndex++] = data.y
      array[startIndex++] = data.size
      array[startIndex++] = floatColorToFloat(data.color)
      array[startIndex++] = nodeIndex

      if (region) {
        array[startIndex++] = region.u0
        array[startIndex++] = region.v0
        array[startIndex++] = region.sNorm
        array[startIndex++] = 0
        array[startIndex++] = region.page + 1
      } else {
        array[startIndex++] = -1
        array[startIndex++] = -1
        array[startIndex++] = 0
        array[startIndex++] = 0
        array[startIndex++] = -1
      }

      const ring = data.ring ?? [0, 0, 0, 0]
      array[startIndex++] = ring[0]
      array[startIndex++] = ring[1]
      array[startIndex++] = ring[2]
      array[startIndex++] = ring[3]
      array[startIndex++] = data.ringWidth ?? 0
    }

    setUniforms(params: any, programInfo: any) {
      const gl = programInfo.gl
      const { u_sizeRatio, u_correctionRatio, u_matrix } = programInfo.uniformLocations
      gl.uniform1f(u_correctionRatio, params.correctionRatio)
      gl.uniform1f(u_sizeRatio, params.sizeRatio)
      gl.uniformMatrix3fv(u_matrix, false, params.matrix)

      for (let i = 0; i < 4; i++) {
        const loc = programInfo.uniformLocations[`u_atlas_${i}`]
        if (typeof loc !== 'number' && !loc) continue
        gl.activeTexture(gl.TEXTURE0 + i)
        gl.bindTexture(gl.TEXTURE_2D, this.glTextures[i] ?? this.fallback)
        gl.uniform1i(loc, i)
      }
    }
  }
}

export { createFallbackTexture }
