import { createRibbonMaterial } from './ribbon-material';

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  gl_Position = vec4(a_position.x * 2.0 - 1.0, 1.0 - a_position.y * 2.0, 0.0, 1.0);
  v_uv = a_position;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_image;
uniform sampler2D u_strip;
uniform sampler2D u_map;
uniform float u_phase;
uniform float u_strength;
varying vec2 v_uv;
void main() {
  vec4 original = texture2D(u_image, v_uv);
  vec3 flow = texture2D(u_map, v_uv).rgb;
  float along = atan(flow.g * 2.0 - 1.0, flow.r * 2.0 - 1.0) / 6.28318530718;
  vec3 material = texture2D(u_strip, vec2(fract(along - u_phase), flow.b)).rgb;
  float brightness = max(original.r, max(original.g, original.b));
  float materialValue = max(material.r, max(material.g, material.b));
  material = material / max(materialValue, 0.001) * brightness;
  vec3 color = mix(original.rgb, material, u_strength);
  gl_FragColor = vec4(color * original.a, original.a);
}`;

export function createRibbonMesh(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const material = createRibbonMaterial(image);
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true });
  if (!gl) throw new Error('Ribbon rendering is unavailable');
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  const vertices = gl.createBuffer();
  const indices = gl.createBuffer();
  const textures = [gl.createTexture(), gl.createTexture(), gl.createTexture()];

  const dispose = () => {
    gl.deleteBuffer(vertices);
    gl.deleteBuffer(indices);
    textures.forEach((texture) => gl.deleteTexture(texture));
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  };

  try {
    if (
      !vertex ||
      !fragment ||
      !program ||
      !vertices ||
      !indices ||
      textures.some((texture) => !texture)
    ) {
      throw new Error('Ribbon resources are unavailable');
    }
    for (const [shader, source] of [
      [vertex, VERTEX_SHADER],
      [fragment, FRAGMENT_SHADER],
    ] as const) {
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? 'Ribbon shader failed');
      }
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Ribbon program failed');
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 1, 3, 2]), gl.STATIC_DRAW);
    const sources = [image, material.strip, material.map];
    const samplers = ['u_image', 'u_strip', 'u_map'];
    sources.forEach((source, index) => {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, textures[index]!);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        index === 1 ? gl.REPEAT : gl.CLAMP_TO_EDGE,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform1i(gl.getUniformLocation(program, samplers[index]!), index);
    });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    const phase = gl.getUniformLocation(program, 'u_phase');
    const strength = gl.getUniformLocation(program, 'u_strength');

    return {
      draw(progress: number, intensity: number) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(phase, progress % 1);
        gl.uniform1f(strength, intensity);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
