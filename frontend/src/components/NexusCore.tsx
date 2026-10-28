
import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import * as THREE from 'three'

export type NexusMode =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'offline'

type NexusCoreProps = {
  mode?: NexusMode
}

const shellVertex = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewPosition = -mvPosition.xyz;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const shellFragment = `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uOffline;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPosition);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.25);
    float wave = sin(vWorldPosition.y * 5.0 + uTime * 0.35) * 0.5 + 0.5;

    vec3 cyan = vec3(0.08, 1.0, 0.78);
    vec3 aqua = vec3(0.20, 0.82, 1.0);
    vec3 blue = vec3(0.12, 0.28, 1.0);
    vec3 violet = vec3(0.45, 0.12, 0.85);

    vec3 rim = mix(cyan, aqua, smoothstep(-0.4, 0.8, N.y));
    rim = mix(rim, blue, smoothstep(-0.9, -0.1, -N.y) * 0.72);
    rim = mix(rim, violet, wave * 0.12);

    float edge = smoothstep(0.05, 0.88, fresnel);
    float reflection = pow(
      max(dot(reflect(-V, N), vec3(0.0, 0.0, 1.0)), 0.0),
      8.0
    );

    vec3 color = rim * (0.22 + edge * 1.7);
    color += vec3(0.15, 0.95, 0.8) * reflection * 0.22;

    float alpha = (0.10 + edge * 0.78) * (1.0 - uOffline * 0.75);
    alpha += reflection * 0.12;

    gl_FragColor = vec4(color * (0.55 + uEnergy * 0.45), alpha);
  }
`

const bandVertex = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const bandFragment = `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uOffline;

  varying vec2 vUv;

  void main() {
    float x = fract(vUv.x + uTime * 0.012);

    vec3 pink = vec3(1.0, 0.12, 0.58);
    vec3 coral = vec3(1.0, 0.30, 0.42);
    vec3 gold = vec3(1.0, 0.84, 0.36);
    vec3 cyan = vec3(0.15, 1.0, 0.78);

    vec3 color = mix(pink, coral, smoothstep(0.0, 0.28, x));
    color = mix(color, gold, smoothstep(0.28, 0.53, x));
    color = mix(color, cyan, smoothstep(0.58, 0.92, x));

    float glow = exp(-pow((x - 0.48) * 9.0, 2.0));
    float edgeFade = pow(max(sin(vUv.y * 3.14159), 0.0), 0.45);
    float shimmer = 0.88 + 0.12 * sin(x * 48.0 - uTime * 1.6);

    color += vec3(0.35, 0.9, 1.0) * glow * 0.45;
    color *= shimmer * (0.82 + uEnergy * 0.5);

    float alpha = 0.40 + edgeFade * 0.58 + glow * 0.18;
    alpha *= 1.0 - uOffline * 0.8;

    gl_FragColor = vec4(color, alpha);
  }
`

// Névoa procedural roxo-magenta, sem texturas externas.
const nebulaVertex = `
  varying vec3 vPosition;

  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const nebulaFragment = `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uOffline;

  varying vec3 vPosition;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  void main() {
    vec3 p = vPosition * 3.0;
    p.x += uTime * 0.055;
    p.y += sin(uTime * 0.18 + p.x) * 0.22;

    float n = noise(p) * 0.65 + noise(p * 1.8 + 4.0) * 0.35;
    float center = exp(-dot(vPosition.xy, vPosition.xy) * 3.5);
    float cloud = smoothstep(0.24, 0.78, n) * center;

    vec3 deepBlue = vec3(0.24, 0.08, 1.0);
    vec3 violet = vec3(0.85, 0.20, 1.0);
    vec3 magenta = vec3(1.0, 0.28, 0.92);

    vec3 color = mix(deepBlue, violet, smoothstep(0.2, 0.7, n));
    color = mix(color, magenta, smoothstep(0.20, 0.65, n));

    float alpha = cloud * (1.75 + uEnergy * 0.35);
    alpha *= 1.0 - uOffline * 0.85;

    gl_FragColor = vec4(color * (0.7 + uEnergy * 0.5), alpha);
  }
