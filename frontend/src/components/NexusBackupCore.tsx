
import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Sparkles } from '@react-three/drei'
import * as THREE from 'three'

export type NexusMode = 'idle' | 'listening' | 'thinking' | 'speaking' | 'offline'

type NexusCoreProps = {
  mode?: NexusMode
}

function GlassCore({ mode }: { mode: NexusMode }) {
  const outerRef = useRef<THREE.Mesh>(null)
  const innerRef = useRef<THREE.Mesh>(null)
  const ringsRef = useRef<THREE.Group>(null)
  const particlesRef = useRef<THREE.Group>(null)

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime

    const speed =
      mode === 'thinking' ? 1.5 :
      mode === 'listening' ? 0.8 :
      mode === 'speaking' ? 1.15 : 0.25

    const pulse =
      mode === 'speaking' ? 1 + Math.sin(t * 7) * 0.045 :
      mode === 'listening' ? 1 + Math.sin(t * 2.4) * 0.025 :
      mode === 'thinking' ? 1 + Math.sin(t * 4) * 0.035 :
      1 + Math.sin(t * 1.1) * 0.012

    if (outerRef.current) {
      outerRef.current.rotation.y += delta * speed * 0.16
      outerRef.current.rotation.x = Math.sin(t * 0.35) * 0.08
      outerRef.current.scale.setScalar(pulse)
    }

    if (innerRef.current) {
      innerRef.current.rotation.y -= delta * speed * 0.22
      innerRef.current.rotation.z += delta * speed * 0.1
    }

    if (ringsRef.current) {
      ringsRef.current.rotation.y += delta * speed * 0.18
      ringsRef.current.rotation.x = Math.sin(t * 0.25) * 0.12
    }

    if (particlesRef.current) {
      particlesRef.current.rotation.y += delta * speed * 0.08
      particlesRef.current.rotation.z -= delta * speed * 0.035
    }
  })

const glassTint = mode === 'offline' ? '#526273' : '#8bdfff'

const glowTint =
  mode === 'offline' ? '#526273' :
  mode === 'listening' ? '#00f5ff' :
  mode === 'speaking' ? '#66eaff' :
  mode === 'thinking' ? '#537dff' :
  '#00bfff'


  return (
    <Float speed={0.8} floatIntensity={0.12} rotationIntensity={0.06}>
      <group>
        {/* Luz interna difusa */}
        <mesh scale={0.72}>
          <sphereGeometry args={[0.78, 48, 48]} />
          <meshBasicMaterial
            color={glowTint}
            transparent
            opacity={mode === 'offline' ? 0.035 : 0.12}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* Esfera externa: vidro */}
        <mesh ref={outerRef}>
          <sphereGeometry args={[1, 96, 96]} />
          <meshPhysicalMaterial
            color={glassTint}
            roughness={0.12}
            metalness={0.12}
            transmission={0.92}
            thickness={1.25}
            ior={1.28}
            transparent
            opacity={0.62}
            clearcoat={1}
            clearcoatRoughness={0.08}
            envMapIntensity={1.2}
          />
        </mesh>

        {/* Contorno luminoso subtil */}
        <mesh scale={1.015}>
          <sphereGeometry args={[1, 48, 48]} />
          <meshBasicMaterial
            color={glowTint}
            wireframe
            transparent
            opacity={0.09}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* Núcleo interno facetado */}
        <mesh ref={innerRef} scale={0.48}>
          <icosahedronGeometry args={[1, 2]} />
          <meshPhysicalMaterial
            color="#c8c1b3"
            emissive={glowTint}
            emissiveIntensity={mode === 'thinking' ? 0.7 : 0.25}
            metalness={0.62}
            roughness={0.24}
            transmission={0.18}
            transparent
            opacity={0.82}
          />
        </mesh>

        {/* Linhas internas delicadas */}
        <mesh scale={0.67} rotation={[0.4, 0.2, 0.1]}>
          <icosahedronGeometry args={[1, 1]} />
          <meshBasicMaterial
            color="#f0e8d8"
            wireframe
            transparent
            opacity={0.24}
          />
        </mesh>

        {/* Anéis orbitais */}
        <group ref={ringsRef}>
          <mesh rotation={[1.05, 0.25, 0.3]}>
            <torusGeometry args={[1.22, 0.006, 8, 160]} />
            <meshBasicMaterial color="#00d9ff" transparent opacity={0.7} />
          </mesh>

          <mesh rotation={[0.45, 0.9, -0.55]}>
            <torusGeometry args={[1.34, 0.009, 8, 160]} />
            <meshBasicMaterial color="#397bff" transparent opacity={0.72} />
          </mesh>

          <mesh rotation={[1.4, 0.5, 0.8]}>
            <torusGeometry args={[1.12, 0.004, 8, 160]} />
            <meshBasicMaterial color=	"#b5f5ff" transparent opacity={0.6} />
          </mesh>
        </group>

        {/* Partículas ao redor da esfera */}
        <group ref={particlesRef}>
          <Sparkles
            count={150}
            scale={3.6}
            size={1.8}
            speed={mode === 'thinking' ? 1.1 : mode === 'speaking' ? 0.8 : 0.25}
            color={glowTint}
            opacity={0.8}
          />
          <Sparkles
            count={48}
            scale={2.6}
            size={2.4}
            speed={mode === 'listening' ? 0.7 : 0.2}
            color="#c49a62"
            opacity={0.65}
          />
        </group>
        <pointLight color="#00cfff" intensity={2.4} distance={4} />
        <pointLight color="#326bff" intensity={1.5} distance={3} />
        <pointLight color="#b8f5ff" intensity={1.2} distance={5} />
      </group>
    </Float>
  )
}

export default function NexusCore({ mode = 'idle' }: NexusCoreProps) {
  return (
    <div className={`nexus-core nexus-core--${mode}`}>
      <Canvas
        camera={{ position: [0, 0, 4.4], fov: 42 }}
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
        <ambientLight intensity={0.65} />
        <GlassCore mode={mode} />
      </Canvas>
    </div>
  )
}