`

function EnergyCore({ mode }: { mode: NexusMode }) {
  const groupRef = useRef<THREE.Group>(null)
  const shellRef = useRef<THREE.ShaderMaterial>(null)
  const bandRef = useRef<THREE.ShaderMaterial>(null)
  const secondBandRef = useRef<THREE.ShaderMaterial>(null)
  const nebulaRef = useRef<THREE.ShaderMaterial>(null)
  const innerRef = useRef<THREE.Group>(null)
  const haloRef = useRef<THREE.Mesh>(null)
  const particlesRef = useRef<THREE.Points>(null)

  const particleData = useMemo(() => {
    const count = 110
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    const palette = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#ff9bdc'),
      new THREE.Color('#78eaff'),
      new THREE.Color('#c6a0ff'),
    ]

    for (let i = 0; i < count; i++) {
      // Distribui os pontos dentro do volume esférico.
      const radius = Math.cbrt(Math.random()) * 0.77
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.cos(phi)
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)

      const c = palette[Math.floor(Math.random() * palette.length)]
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b

      sizes[i] = 0.5 + Math.random() * 1.8
    }

    return { positions, colors, sizes, count }
  }, [])

  const particleMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.022,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    [],
  )

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime
    const active = mode !== 'offline'

    const speed =
      mode === 'thinking' ? 0.85 :
      mode === 'listening' ? 0.42 :
      mode === 'speaking' ? 0.72 : 0.16

    const pulse =
      mode === 'speaking' ? 1 + Math.sin(time * 5.5) * 0.035 :
      mode === 'listening' ? 1 + Math.sin(time * 2.4) * 0.018 :
      mode === 'thinking' ? 1 + Math.sin(time * 3.8) * 0.028 :
      1 + Math.sin(time * 1.1) * 0.009

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * speed
      groupRef.current.rotation.x = Math.sin(time * 0.23) * 0.035
      groupRef.current.scale.setScalar(pulse)
    }

    if (innerRef.current) {
      innerRef.current.rotation.y -= delta * speed * 0.7
      innerRef.current.rotation.z += delta * speed * 0.35
    }

    if (haloRef.current) {
      haloRef.current.rotation.z += delta * speed * 0.16
    }

    if (particlesRef.current) {
      particlesRef.current.rotation.y += delta * speed * 0.22
      particlesRef.current.rotation.x = Math.sin(time * 0.25) * 0.08

      const attr = particlesRef.current.geometry.attributes.position
      const positions = attr.array as Float32Array

      for (let i = 0; i < particleData.count; i++) {
        const base = i * 3
        positions[base + 1] +=
          Math.sin(time * 0.65 + i * 1.7) * delta * 0.006

        // Mantém as partículas dentro dos limites do núcleo.
        if (positions[base + 1] > 0.76) positions[base + 1] = -0.76
        if (positions[base + 1] < -0.76) positions[base + 1] = 0.76
      }

      attr.needsUpdate = true
    }

    const energy = active
      ? mode === 'thinking' ? 1 :
        mode === 'speaking' ? 0.92 :
        mode === 'listening' ? 0.78 : 0.52
      : 0.12

    const updateShader = (material: THREE.ShaderMaterial | null) => {
      if (!material) return
      material.uniforms.uTime.value = time
      material.uniforms.uEnergy.value = energy
      material.uniforms.uOffline.value = active ? 0 : 1
    }

    updateShader(shellRef.current)
    updateShader(bandRef.current)
    updateShader(secondBandRef.current)
    updateShader(nebulaRef.current)

    if (particleMaterial) {
      particleMaterial.opacity = active
        ? mode === 'thinking' ? 1 :
          mode === 'speaking' ? 0.95 :
          mode === 'listening' ? 0.9 : 0.72
        : 0.18
    }
  })

  return (
    <Float speed={0.8} floatIntensity={0.08} rotationIntensity={0.025}>
      <group ref={groupRef}>
        {/* Névoa violeta no interior */}
        <mesh scale={0.91}>
          <sphereGeometry args={[1, 64, 64]} />
          <shaderMaterial
            ref={nebulaRef}
            vertexShader={nebulaVertex}
            fragmentShader={nebulaFragment}
            uniforms={{
              uTime: { value: 0 },
              uEnergy: { value: 0.52 },
              uOffline: { value: 0 },
            }}
            transparent
            side={THREE.BackSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Partículas Stardust */}
        <points ref={particlesRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[particleData.positions, 3]}
              count={particleData.count}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[particleData.colors, 3]}
              count={particleData.count}
            />
          </bufferGeometry>
          <primitive object={particleMaterial} attach="material" />
        </points>

        {/* Casca de vidro iridescente */}
        <mesh>
          <sphereGeometry args={[1, 96, 96]} />
          <shaderMaterial
            ref={shellRef}
            vertexShader={shellVertex}
            fragmentShader={shellFragment}
            uniforms={{
              uTime: { value: 0 },
              uEnergy: { value: 0.52 },
              uOffline: { value: 0 },
            }}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Faixa orbital principal */}
        <mesh rotation={[0.38, 0.15, -0.12]} scale={[1, 0.72, 1]}>
          <torusGeometry args={[0.68, 0.055, 32, 192]} />
          <shaderMaterial
            ref={bandRef}
            vertexShader={bandVertex}
            fragmentShader={bandFragment}
            uniforms={{
              uTime: { value: 0 },
              uEnergy: { value: 0.52 },
              uOffline: { value: 0 },
            }}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Segunda lâmina orbital: outro plano e outro raio */}
        <mesh
          rotation={[-0.58, 0.42, 0.62]}
          scale={[1, 0.58, 1]}
        >
          <torusGeometry args={[0.57, 0.027, 24, 160]} />
          <shaderMaterial
            ref={secondBandRef}
            vertexShader={bandVertex}
            fragmentShader={bandFragment}
            uniforms={{
              uTime: { value: 0 },
              uEnergy: { value: 0.42 },
              uOffline: { value: 0 },
            }}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Luz central */}
        <mesh scale={0.12} position={[0, 0.02, 0.69]}>
          <sphereGeometry args={[1, 32, 32]} />
          <meshBasicMaterial
            color="#fff2ff"
            transparent
            opacity={mode === 'offline' ? 0.12 : 0.72}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* Reflexos curvos internos */}
        <group ref={innerRef}>
          <mesh rotation={[0.9, 0.25, 0.35]}>
            <torusGeometry args={[0.72, 0.005, 8, 160]} />
            <meshBasicMaterial
              color="#3df8db"
              transparent
              opacity={0.48}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <mesh rotation={[1.1, -0.5, -0.6]}>
            <torusGeometry args={[0.62, 0.004, 8, 160]} />
            <meshBasicMaterial
              color="#9b78ff"
              transparent
              opacity={0.42}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>

        {/* Halo exterior discreto */}
        <mesh ref={haloRef} rotation={[1.1, 0.2, 0.3]}>
          <torusGeometry args={[1.06, 0.0025, 8, 192]} />
          <meshBasicMaterial
            color="#42dfff"
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        <pointLight color="#3dffe0" intensity={1.5} distance={3} />
        <pointLight color="#3d70ff" intensity={1.1} distance={3} />
        <pointLight color="#ff7edb" intensity={0.8} distance={2.5} />
      </group>
    </Float>
  )
}

export default function NexusCore({ mode = 'idle' }: NexusCoreProps) {
  return (
    <div className={`nexus-core nexus-core--${mode}`}>
      <Canvas
        camera={{ position: [0, 0, 3.6], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(0x000000, 0)
          gl.setClearAlpha(0)
          scene.background = null
        }}
      >
        <ambientLight intensity={0.55} />
        <EnergyCore mode={mode} />
      </Canvas>
    </div>
  )
}
